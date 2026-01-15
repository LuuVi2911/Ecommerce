import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { PrismaService } from 'src/shared/services/prisma.service'
import { redis } from 'src/shared/redis'
import { IsPublic } from 'src/shared/decorators/auth.decorator'
import { SkipThrottle } from '@nestjs/throttler'

/**
 * Health check endpoints for monitoring and load balancers.
 * All endpoints are public and skip rate limiting.
 */
@Controller('health')
@ApiTags('Health')
@IsPublic()
@SkipThrottle()
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Basic health check - returns OK if the server is running
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Server is healthy' })
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  }

  /**
   * Database health check - verifies database connectivity
   */
  @Get('db')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Database health check' })
  @ApiResponse({ status: 200, description: 'Database is connected' })
  @ApiResponse({ status: 503, description: 'Database is unavailable' })
  async healthDb() {
    try {
      await this.prismaService.$queryRaw`SELECT 1`
      return {
        status: 'ok',
        service: 'database',
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        status: 'error',
        service: 'database',
        message: 'Database connection failed',
        timestamp: new Date().toISOString(),
      }
    }
  }

  /**
   * Redis health check - verifies Redis connectivity
   */
  @Get('redis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redis health check' })
  @ApiResponse({ status: 200, description: 'Redis is connected' })
  @ApiResponse({ status: 503, description: 'Redis is unavailable' })
  async healthRedis() {
    try {
      const pong = await redis.ping()
      return {
        status: pong === 'PONG' ? 'ok' : 'error',
        service: 'redis',
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        status: 'error',
        service: 'redis',
        message: 'Redis connection failed',
        timestamp: new Date().toISOString(),
      }
    }
  }

  /**
   * Comprehensive health check - checks all services
   */
  @Get('all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Comprehensive health check' })
  @ApiResponse({ status: 200, description: 'All services status' })
  async healthAll() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ])

    const [dbResult, redisResult] = checks

    const dbStatus = dbResult.status === 'fulfilled' ? dbResult.value : { status: 'error', service: 'database' }
    const redisStatus = redisResult.status === 'fulfilled' ? redisResult.value : { status: 'error', service: 'redis' }

    const allHealthy = dbStatus.status === 'ok' && redisStatus.status === 'ok'

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    }
  }

  private async checkDatabase(): Promise<{ status: string; service: string }> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`
      return { status: 'ok', service: 'database' }
    } catch {
      return { status: 'error', service: 'database' }
    }
  }

  private async checkRedis(): Promise<{ status: string; service: string }> {
    try {
      const pong = await redis.ping()
      return { status: pong === 'PONG' ? 'ok' : 'error', service: 'redis' }
    } catch {
      return { status: 'error', service: 'redis' }
    }
  }
}
