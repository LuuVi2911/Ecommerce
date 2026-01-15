import { Body, Controller, Post } from '@nestjs/common'
import { ZodResponse } from 'nestjs-zod'
import { PresignedUploadFileBodyDTO, PresignedUploadFileResDTO } from 'src/routes/media/media.dto'
import { MediaService } from 'src/routes/media/media.service'
import { IsPublic } from 'src/shared/decorators/auth.decorator'

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('images/upload/presigned-url')
  @ZodResponse({ type: PresignedUploadFileResDTO })
  @IsPublic()
  async createPresignedUrl(@Body() body: PresignedUploadFileBodyDTO) {
    return this.mediaService.getPresignUrl(body)
  }
}
