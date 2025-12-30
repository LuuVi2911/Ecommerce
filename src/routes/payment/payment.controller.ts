import { Controller, Post, Body } from '@nestjs/common'
import { PaymentService } from './payment.service'
import { MessageResDTO } from 'src/shared/dtos/response.dto'
import { ZodResponse } from 'nestjs-zod'
import { Auth } from 'src/shared/decorators/auth.decorator'
import { WebhookPaymentBodyDTO } from 'src/routes/payment/payment.dto'
import { ApiSecurity } from '@nestjs/swagger'

@Controller('payment')
@ApiSecurity('payment-api-key')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('/receiver')
  @ZodResponse({ type: MessageResDTO })
  @Auth(['PaymentAPIKey'])
  receiver(@Body() body: WebhookPaymentBodyDTO) {
    return this.paymentService.receiver(body)
  }
}
