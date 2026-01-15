import { Inject, Injectable } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import {
  CreateBrandBodyType,
  GetBrandsResType,
  UpdateBrandBodyType,
  BrandType,
  BrandIncludeTranslationType,
} from 'src/routes/brand/brand.model'
import { ALL_LANGUAGE_CODE } from 'src/shared/constants/other.constant'
import { SerializeAll } from 'src/shared/constants/serialize.decorator'
import { PaginationQueryType } from 'src/shared/models/request.model'
import { PrismaService } from 'src/shared/services/prisma.service'
import { CacheVersionService } from 'src/shared/services/cache-version.service'
import { CacheKeyService } from 'src/shared/services/cache-key.service'

// Cache TTL: 5 minutes
const BRAND_LIST_CACHE_TTL = 5 * 60 * 1000

@Injectable()
@SerializeAll()
export class BrandRepo {
  constructor(
    private prismaService: PrismaService,
    private readonly cacheVersionService: CacheVersionService,
    private readonly cacheKeyService: CacheKeyService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async list(pagination: PaginationQueryType, languageId: string): Promise<GetBrandsResType> {
    // Only cache pages 1-3
    const shouldCache = this.cacheKeyService.shouldCachePage(pagination.page)

    if (shouldCache) {
      // Get current cache version
      const version = await this.cacheVersionService.getVersion(
        this.cacheVersionService.getBrandListVersionKey(),
      )

      // Generate cache key
      const filters = {} // Brand list may have filters in future
      const cacheKey = this.cacheKeyService.generateBrandListKey({
        version,
        filters,
        languageId,
        page: pagination.page,
        limit: pagination.limit,
      })

      // Check cache first
      const cached = await this.cacheManager.get<GetBrandsResType>(cacheKey)
      if (cached) {
        return cached
      }

      // Query DB and cache result
      const result = await this.queryBrandList(pagination, languageId)
      await this.cacheManager.set(cacheKey, result, BRAND_LIST_CACHE_TTL)
      return result
    }

    // Skip cache for pages > 3, query DB directly
    return this.queryBrandList(pagination, languageId)
  }

  private async queryBrandList(pagination: PaginationQueryType, languageId: string): Promise<GetBrandsResType> {
    const skip = (pagination.page - 1) * pagination.limit
    const take = pagination.limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.brand.count({
        where: {
          deletedAt: null,
        },
      }),
      this.prismaService.brand.findMany({
        where: {
          deletedAt: null,
        },
        include: {
          brandTranslations: {
            where: languageId === ALL_LANGUAGE_CODE ? { deletedAt: null } : { deletedAt: null, languageId },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
    ])
    return {
      data,
      totalItems,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(totalItems / pagination.limit),
    } as any
  }

  findById(id: number, languageId: string): Promise<BrandIncludeTranslationType | null> {
    return this.prismaService.brand.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        brandTranslations: {
          where: languageId === ALL_LANGUAGE_CODE ? { deletedAt: null } : { deletedAt: null, languageId },
        },
      },
    }) as any
  }

  async create({
    createdById,
    data,
  }: {
    createdById: number | null
    data: CreateBrandBodyType
  }): Promise<BrandIncludeTranslationType> {
    const result = await this.prismaService.brand.create({
      data: {
        ...data,
        createdById,
      },
      include: {
        brandTranslations: {
          where: { deletedAt: null },
        },
      },
    })

    // Invalidate brand list caches
    await this.cacheVersionService.invalidateBrandListCaches()

    return result as any
  }

  async update({
    id,
    updatedById,
    data,
  }: {
    id: number
    updatedById: number
    data: UpdateBrandBodyType
  }): Promise<BrandIncludeTranslationType> {
    const result = await this.prismaService.brand.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        ...data,
        updatedById,
      },
      include: {
        brandTranslations: {
          where: { deletedAt: null },
        },
      },
    })

    // Invalidate brand list caches
    await this.cacheVersionService.invalidateBrandListCaches()

    return result as any
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
  ): Promise<BrandType> {
    const result = await (isHard
      ? this.prismaService.brand.delete({
          where: {
            id,
          },
        })
      : this.prismaService.brand.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        }))

    // Invalidate brand list caches
    await this.cacheVersionService.invalidateBrandListCaches()

    return result as any
  }
}
