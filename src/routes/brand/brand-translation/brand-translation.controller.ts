import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ZodResponse } from 'nestjs-zod'
import {
  CreateBrandTranslationBodyDTO,
  GetBrandTranslationDetailResDTO,
  GetBrandTranslationParamsDTO,
  UpdateBrandTranslationBodyDTO,
} from 'src/routes/brand/brand-translation/brand-translation.dto'
import { BrandTranslationService } from 'src/routes/brand/brand-translation/brand-translation.service'
import { ActiveUser } from 'src/shared/decorators/active-user.decorator'
import { MessageResDTO } from 'src/shared/dtos/response.dto'

@Controller('brand-translations')
export class BrandTranslationController {
  constructor(private readonly brandTranslationService: BrandTranslationService) {}

  @Get(':brandTranslationId')
  @ZodResponse({ type: GetBrandTranslationDetailResDTO })
  findById(@Param() params: GetBrandTranslationParamsDTO) {
    return this.brandTranslationService.findById(params.brandTranslationId)
  }

  @Post()
  @ZodResponse({ type: GetBrandTranslationDetailResDTO })
  create(@Body() body: CreateBrandTranslationBodyDTO, @ActiveUser('userId') userId: number) {
    return this.brandTranslationService.create({
      data: body,
      createdById: userId,
    })
  }

  @Put(':brandTranslationId')
  @ZodResponse({ type: GetBrandTranslationDetailResDTO })
  update(
    @Body() body: UpdateBrandTranslationBodyDTO,
    @Param() params: GetBrandTranslationParamsDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return this.brandTranslationService.update({
      data: body,
      id: params.brandTranslationId,
      updatedById: userId,
    })
  }

  @Delete(':brandTranslationId')
  @ZodResponse({ type: MessageResDTO })
  delete(@Param() params: GetBrandTranslationParamsDTO, @ActiveUser('userId') userId: number) {
    return this.brandTranslationService.delete({
      id: params.brandTranslationId,
      deletedById: userId,
    })
  }
}
