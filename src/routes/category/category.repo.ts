import { Inject, Injectable } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import {
  CreateCategoryBodyType,
  GetAllCategoriesResType,
  UpdateCategoryBodyType,
  CategoryType,
  CategoryIncludeTranslationType,
} from 'src/routes/category/category.model'
import { ALL_LANGUAGE_CODE } from 'src/shared/constants/other.constant'
import { SerializeAll } from 'src/shared/constants/serialize.decorator'
import { PrismaService } from 'src/shared/services/prisma.service'
import { CacheVersionService } from 'src/shared/services/cache-version.service'
import { CacheKeyService } from 'src/shared/services/cache-key.service'

// Cache TTL: 5 minutes
const CATEGORY_LIST_CACHE_TTL = 5 * 60 * 1000

@Injectable()
@SerializeAll()
export class CategoryRepo {
  constructor(
    private prismaService: PrismaService,
    private readonly cacheVersionService: CacheVersionService,
    private readonly cacheKeyService: CacheKeyService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async findAll({
    parentCategoryId,
    languageId,
  }: {
    parentCategoryId?: number | null
    languageId: string
  }): Promise<GetAllCategoriesResType> {
    // Get current cache version
    const version = await this.cacheVersionService.getVersion(
      this.cacheVersionService.getCategoryListVersionKey(),
    )

    // Generate cache key (no pagination for categories)
    const filters = { parentCategoryId }
    const cacheKey = this.cacheKeyService.generateCategoryListKey({
      version,
      filters,
      languageId,
    })

    // Check cache first
    const cached = await this.cacheManager.get<GetAllCategoriesResType>(cacheKey)
    if (cached) {
      return cached
    }

    // Query DB and cache result
    const result = await this.queryCategoryList({ parentCategoryId, languageId })
    await this.cacheManager.set(cacheKey, result, CATEGORY_LIST_CACHE_TTL)
    return result
  }

  private async queryCategoryList({
    parentCategoryId,
    languageId,
  }: {
    parentCategoryId?: number | null
    languageId: string
  }): Promise<GetAllCategoriesResType> {
    const categories = await this.prismaService.category.findMany({
      where: {
        deletedAt: null,
        parentCategoryId: parentCategoryId ?? null,
      },
      include: {
        categoryTranslations: {
          where: languageId === ALL_LANGUAGE_CODE ? { deletedAt: null } : { deletedAt: null, languageId },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return {
      data: categories,
      totalItems: categories.length,
    } as any
  }

  findById({ id, languageId }: { id: number; languageId: string }): Promise<CategoryIncludeTranslationType | null> {
    return this.prismaService.category.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        categoryTranslations: {
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
    data: CreateCategoryBodyType
  }): Promise<CategoryIncludeTranslationType> {
    const result = await this.prismaService.category.create({
      data: {
        ...data,
        createdById,
      },
      include: {
        categoryTranslations: {
          where: { deletedAt: null },
        },
      },
    })

    // Invalidate category list caches
    await this.cacheVersionService.invalidateCategoryListCaches()

    return result as any
  }

  async update({
    id,
    updatedById,
    data,
  }: {
    id: number
    updatedById: number
    data: UpdateCategoryBodyType
  }): Promise<CategoryIncludeTranslationType> {
    const result = await this.prismaService.category.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        ...data,
        updatedById,
      },
      include: {
        categoryTranslations: {
          where: { deletedAt: null },
        },
      },
    })

    // Invalidate category list caches
    await this.cacheVersionService.invalidateCategoryListCaches()

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
  ): Promise<CategoryType> {
    const result = await (isHard
      ? this.prismaService.category.delete({
          where: {
            id,
          },
        })
      : this.prismaService.category.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        }))

    // Invalidate category list caches
    await this.cacheVersionService.invalidateCategoryListCaches()

    return result as any
  }
}
