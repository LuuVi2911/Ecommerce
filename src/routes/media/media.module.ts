import { Module } from '@nestjs/common'
import { MediaController } from 'src/routes/media/media.controller'
import { MediaService } from 'src/routes/media/media.service'

@Module({
  providers: [MediaService],
  controllers: [MediaController],
})
export class MediaModule {}
