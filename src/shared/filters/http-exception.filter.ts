import { Logger, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'
import { ZodError as ZodErrorV4 } from 'zod/v4'
import { Request, Response } from 'express'
import { randomUUID } from 'crypto'

/**
 * Enhanced HTTP Exception Filter with:
 * - Request ID tracking for debugging
 * - Production error sanitization
 * - Structured logging with context
 * - Consistent error response format
 */
@Catch(HttpException)
export class HttpExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)
  private readonly isProduction = process.env.NODE_ENV === 'production'

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const request = ctx.getRequest<Request>()
    const response = ctx.getResponse<Response>()

    // Generate or get existing request ID
    const requestId = (request.headers['x-request-id'] as string) || randomUUID()

    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()

    // Log error with context
    this.logError(exception, request, requestId)

    // Handle ZodSerializationException specifically
    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError()
      if (zodError instanceof ZodErrorV4) {
        this.logger.error(`ZodSerializationException: ${zodError.message}`, { requestId })
      }
    }

    // Build error response
    const errorResponse = this.buildErrorResponse(status, exceptionResponse, requestId, request.url)

    // Send response
    response.status(status).json(errorResponse)
  }

  private logError(exception: HttpException, request: Request, requestId: string): void {
    const status = exception.getStatus()
    const message = exception.message

    const logContext = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: status,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    }

    // Log at appropriate level based on status code
    if (status >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} - ${status} - ${message}`,
        exception.stack,
        logContext,
      )
    } else if (status >= (HttpStatus.BAD_REQUEST as number)) {
      this.logger.warn(`[${requestId}] ${request.method} ${request.url} - ${status} - ${message}`, logContext)
    }
  }

  private buildErrorResponse(
    status: number,
    exceptionResponse: string | object,
    requestId: string,
    path: string,
  ): object {
    const timestamp = new Date().toISOString()

    // Extract message from exception response
    let message: string | string[]
    let errorDetails: unknown

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse
    } else if (typeof exceptionResponse === 'object') {
      const responseObj = exceptionResponse as Record<string, unknown>
      message = (responseObj.message as string | string[]) || 'An error occurred'
      errorDetails = responseObj.error
    } else {
      message = 'An error occurred'
    }

    // Sanitize error message in production for server errors
    if (this.isProduction && status >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      message = 'Internal server error'
      errorDetails = undefined
    }

    const response: Record<string, unknown> = {
      statusCode: status,
      message,
      requestId,
      timestamp,
      path,
    }

    if (errorDetails && !this.isProduction) {
      response.error = errorDetails
    }

    return response
  }
}
