import { Injectable } from '@nestjs/common'
import { OrderStatus, Prisma } from 'src/generated/prisma/client'
import {
  CannotCancelOrderException,
  NotFoundCartItemException,
  OrderNotFoundException,
  OutOfStockSKUException,
  ProductNotFoundException,
  SKUNotBelongToShopException,
} from 'src/routes/order/order.error'
import {
  CancelOrderResType,
  CreateOrderBodyType,
  CreateOrderResType,
  GetOrderDetailResType,
  GetOrderListQueryType,
  GetOrderListResType,
} from 'src/routes/order/order.model'
import { OrderProducer } from 'src/routes/order/order.producer'
import { PaymentStatus } from 'src/shared/constants/payment.constant'
import { SerializeAll } from 'src/shared/constants/serialize.decorator'
import { VersionConflictException } from 'src/shared/error'
import { isNotFoundPrismaError } from 'src/shared/helpers'
import { redlock } from 'src/shared/redis'
import { PrismaService } from 'src/shared/services/prisma.service'

@Injectable()
@SerializeAll()
export class OrderRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private orderProducer: OrderProducer,
  ) {}
  async list(userId: number, query: GetOrderListQueryType): Promise<GetOrderListResType> {
    const { page, limit, status } = query
    const skip = (page - 1) * limit
    const take = limit
    const where: Prisma.OrderWhereInput = {
      userId,
      status,
    }

    // count total number of orders
    const totalItem$ = this.prismaService.order.count({
      where,
    })
    // get list of orders
    const data$ = this.prismaService.order.findMany({
      where,
      include: {
        items: true,
      },
      skip,
      take,
      orderBy: {
        createdAt: 'desc',
      },
    })
    const [data, totalItems] = await Promise.all([data$, totalItem$])
    return {
      data,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    } as any
  }

  async create(
    userId: number,
    body: CreateOrderBodyType,
  ): Promise<{
    paymentId: number
    orders: CreateOrderResType['orders']
  }> {
    // 1. check if all cartItemIds exist in database
    // 2. check if the quantity is greater than the stock
    // 3. check if all products are deleted or hidden
    // 4. check if all skuIds in cartItem are belong to the shopid sent
    // 5. create order
    // 6. delete cartItem
    const allBodyCartItemIds = body.map((item) => item.cartItemIds).flat()
    const cartItemsForSKUId = await this.prismaService.cartItem.findMany({
      where: {
        id: {
          in: allBodyCartItemIds,
        },
        userId,
      },
      select: {
        skuId: true,
      },
    })
    const skuIds = cartItemsForSKUId.map((cartItem) => cartItem.skuId)

    // lock all SKUs that need to be bought
    const locks = await Promise.all(skuIds.map((skuId) => redlock.acquire([`lock:sku:${skuId}`], 3000)))

    try {
      const [paymentId, orders] = await this.prismaService.$transaction<[number, CreateOrderResType['orders']]>(
        async (tx) => {
          // await tx.$queryRaw`SELECT * FROM "SKU" WHERE id IN (${Prisma.join(skuIds)}) FOR UPDATE`
          const cartItems = await tx.cartItem.findMany({
            where: {
              id: {
                in: allBodyCartItemIds,
              },
              userId,
            },
            include: {
              sku: {
                include: {
                  product: {
                    include: {
                      productTranslations: true,
                    },
                  },
                },
              },
            },
          })

          // 1. check if all cartItemIds exist in database
          if (cartItems.length !== allBodyCartItemIds.length) {
            throw NotFoundCartItemException
          }

          // 2. check if the quantity is greater than the stock
          const isOutOfStock = cartItems.some((item) => {
            return item.sku.stock < item.quantity
          })
          if (isOutOfStock) {
            throw OutOfStockSKUException
          }

          // 3. check if all products are deleted or hidden
          const isExistNotReadyProduct = cartItems.some(
            (item) =>
              item.sku.product.deletedAt !== null ||
              item.sku.product.publishedAt === null ||
              item.sku.product.publishedAt > new Date(),
          )
          if (isExistNotReadyProduct) {
            throw ProductNotFoundException
          }

          // 4. check if all skuIds in cartItem are belong to the shopid sent
          const cartItemMap = new Map<number, (typeof cartItems)[0]>()
          cartItems.forEach((item) => {
            cartItemMap.set(item.id, item)
          })
          const isValidShop = body.every((item) => {
            const bodyCartItemIds = item.cartItemIds
            return bodyCartItemIds.every((cartItemId) => {
              // if we have reached this step, cartItem always has a value
              // because we have compared with allBodyCartItems.length above
              const cartItem = cartItemMap.get(cartItemId)!
              return item.shopId === cartItem.sku.createdById
            })
          })
          if (!isValidShop) {
            throw SKUNotBelongToShopException
          }

          // 5. create order and delete cartItem in transaction to ensure data integrity

          const payment = await tx.payment.create({
            data: {
              status: PaymentStatus.PENDING,
            },
          })
          const orders: CreateOrderResType['orders'] = []
          for (const item of body) {
            const order = await tx.order.create({
              data: {
                userId,
                status: OrderStatus.PENDING_PAYMENT,
                receiver: item.receiver,
                createdById: userId,
                shopId: item.shopId,
                paymentId: payment.id,
                items: {
                  create: item.cartItemIds.map((cartItemId) => {
                    const cartItem = cartItemMap.get(cartItemId)!
                    return {
                      productName: cartItem.sku.product.name,
                      skuPrice: cartItem.sku.price,
                      image: cartItem.sku.image,
                      skuId: cartItem.sku.id,
                      skuValue: cartItem.sku.value,
                      quantity: cartItem.quantity,
                      productId: cartItem.sku.product.id,
                      productTranslations: cartItem.sku.product.productTranslations.map((translation) => {
                        return {
                          id: translation.id,
                          name: translation.name,
                          description: translation.description,
                          languageId: translation.languageId,
                        }
                      }),
                    }
                  }),
                },
                products: {
                  connect: item.cartItemIds.map((cartItemId) => {
                    const cartItem = cartItemMap.get(cartItemId)!
                    return {
                      id: cartItem.sku.product.id,
                    }
                  }),
                },
              },
            })
            orders.push(order as any)
          }

          await tx.cartItem.deleteMany({
            where: {
              id: {
                in: allBodyCartItemIds,
              },
            },
          })
          for (const item of cartItems) {
            await tx.sKU
              .update({
                where: {
                  id: item.sku.id,
                  updatedAt: item.sku.updatedAt, // ensure no one updates SKU while we are processing
                  stock: {
                    gte: item.quantity, // ensure the stock is enough to subtract
                  },
                },
                data: {
                  stock: {
                    decrement: item.quantity,
                  },
                },
              })
              .catch((e) => {
                if (isNotFoundPrismaError(e)) {
                  throw VersionConflictException
                }
                throw e
              })
          }
          await this.orderProducer.addCancelPaymentJob(payment.id)
          return [payment.id, orders]
        },
      )

      return {
        paymentId,
        orders,
      }
    } finally {
      // release Lock
      await Promise.all(locks.map((lock) => lock.release().catch(() => {})))
    }
  }

  async detail(userId: number, orderid: number): Promise<GetOrderDetailResType> {
    const order = await this.prismaService.order.findUnique({
      where: {
        id: orderid,
        userId,
        deletedAt: null,
      },
      include: {
        items: true,
      },
    })
    if (!order) {
      throw OrderNotFoundException
    }
    return order as any
  }

  async cancel(userId: number, orderId: number): Promise<CancelOrderResType> {
    try {
      const order = await this.prismaService.order.findUniqueOrThrow({
        where: {
          id: orderId,
          userId,
          deletedAt: null,
        },
      })
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw CannotCancelOrderException
      }
      const updatedOrder = await this.prismaService.order.update({
        where: {
          id: orderId,
          userId,
          deletedAt: null,
        },
        data: {
          status: OrderStatus.CANCELLED,
          updatedById: userId,
        },
      })
      return updatedOrder as any
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw OrderNotFoundException
      }
      throw error
    }
  }
}
