import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import envConfig from 'src/shared/config'

/**
 * Guard that validates API key for payment-related endpoints.
 * The API key should be provided in the 'authorization' header.
 */
@Injectable()
export class PaymentAPIKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const apiKey = request.headers['authorization']

    if (!apiKey || apiKey !== envConfig.PAYMENT_API_KEY) {
      throw new UnauthorizedException('Invalid API key')
    }

    return true
  }
}
