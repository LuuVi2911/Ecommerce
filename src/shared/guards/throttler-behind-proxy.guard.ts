import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { Request } from 'express'

/**
 * Extended ThrottlerGuard that properly handles requests from behind a proxy.
 * Uses X-Forwarded-For header to get the real client IP address.
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    // Use X-Forwarded-For header if available, otherwise use req.ip
    const forwardedFor = req.headers['x-forwarded-for']
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, use the first one (original client)
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0]
      return Promise.resolve(ips.trim())
    }
    return Promise.resolve(req.ip || req.socket.remoteAddress || 'unknown')
  }
}
