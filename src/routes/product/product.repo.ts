import { Inject, Injectable } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { Prisma } from 'src/generated/prisma/client'
import {
  CreateProductBodyType,
  GetProductDetailResType,
  GetProductsResType,
  UpdateProductBodyType,
} from 'src/routes/product/product.model'
import { ALL_LANGUAGE_CODE, OrderByType, SortBy, SortByType } from 'src/shared/constants/other.constant'
import { SerializeAll } from 'src/shared/constants/serialize.decorator'
import { ProductType } from 'src/shared/models/shared-product.model'
import { PrismaService } from 'src/shared/services/prisma.service'
import { CacheVersionService } from 'src/shared/services/cache-version.service'
import { CacheKeyService } from 'src/shared/services/cache-key.service'

// Cache TTL: 5 minutes
const PRODUCT_LIST_CACHE_TTL = 5 * 60 * 1000

@Injectable()
@SerializeAll()
export class ProductRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheVersionService: CacheVersionService,
    private readonly cacheKeyService: CacheKeyService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async list({
    limit,
    page,
    name,
    brandIds,
    categories,
    minPrice,
    maxPrice,
    createdById,
    isPublic,
    languageId,
    orderBy,
    sortBy,
  }: {
    limit: number
    page: number
    name?: string
    brandIds?: number[]
    categories?: number[]
    minPrice?: number
    maxPrice?: number
    createdById?: number
    isPublic?: boolean
    languageId: string
    orderBy: OrderByType
    sortBy: SortByType
  }): Promise<GetProductsResType> {
    // Only cache pages 1-3 for public product listings
    const shouldCache = isPublic === true && this.cacheKeyService.shouldCachePage(page)

    if (shouldCache) {
      // Get current cache version
      const version = await this.cacheVersionService.getVersion(
        this.cacheVersionService.getProductListVersionKey(),
      )

      // Generate cache key from query params
      const filters = { name, brandIds, categories, minPrice, maxPrice, createdById, isPublic, orderBy, sortBy }
      const cacheKey = this.cacheKeyService.generateProductListKey({
        version,
        filters,
        languageId,
        page,
        limit,
      })

      // Check cache first
      const cached = await this.cacheManager.get<GetProductsResType>(cacheKey)
      if (cached) {
        return cached
      }

      // Query DB and cache result
      const result = await this.queryProductList({
        limit,
        page,
        name,
        brandIds,
        categories,
        minPrice,
        maxPrice,
        createdById,
        isPublic,
        languageId,
        orderBy,
        sortBy,
      })

      await this.cacheManager.set(cacheKey, result, PRODUCT_LIST_CACHE_TTL)
      return result
    }

    // Skip cache for pages > 3 or non-public requests, query DB directly
    return this.queryProductList({
      limit,
      page,
      name,
      brandIds,
      categories,
      minPrice,
      maxPrice,
      createdById,
      isPublic,
      languageId,
      orderBy,
      sortBy,
    })
  }

  private async queryProductList({
    limit,
    page,
    name,
    brandIds,
    categories,
    minPrice,
    maxPrice,
    createdById,
    isPublic,
    languageId,
    orderBy,
    sortBy,
  }: {
    limit: number
    page: number
    name?: string
    brandIds?: number[]
    categories?: number[]
    minPrice?: number
    maxPrice?: number
    createdById?: number
    isPublic?: boolean
    languageId: string
    orderBy: OrderByType
    sortBy: SortByType
  }): Promise<GetProductsResType> {
    const skip = (page - 1) * limit
    const take = limit
    let where: Prisma.ProductWhereInput = {
      deletedAt: null,
      createdById: createdById ? createdById : undefined,
    }
    if (isPublic === true) {
      where.publishedAt = {
        lte: new Date(),
        not: null,
      }
    } else if (isPublic === false) {
      where = {
        ...where,
        OR: [{ publishedAt: null }, { publishedAt: { gt: new Date() } }],
      }
    }
    if (name) {
      where.name = {
        contains: name,
        mode: 'insensitive',
      }
    }
    if (brandIds && brandIds.length > 0) {
      where.brandId = {
        in: brandIds,
      }
    }
    if (categories && categories.length > 0) {
      where.categories = {
        some: {
          id: {
            in: categories,
          },
        },
      }
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePrice = {
        gte: minPrice,
        lte: maxPrice,
      }
    }
    // default sort by createdAt newest
    let caculatedOrderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = {
      createdAt: orderBy,
    }
    if (sortBy === SortBy.Price) {
      caculatedOrderBy = {
        basePrice: orderBy,
      }
    } else if (sortBy === SortBy.Sale) {
      caculatedOrderBy = {
        orders: {
          _count: orderBy,
        },
      }
    }
    const [totalItems, data] = await Promise.all([
      this.prismaService.product.count({
        where,
      }),
      this.prismaService.product.findMany({
        where,
        include: {
          productTranslations: {
            where: languageId === ALL_LANGUAGE_CODE ? { deletedAt: null } : { languageId, deletedAt: null },
          },
          orders: {
            where: {
              deletedAt: null,
              status: 'DELIVERED',
            },
          },
        },
        orderBy: caculatedOrderBy,
        skip,
        take,
      }),
    ])
    return {
      data,
      totalItems,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalItems / limit),
    } as any
  }

  findById(productId: number): Promise<ProductType | null> {
    return this.prismaService.product.findUnique({
      where: {
        id: productId,
        deletedAt: null,
      },
    }) as any
  }

  getDetail({
    productId,
    languageId,
    isPublic,
  }: {
    productId: number
    languageId: string
    isPublic?: boolean
  }): Promise<GetProductDetailResType | null> {
    let where: Prisma.ProductWhereUniqueInput = {
      id: productId,
      deletedAt: null,
    }
    if (isPublic === true) {
      where.publishedAt = {
        lte: new Date(),
        not: null,
      }
    } else if (isPublic === false) {
      where = {
        ...where,
        OR: [{ publishedAt: null }, { publishedAt: { gt: new Date() } }],
      }
    }
    return this.prismaService.product.findUnique({
      where,
      include: {
        productTranslations: {
          where: languageId === ALL_LANGUAGE_CODE ? { deletedAt: null } : { languageId, deletedAt: null },
        },
        skus: {
          where: {
            deletedAt: null,
          },
        },
        brand: {
          include: {
            brandTranslations: {
              where: languageId === ALL_LANGUAGE_CODE ? { deletedAt: null } : { languageId, deletedAt: null },
            },
          },
        },
        categories: {
          where: {
            deletedAt: null,
          },
          include: {
            categoryTranslations: {
              where: languageId === ALL_LANGUAGE_CODE ? { deletedAt: null } : { languageId, deletedAt: null },
            },
          },
        },
      },
    }) as any
  }

  async create({
    createdById,
    data,
  }: {
    createdById: number
    data: CreateProductBodyType
  }): Promise<GetProductDetailResType> {
    const { skus, categories, ...productData } = data
    const result = await this.prismaService.product.create({
      data: {
        createdById,
        ...productData,
        categories: {
          connect: categories.map((category) => ({ id: category })),
        },
        skus: {
          createMany: {
            data: skus.map((sku) => ({
              ...sku,
              createdById,
            })),
          },
        },
      },
      include: {
        productTranslations: {
          where: { deletedAt: null },
        },
        skus: {
          where: { deletedAt: null },
        },
        brand: {
          include: {
            brandTranslations: {
              where: { deletedAt: null },
            },
          },
        },
        categories: {
          where: {
            deletedAt: null,
          },
          include: {
            categoryTranslations: {
              where: { deletedAt: null },
            },
          },
        },
      },
    })

    // Invalidate product list caches
    await this.cacheVersionService.invalidateProductListCaches()

    return result as any
  }

  async update({
    id,
    updatedById,
    data,
  }: {
    id: number
    updatedById: number
    data: UpdateProductBodyType
  }): Promise<ProductType> {
    const { skus: dataSkus, categories, ...productData } = data
    // SKU already exists in DB but not in data payload will be deleted
    // SKU already exists in DB but in data payload will be updated
    // SKU does not exist in DB but in data payload will be created

    // 1. get list of existing SKUs in DB
    const existingSKUs = await this.prismaService.sKU.findMany({
      where: {
        productId: id,
        deletedAt: null,
      },
    })

    // 2. find SKUs to delete (exists in DB but not in data payload)
    const skusToDelete = existingSKUs.filter((sku) => dataSkus.every((dataSku) => dataSku.value !== sku.value))
    const skuIdsToDelete = skusToDelete.map((sku) => sku.id)

    // 3. map ID into data payload
    const skusWithId = dataSkus.map((dataSku) => {
      const existingSku = existingSKUs.find((existingSKU) => existingSKU.value === dataSku.value)
      return {
        ...dataSku,
        id: existingSku ? existingSku.id : null,
      }
    })

    // 4. find SKUs to update
    const skusToUpdate = skusWithId.filter((sku) => sku.id !== null)

    // 5. find SKUs to create
    const skusToCreate = skusWithId
      .filter((sku) => sku.id === null)
      .map((sku) => {
        const { id: skuId, ...data } = sku
        return {
          ...data,
          productId: id,
          createdById: updatedById,
        }
      })
    const [product] = await this.prismaService.$transaction([
      // update Product
      this.prismaService.product.update({
        where: {
          id,
          deletedAt: null,
        },
        data: {
          ...productData,
          updatedById,
          categories: {
            connect: categories.map((category) => ({ id: category })),
          },
        },
      }),
      // soft delete SKUs that are not in data payload
      this.prismaService.sKU.updateMany({
        where: {
          id: {
            in: skuIdsToDelete,
          },
        },
        data: {
          deletedAt: new Date(),
          deletedById: updatedById,
        },
      }),
      // update SKUs that are in data payload
      ...skusToUpdate.map((sku) =>
        this.prismaService.sKU.update({
          where: {
            id: sku.id as number,
          },
          data: {
            value: sku.value,
            price: sku.price,
            stock: sku.stock,
            image: sku.image,
            updatedById,
          },
        }),
      ),
      // create new SKUs that are not in DB
      this.prismaService.sKU.createMany({
        data: skusToCreate,
      }),
    ])

    // Invalidate product list caches (product update or SKU stock changes)
    await this.cacheVersionService.invalidateProductListCaches()

    return product as any
  }

  async delete(
    {
      id,
      deletedById,
    }: {
      id: number
      deletedById: number
    },
    isHard?: boolean,
  ): Promise<ProductType> {
    let product: ProductType

    if (isHard) {
      product = (await this.prismaService.product.delete({
        where: {
          id,
        },
      })) as any
    } else {
      const now = new Date()
      const [deletedProduct] = await Promise.all([
        this.prismaService.product.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: now,
            deletedById,
          },
        }),
        this.prismaService.productTranslation.updateMany({
          where: {
            productId: id,
            deletedAt: null,
          },
          data: {
            deletedAt: now,
            deletedById,
          },
        }),
        this.prismaService.sKU.updateMany({
          where: {
            productId: id,
            deletedAt: null,
          },
          data: {
            deletedAt: now,
            deletedById,
          },
        }),
      ])
      product = deletedProduct as any
    }

    // Invalidate product list caches
    await this.cacheVersionService.invalidateProductListCaches()

    return product
  }
}
