import { Injectable } from '@nestjs/common'
import { redis } from 'src/shared/redis'

/**
 * CacheVersionService manages cache version numbers for efficient cache invalidation.
 *
 * Strategy: Instead of scanning Redis keyspace to delete stale cache entries,
 * we increment a version number. All cache keys include this version number,
 * so incrementing it makes all existing cache entries stale (cache misses).
 * Old entries naturally expire via TTL, no manual cleanup needed.
 *
 * Benefits:
 * - O(1) invalidation - just increment a single Redis key
 * - Scalable - works efficiently at any scale
 * - Atomic operations prevent race conditions
 */
@Injectable()
export class CacheVersionService {
  private static readonly VERSION_KEYS = {
    PRODUCT_LIST: 'product:list:version',
    BRAND_LIST: 'brand:list:version',
    CATEGORY_LIST: 'category:list:version',
  } as const

  /**
   * Get current version number for a cache type
   * @param key - The version key (e.g., 'product:list:version')
   * @returns The current version number (defaults to 1 if not set)
   */
  async getVersion(key: string): Promise<number> {
    const version = await redis.get(key)
    return version ? parseInt(version, 10) : 1
  }

  /**
   * Atomically increment version number
   * @param key - The version key to increment
   * @returns The new version number after increment
   */
  async incrementVersion(key: string): Promise<number> {
    const newVersion = await redis.incr(key)
    return newVersion
  }

  /**
   * Invalidate all product list caches by incrementing version
   * Call this when: product create/update/delete, SKU stock changes
   */
  async invalidateProductListCaches(): Promise<void> {
    await this.incrementVersion(CacheVersionService.VERSION_KEYS.PRODUCT_LIST)
  }

  /**
   * Invalidate all brand list caches by incrementing version
   * Call this when: brand create/update/delete
   */
  async invalidateBrandListCaches(): Promise<void> {
    await this.incrementVersion(CacheVersionService.VERSION_KEYS.BRAND_LIST)
  }

  /**
   * Invalidate all category list caches by incrementing version
   * Call this when: category create/update/delete
   */
  async invalidateCategoryListCaches(): Promise<void> {
    await this.incrementVersion(CacheVersionService.VERSION_KEYS.CATEGORY_LIST)
  }

  /**
   * Get the product list version key
   */
  getProductListVersionKey(): string {
    return CacheVersionService.VERSION_KEYS.PRODUCT_LIST
  }

  /**
   * Get the brand list version key
   */
  getBrandListVersionKey(): string {
    return CacheVersionService.VERSION_KEYS.BRAND_LIST
  }

  /**
   * Get the category list version key
   */
  getCategoryListVersionKey(): string {
    return CacheVersionService.VERSION_KEYS.CATEGORY_LIST
  }
}
