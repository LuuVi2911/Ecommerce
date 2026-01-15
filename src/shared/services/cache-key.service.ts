import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'

/**
 * CacheKeyService provides utilities for generating consistent cache keys.
 *
 * Key format: {module}:{action}:v3:{version}:{hash(filters)}:{languageId}:{page}:{limit}
 *
 * Examples:
 * - product:list:v3:42:a1b2c3d4:en:1:10
 * - brand:list:v3:15:e5f6g7h8:vi:1:20
 * - category:list:v3:8:i9j0k1l2:en
 */
@Injectable()
export class CacheKeyService {
  private static readonly CACHE_VERSION_FORMAT = 'v3'
  private static readonly MAX_CACHED_PAGE = 3

  /**
   * Generate a hash from filter parameters
   * Uses MD5 for speed (security not critical for cache keys)
   */
  hashFilters(filters: Record<string, unknown>): string {
    const sortedFilters = this.sortObjectKeys(filters)
    const filterString = JSON.stringify(sortedFilters)
    return createHash('md5').update(filterString).digest('hex').substring(0, 8)
  }

  /**
   * Sort object keys for consistent hashing
   */
  private sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {}
    const keys = Object.keys(obj).sort()
    for (const key of keys) {
      const value = obj[key]
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          sorted[key] = [...value].sort()
        } else if (typeof value === 'object') {
          sorted[key] = this.sortObjectKeys(value as Record<string, unknown>)
        } else {
          sorted[key] = value
        }
      }
    }
    return sorted
  }

  /**
   * Check if a page should be cached (only pages 1-3)
   */
  shouldCachePage(page: number): boolean {
    return page <= CacheKeyService.MAX_CACHED_PAGE
  }

  /**
   * Generate cache key for product list
   */
  generateProductListKey({
    version,
    filters,
    languageId,
    page,
    limit,
  }: {
    version: number
    filters: Record<string, unknown>
    languageId: string
    page: number
    limit: number
  }): string {
    const filterHash = this.hashFilters(filters)
    return `product:list:${CacheKeyService.CACHE_VERSION_FORMAT}:${version}:${filterHash}:${languageId}:${page}:${limit}`
  }

  /**
   * Generate cache key for brand list
   */
  generateBrandListKey({
    version,
    filters,
    languageId,
    page,
    limit,
  }: {
    version: number
    filters: Record<string, unknown>
    languageId: string
    page: number
    limit: number
  }): string {
    const filterHash = this.hashFilters(filters)
    return `brand:list:${CacheKeyService.CACHE_VERSION_FORMAT}:${version}:${filterHash}:${languageId}:${page}:${limit}`
  }

  /**
   * Generate cache key for category list
   * Note: Category list doesn't use pagination
   */
  generateCategoryListKey({
    version,
    filters,
    languageId,
  }: {
    version: number
    filters: Record<string, unknown>
    languageId: string
  }): string {
    const filterHash = this.hashFilters(filters)
    return `category:list:${CacheKeyService.CACHE_VERSION_FORMAT}:${version}:${filterHash}:${languageId}`
  }
}
