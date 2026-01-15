import { Injectable } from '@nestjs/common'
import { S3Service } from 'src/shared/services/s3.service'
import { generateRandomFilename } from 'src/shared/helpers'
import { PresignedUploadFileBodyType } from 'src/routes/media/media.model'

@Injectable()
export class MediaService {
  constructor(private readonly s3Service: S3Service) {}

  async getPresignUrl(body: PresignedUploadFileBodyType) {
    const randomFilename = generateRandomFilename(body.filename)
    const filename = 'images/' + randomFilename
    const presignedUrl = await this.s3Service.createPresignedUrlWithClient(filename)
    const url = presignedUrl.split('?')[0]
    return {
      presignedUrl,
      url,
    }
  }
}
