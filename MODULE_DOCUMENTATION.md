# E-Commerce API Module Documentation

This document provides a detailed explanation of how the **Product**, **Cart**, **Order**, and **Payment** modules work, including their service logic, queue implementation, and inter-module relationships.

---

## Table of Contents

1. [Product Module (Core Module)](#1-product-module-core-module)
2. [Cart Module](#2-cart-module)
3. [Order Module](#3-order-module)
4. [Payment Module](#4-payment-module)
5. [Queue System](#5-queue-system)

---

## 1. Product Module (Core Module)

The Product module is the **core module** of this e-commerce API. It manages products, their variants (SKUs), translations, and relationships with brands and categories.

### 1.1 Architecture Overview

```
Product
├── Product (Base Entity)
│   ├── name, basePrice, virtualPrice
│   ├── images, variants (JSON)
│   ├── publishedAt (for scheduling)
│   └── brandId, createdById
├── ProductTranslation (Multi-language support)
│   ├── name, description
│   └── languageId
├── SKU (Stock Keeping Unit - Product Variants)
│   ├── value (e.g., "Red-Large", "Blue-Small")
│   ├── price, stock, image
│   └── productId
└── Relationships
    ├── Brand (many-to-one)
    ├── Categories (many-to-many)
    └── Orders (one-to-many)
```

### 1.2 Key Concepts

#### **Product Variants System**

Products can have multiple variants (e.g., Size: S, M, L and Color: Red, Blue). The system uses a **variants JSON structure** to define these options:

```typescript
variants: [
  { name: "Size", options: ["S", "M", "L"] },
  { name: "Color", options: ["Red", "Blue"] }
]
```

From this, the system **automatically generates all SKU combinations**:
- "S-Red"
- "S-Blue"
- "M-Red"
- "M-Blue"
- "L-Red"
- "L-Blue"

Each SKU has its own:
- `price` (can differ from base price)
- `stock` (inventory count)
- `image` (variant-specific image)

#### **Internationalization (I18n)**

Products support multiple languages through `ProductTranslation`:
- Each product can have translations for different languages
- When fetching products, the system filters translations based on `I18nContext.current()?.lang`
- Supports fallback to all languages if needed (`ALL_LANGUAGE_CODE`)

#### **Product Visibility**

Products have a `publishedAt` field that controls visibility:
- `publishedAt = null`: Product is draft (not visible to public)
- `publishedAt <= now()`: Product is published (visible)
- `publishedAt > now()`: Product is scheduled (not yet visible)

### 1.3 Service Logic

#### **ProductService** (Public API)

**Location:** `src/routes/product/product.service.ts`

**Purpose:** Handles public-facing product queries (for customers/guests)

**Key Methods:**

1. **`list()`** - Get paginated list of published products
   ```typescript
   async list(props: { query: GetProductsQueryType }) {
     const data = await this.productRepo.list({
       page: props.query.page,
       limit: props.query.limit,
       languageId: I18nContext.current()?.lang as string,
       isPublic: true,  // Only published products
       brandIds: props.query.brandIds,
       minPrice: props.query.minPrice,
       maxPrice: props.query.maxPrice,
       categories: props.query.categories,
       name: props.query.name,
       orderBy: props.query.orderBy,
       sortBy: props.query.sortBy,
     })
     return data
   }
   ```

   **Features:**
   - Filters only published products (`isPublic: true`)
   - Supports filtering by brand, category, price range, name
   - Supports sorting by: Created Date, Price, Sales Count
   - Returns localized product names/descriptions

2. **`getDetail()`** - Get single product details
   ```typescript
   async getDetail(props: { productId: number }) {
     const product = await this.productRepo.getDetail({
       productId: props.productId,
       languageId: I18nContext.current()?.lang as string,
       isPublic: true,
     })
     if (!product) {
       throw NotFoundRecordException
     }
     return product
   }
   ```

   **Returns:**
   - Product details with translations
   - All SKUs (variants) with stock/price
   - Brand with translations
   - Categories with translations

#### **ManageProductService** (Admin/Seller API)

**Location:** `src/routes/product/manage-product.service.ts`

**Purpose:** Handles product management for sellers and admins

**Key Features:**

1. **Privilege Validation**
   ```typescript
   validatePrivilege({
     userIdRequest,
     roleNameRequest,
     createdById,
   }) {
     // Only product creator or admin can manage
     if (userIdRequest !== createdById && roleNameRequest !== RoleName.Admin) {
       throw new ForbiddenException()
     }
     return true
   }
   ```

2. **`list()`** - Get products for a shop (with visibility filter)
   - Can filter by `isPublic` (published/draft/scheduled)
   - Requires `createdById` query param
   - Validates user has permission to view shop's products

3. **`create()`** - Create new product
   - Creates product with variants
   - Generates SKUs from variant combinations
   - Links to brand and categories

4. **`update()`** - Update product
   - **Complex SKU Management Logic:**
     ```typescript
     // 1. Get existing SKUs
     const existingSKUs = await this.prismaService.sKU.findMany({
       where: { productId: id, deletedAt: null }
     })

     // 2. Find SKUs to delete (in DB but not in payload)
     const skusToDelete = existingSKUs.filter(
       (sku) => dataSkus.every((dataSku) => dataSku.value !== sku.value)
     )

     // 3. Find SKUs to update (in both DB and payload)
     const skusToUpdate = skusWithId.filter((sku) => sku.id !== null)

     // 4. Find SKUs to create (in payload but not in DB)
     const skusToCreate = skusWithId.filter((sku) => sku.id === null)
     ```
   - Uses **transaction** to ensure atomicity
   - Updates product, deletes old SKUs, updates existing SKUs, creates new SKUs

5. **`delete()`** - Soft delete product
   - Sets `deletedAt` on product, translations, and SKUs
   - Preserves data for order history

### 1.4 Repository Logic (`ProductRepo`)

**Location:** `src/routes/product/product.repo.ts`

**Key Query Features:**

1. **Advanced Filtering**
   ```typescript
   // Filter by publication status
   if (isPublic === true) {
     where.publishedAt = { lte: new Date(), not: null }
   } else if (isPublic === false) {
     where = {
       ...where,
       OR: [
         { publishedAt: null },
         { publishedAt: { gt: new Date() } }
       ]
     }
   }
   ```

2. **Dynamic Sorting**
   ```typescript
   // Sort by Price
   if (sortBy === SortBy.Price) {
     orderBy = { basePrice: orderBy }
   }
   // Sort by Sales Count
   else if (sortBy === SortBy.Sale) {
     orderBy = {
       orders: { _count: orderBy }
     }
   }
   ```

3. **Translation Filtering**
   ```typescript
   productTranslations: {
     where: languageId === ALL_LANGUAGE_CODE
       ? { deletedAt: null }
       : { languageId, deletedAt: null }
   }
   ```

### 1.5 Why Product is the Core Module

1. **Central Entity**: Products are referenced by:
   - Cart (users add products to cart)
   - Orders (orders contain products)
   - Reviews (reviews are for products)
   - Categories & Brands (organizational structure)

2. **Complex Business Logic**:
   - Variant generation
   - Inventory management (SKU stock)
   - Multi-language support
   - Visibility scheduling

3. **Data Integrity**:
   - Soft deletes preserve order history
   - Transactions ensure consistency
   - Stock management prevents overselling

---

## 2. Cart Module

The Cart module manages user shopping carts, allowing users to add, update, and remove items before checkout.

### 2.1 Architecture

```
CartItem
├── userId (who owns the cart)
├── skuId (which product variant)
├── quantity (how many)
└── Relationships
    └── SKU → Product (for product details)
```

### 2.2 Service Logic (`CartService`)

**Location:** `src/routes/cart/cart.service.ts`

**Key Methods:**

1. **`getCart()`** - Retrieve user's cart
   - Groups items by shop (seller)
   - Returns paginated results
   - Includes product translations based on user's language

2. **`addToCart()`** - Add item to cart
   - Uses **upsert** logic (create or update quantity)
   - Validates SKU availability

3. **`updateCartItem()`** - Update cart item quantity
   - Validates new quantity doesn't exceed stock

4. **`deleteCart()`** - Remove items from cart
   - Supports bulk deletion

### 2.3 Repository Logic (`CartRepo`)

**Location:** `src/routes/cart/cart.repo.ts`

#### **SKU Validation (`validateSKU`)**

Before adding/updating cart items, the system validates:

```typescript
private async validateSKU({
  skuId,
  quantity,
  userId,
  isCreate,
}) {
  // 1. Check if SKU exists
  const sku = await this.prismaService.sKU.findUnique({
    where: { id: skuId, deletedAt: null },
    include: { product: true }
  })
  if (!sku) throw NotFoundSKUException

  // 2. Check if adding to existing cart item would exceed stock
  const cartItem = await this.prismaService.cartItem.findUnique({
    where: { userId_skuId: { userId, skuId } }
  })
  if (cartItem && isCreate && quantity + cartItem.quantity > sku.stock) {
    throw InvalidQuantityException
  }

  // 3. Check stock availability
  if (sku.stock < 1 || sku.stock < quantity) {
    throw OutOfStockSKUException
  }

  // 4. Check product is published and not deleted
  if (
    product.deletedAt !== null ||
    product.publishedAt === null ||
    product.publishedAt > new Date()
  ) {
    throw ProductNotFoundException
  }
}
```

#### **Cart Listing (`list2`)**

Uses **raw SQL query** for performance:

```typescript
async list2({ userId, languageId, page, limit }) {
  // Groups cart items by shop (createdById)
  // Uses json_agg to build nested structure
  // Filters by language for translations
  // Paginates shop groups (not individual items)
}
```

**Why Raw SQL?**
- More efficient for complex grouping
- Better performance with large carts
- Reduces N+1 query problems

#### **Add to Cart (`create`)**

```typescript
async create(userId: number, body: AddToCartBodyType) {
  // Validate SKU first
  await this.validateSKU({ skuId, quantity, userId, isCreate: true })

  // Upsert: Create new or increment quantity
  return this.prismaService.cartItem.upsert({
    where: {
      userId_skuId: { userId, skuId: body.skuId }
    },
    update: {
      quantity: { increment: body.quantity }  // Add to existing
    },
    create: {
      userId,
      skuId: body.skuId,
      quantity: body.quantity
    }
  })
}
```

**Key Feature:** Uses `userId_skuId` unique constraint to prevent duplicate entries. If user adds same SKU again, quantity is incremented instead of creating duplicate.

### 2.4 Cart Data Structure

Cart items are **grouped by shop** (seller):

```typescript
{
  data: [
    {
      shop: { id, name, avatar },
      cartItems: [
        {
          id, quantity, skuId,
          sku: {
            id, value, price, stock, image,
            product: {
              id, name, basePrice,
              productTranslations: [...]
            }
          }
        }
      ]
    }
  ],
  totalItems: number,  // Number of shops
  page: number,
  limit: number,
  totalPages: number
}
```

**Why Group by Shop?**
- Orders are created per shop (one order per seller)
- Easier checkout process
- Better UX for multi-vendor marketplace

---

## 3. Order Module

The Order module handles order creation, management, and cancellation. It's tightly integrated with Cart and Payment modules.

### 3.1 Architecture

```
Order
├── userId (buyer)
├── shopId (seller)
├── paymentId (links to payment)
├── status (PENDING_PAYMENT, PENDING_PICKUP, etc.)
├── receiver (shipping info)
└── items (OrderItem[])
    ├── productName, skuPrice, quantity
    ├── skuId, productId
    ├── productTranslations (snapshot)
    └── image

Payment
├── id
├── status (PENDING, SUCCESS, FAILED)
└── orders[] (one payment can have multiple orders)
```

### 3.2 Order Creation Flow

**Location:** `src/routes/order/order.repo.ts` - `create()` method

#### **Step-by-Step Process:**

1. **Extract Cart Item IDs**
   ```typescript
   const allBodyCartItemIds = body.map((item) => item.cartItemIds).flat()
   const cartItemsForSKUId = await this.prismaService.cartItem.findMany({
     where: { id: { in: allBodyCartItemIds }, userId }
   })
   const skuIds = cartItemsForSKUId.map((cartItem) => cartItem.skuId)
   ```

2. **Acquire Distributed Locks**
   ```typescript
   // Lock all SKUs to prevent concurrent modifications
   const locks = await Promise.all(
     skuIds.map((skuId) =>
       redlock.acquire([`lock:sku:${skuId}`], 3000)
     )
   )
   ```

   **Why Locks?**
   - Prevents race conditions when multiple users buy same SKU
   - Ensures stock is not oversold
   - Uses Redis-based distributed locking (Redlock)

3. **Transaction: Validate & Create**
   ```typescript
   await this.prismaService.$transaction(async (tx) => {
     // 3.1. Fetch cart items with full details
     const cartItems = await tx.cartItem.findMany({
       where: { id: { in: allBodyCartItemIds }, userId },
       include: {
         sku: {
           include: { product: { include: { productTranslations: true } } }
         }
       }
     })

     // 3.2. Validate all cart items exist
     if (cartItems.length !== allBodyCartItemIds.length) {
       throw NotFoundCartItemException
     }

     // 3.3. Validate stock availability
     const isOutOfStock = cartItems.some(
       (item) => item.sku.stock < item.quantity
     )
     if (isOutOfStock) throw OutOfStockSKUException

     // 3.4. Validate products are published
     const isExistNotReadyProduct = cartItems.some(
       (item) =>
         item.sku.product.deletedAt !== null ||
         item.sku.product.publishedAt === null ||
         item.sku.product.publishedAt > new Date()
     )
     if (isExistNotReadyProduct) throw ProductNotFoundException

     // 3.5. Validate shop ownership
     const isValidShop = body.every((item) => {
       return item.cartItemIds.every((cartItemId) => {
         const cartItem = cartItemMap.get(cartItemId)!
         return item.shopId === cartItem.sku.createdById
       })
     })
     if (!isValidShop) throw SKUNotBelongToShopException

     // 3.6. Create Payment
     const payment = await tx.payment.create({
       data: { status: PaymentStatus.PENDING }
     })

     // 3.7. Create Orders (one per shop)
     const orders = []
     for (const item of body) {
       const order = await tx.order.create({
         data: {
           userId,
           status: OrderStatus.PENDING_PAYMENT,
           receiver: item.receiver,
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
                 productTranslations: cartItem.sku.product.productTranslations.map(...)
               }
             })
           }
         }
       })
       orders.push(order)
     }

     // 3.8. Delete cart items
     await tx.cartItem.deleteMany({
       where: { id: { in: allBodyCartItemIds } }
     })

     // 3.9. Update SKU stock (with optimistic locking)
     for (const item of cartItems) {
       await tx.sKU.update({
         where: {
           id: item.sku.id,
           updatedAt: item.sku.updatedAt,  // Optimistic lock
           stock: { gte: item.quantity }    // Ensure stock is enough
         },
         data: {
           stock: { decrement: item.quantity }
         }
       }).catch((e) => {
         if (isNotFoundPrismaError(e)) {
           throw VersionConflictException  // Stock changed during processing
         }
         throw e
       })
     }

     // 3.10. Schedule payment cancellation job
     await this.orderProducer.addCancelPaymentJob(payment.id)

     return [payment.id, orders]
   })
   ```

4. **Release Locks**
   ```typescript
   finally {
     await Promise.all(locks.map((lock) => lock.release().catch(() => {})))
   }
   ```

### 3.3 Key Features

#### **Optimistic Locking**

```typescript
await tx.sKU.update({
  where: {
    id: item.sku.id,
    updatedAt: item.sku.updatedAt,  // Must match current value
    stock: { gte: item.quantity }    // Stock must be sufficient
  },
  data: { stock: { decrement: item.quantity } }
})
```

**Why?**
- Prevents stock overselling if multiple orders process simultaneously
- If `updatedAt` changed, update fails → `VersionConflictException`
- Ensures data consistency without pessimistic locks on entire table

#### **Product Snapshot**

Order items store **snapshot** of product data:
- `productName`, `skuPrice`, `image`
- `productTranslations` (full translation array)

**Why Snapshot?**
- Products can be deleted/updated after order creation
- Order history must remain accurate
- Price changes shouldn't affect past orders

#### **One Payment, Multiple Orders**

```typescript
// One payment can contain orders from multiple shops
const payment = await tx.payment.create({ ... })
for (const item of body) {  // Each item is a shop
  const order = await tx.order.create({
    paymentId: payment.id,  // All orders share same payment
    shopId: item.shopId
  })
}
```

**Why?**
- User can checkout items from multiple sellers in one transaction
- Single payment for multiple orders
- Each seller gets their own order

### 3.4 Order Cancellation

**Location:** `src/routes/order/order.repo.ts` - `cancel()` method

```typescript
async cancel(userId: number, orderId: number) {
  const order = await this.prismaService.order.findUniqueOrThrow({
    where: { id: orderId, userId, deletedAt: null }
  })

  // Only PENDING_PAYMENT orders can be cancelled
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    throw CannotCancelOrderException
  }

  const updatedOrder = await this.prismaService.order.update({
    where: { id: orderId, userId, deletedAt: null },
    data: {
      status: OrderStatus.CANCELLED,
      updatedById: userId
    }
  })
  return updatedOrder
}
```

**Note:** Stock is **not** restored on manual cancellation. Stock is only restored when payment times out (via queue job).

---

## 4. Payment Module

The Payment module handles payment processing, webhook reception, and payment status management.

### 4.1 Architecture

```
Payment
├── id
├── status (PENDING, SUCCESS, FAILED)
└── orders[] (linked orders)

PaymentTransaction
├── id (from payment gateway)
├── gateway, transactionDate
├── accountNumber, subAccount
├── amountIn, amountOut
├── accumulated, code
├── transactionContent, referenceNumber
└── body (description)
```

### 4.2 Payment Flow

#### **Step 1: Order Creation**

When order is created:
1. Payment record is created with `status: PENDING`
2. Payment ID is returned to client
3. Client uses payment ID to make payment via external gateway
4. **Cancel payment job is scheduled** (24-hour delay)

#### **Step 2: Payment Webhook**

**Location:** `src/routes/payment/payment.repo.ts` - `receiver()` method

External payment gateway sends webhook when payment is received:

```typescript
async receiver(body: WebhookPaymentBodyType): Promise<number> {
  // 1. Create payment transaction record
  const paymentTransaction = await this.prismaService.paymentTransaction.findUnique({
    where: { id: body.id }
  })
  if (paymentTransaction) {
    throw new BadRequestException('Transaction already exists')
  }

  // 2. Extract payment ID from transaction content/code
  const paymentId = body.code
    ? Number(body.code.split(PREFIX_PAYMENT_CODE)[1])
    : Number(body.content?.split(PREFIX_PAYMENT_CODE)[1])

  // 3. Find payment and validate amount
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { orders: { include: { items: true } } }
  })

  const totalPrice = this.getTotalPrice(orders)
  if (totalPrice !== body.transferAmount) {
    throw new BadRequestException(`Price not match`)
  }

  // 4. Update payment and orders
  await Promise.all([
    tx.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.SUCCESS }
    }),
    tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { status: OrderStatus.PENDING_PICKUP }
    }),
    this.paymentProducer.removeJob(paymentId)  // Cancel scheduled job
  ])

  return userId
}
```

**Key Validations:**
- Prevents duplicate transaction processing
- Validates payment amount matches order total
- Extracts payment ID from transaction content/code

#### **Step 3: WebSocket Notification**

**Location:** `src/routes/payment/payment.service.ts`

After payment is processed, user is notified via WebSocket:

```typescript
async receiver(body: WebhookPaymentBodyType) {
  const userId = await this.paymentRepo.receiver(body)

  // Notify user via WebSocket
  this.server.to(generateRoomUserId(userId)).emit('payment', {
    status: 'success'
  })

  return { message: 'Payment received successfully' }
}
```

### 4.3 Payment Status Flow

```
PENDING → SUCCESS (via webhook)
       ↓
    FAILED (via queue timeout)
```

**Order Status Flow:**
```
PENDING_PAYMENT → PENDING_PICKUP (payment success)
                → CANCELLED (payment timeout or manual cancel)
```

---

## 5. Queue System

The queue system handles **asynchronous payment cancellation** when users don't complete payment within 24 hours.

### 5.1 Why Use Queues?

**Problem:** Users create orders but don't complete payment. We need to:
1. Cancel unpaid orders after 24 hours
2. Restore SKU stock
3. Update payment status to FAILED

**Solution:** Use **BullMQ** (Redis-based queue) to schedule delayed jobs.

**Benefits:**
- **Asynchronous Processing**: Doesn't block API response
- **Reliability**: Jobs are persisted in Redis, survive server restarts
- **Delayed Execution**: Can schedule jobs to run in the future
- **Retry Logic**: Built-in retry mechanism for failed jobs
- **Scalability**: Can run multiple workers

### 5.2 Queue Architecture

```
OrderProducer (Producer)
    ↓
    addCancelPaymentJob(paymentId)
    ↓
Payment Queue (Redis/BullMQ)
    ↓ (scheduled for 24h later)
PaymentConsumer (Worker)
    ↓
    cancelPaymentAndOrder(paymentId)
```

### 5.3 Implementation Details

#### **OrderProducer** (Job Creator)

**Location:** `src/routes/order/order.producer.ts`

```typescript
@Injectable()
export class OrderProducer {
  constructor(
    @InjectQueue(PAYMENT_QUEUE_NAME) private paymentQueue: Queue
  ) {}

  async addCancelPaymentJob(paymentId: number) {
    return this.paymentQueue.add(
      CANCEL_PAYMENT_JOB_NAME,
      { paymentId },
      {
        delay: 1000 * 60 * 60 * 24,  // 24 hours delay
        jobId: generateCancelPaymentJobId(paymentId),  // Unique job ID
        removeOnComplete: true,  // Clean up completed jobs
        removeOnFail: true       // Clean up failed jobs
      }
    )
  }
}
```

**When Called:**
- After order creation (in `OrderRepo.create()`)
- Job is scheduled to run 24 hours later

**Job ID Format:**
- `cancel-payment-${paymentId}`
- Ensures only one cancellation job per payment

#### **PaymentConsumer** (Job Processor)

**Location:** `src/queues/payment.consumer.ts`

```typescript
@Processor(PAYMENT_QUEUE_NAME)
export class PaymentConsumer extends WorkerHost {
  constructor(
    private readonly sharedPaymentRepo: SharedPaymentRepository
  ) {
    super()
  }

  async process(job: Job<{ paymentId: number }>): Promise<any> {
    switch (job.name) {
      case CANCEL_PAYMENT_JOB_NAME: {
        const { paymentId } = job.data
        await this.sharedPaymentRepo.cancelPaymentAndOrder(paymentId)
        return {}
      }
    }
  }
}
```

**What It Does:**
- Processes jobs from the queue
- Calls `cancelPaymentAndOrder()` to handle cancellation

#### **Payment Cancellation Logic**

**Location:** `src/shared/repositories/shared-payment.repo.ts`

```typescript
async cancelPaymentAndOrder(paymentId: number) {
  const payment = await this.prismaService.payment.findUnique({
    where: { id: paymentId },
    include: {
      orders: {
        include: { items: true }
    }
  })

  if (!payment) throw Error('Payment not found')

  const { orders } = payment
  const productSKUSnapshots = orders.map((order) => order.items).flat()

  await this.prismaService.$transaction(async (tx) => {
    // 1. Cancel orders (only if still PENDING_PAYMENT)
    const updateOrder$ = tx.order.updateMany({
      where: {
        id: { in: orders.map((o) => o.id) },
        status: OrderStatus.PENDING_PAYMENT,  // Only cancel unpaid orders
        deletedAt: null
      },
      data: { status: OrderStatus.CANCELLED }
    })

    // 2. Restore SKU stock
    const updateSkus$ = Promise.all(
      productSKUSnapshots
        .filter((item) => item.skuId)  // Only restore if SKU still exists
        .map((item) =>
          tx.sKU.update({
            where: { id: item.skuId as number },
            data: {
              stock: { increment: item.quantity }  // Restore stock
            }
          })
        )
    )

    // 3. Mark payment as FAILED
    const updatePayment$ = tx.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.FAILED }
    })

    return await Promise.all([updateOrder$, updateSkus$, updatePayment$])
  })
}
```

**Key Features:**
- **Transaction Safety**: All updates happen atomically
- **Stock Restoration**: Returns inventory to available stock
- **Status Check**: Only cancels orders that are still `PENDING_PAYMENT`
- **Idempotent**: Safe to retry if job fails

#### **Job Removal**

**Location:** `src/routes/payment/payment.producer.ts`

When payment is successful, the scheduled cancellation job is removed:

```typescript
@Injectable()
export class PaymentProducer {
  constructor(
    @InjectQueue(PAYMENT_QUEUE_NAME) private paymentQueue: Queue
  ) {}

  removeJob(paymentId: number) {
    return this.paymentQueue.remove(
      generateCancelPaymentJobId(paymentId)
    )
  }
}
```

**Called From:**
- `PaymentRepo.receiver()` after successful payment
- Prevents unnecessary cancellation if payment completes before timeout

### 5.4 Queue Configuration

**Location:** `src/app.module.ts`

```typescript
BullModule.forRoot({
  connection: {
    url: envConfig.REDIS_URL  // Uses same Redis as cache
  }
})
```

**Queue Name:** `PAYMENT_QUEUE_NAME = 'payment'`

**Job Name:** `CANCEL_PAYMENT_JOB_NAME = 'cancel-payment'`

### 5.5 Queue Flow Diagram

```
┌─────────────────┐
│ Order Created   │
│ Payment: PENDING │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Schedule Cancel Job     │
│ Delay: 24 hours        │
│ Job ID: cancel-payment-│
│         {paymentId}     │
└────────┬────────────────┘
         │
         │ (24 hours pass)
         │
         ▼
┌─────────────────────────┐
│ PaymentConsumer         │
│ Processes Job           │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ cancelPaymentAndOrder()  │
│ - Cancel Orders         │
│ - Restore Stock         │
│ - Mark Payment FAILED   │
└─────────────────────────┘

Alternative Flow (Payment Success):
┌─────────────────┐
│ Payment Success │
│ (via webhook)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Remove Cancel Job       │
│ (prevent cancellation)  │
└─────────────────────────┘
```

### 5.6 Why Not Use Database Cron Jobs?

**Database Cron Jobs Limitations:**
- ❌ Hard to scale across multiple servers
- ❌ No built-in retry mechanism
- ❌ Difficult to monitor and debug
- ❌ Can cause database load spikes

**Queue System Benefits:**
- ✅ Distributed: Works across multiple servers
- ✅ Reliable: Jobs persisted in Redis
- ✅ Retry: Built-in retry on failure
- ✅ Monitoring: BullMQ dashboard available
- ✅ Scalable: Can add more workers easily

---

## Summary

### Module Relationships

```
Product (Core)
    ↑
    │ referenced by
    │
Cart ──→ Order ──→ Payment
         │           │
         │           └──→ Queue (Cancel Job)
         │
         └──→ Stock Management
```

### Key Design Patterns

1. **Distributed Locking**: Prevents race conditions in order creation
2. **Optimistic Locking**: Ensures stock consistency
3. **Transaction Safety**: All critical operations use database transactions
4. **Soft Deletes**: Preserves data for order history
5. **Snapshot Pattern**: Stores product data in orders
6. **Queue Pattern**: Handles asynchronous, delayed tasks
7. **Multi-language Support**: I18n for products, brands, categories

### Data Flow Summary

1. **Product Creation**: Seller creates product with variants → SKUs generated
2. **Cart Management**: User adds products → Validates stock → Groups by shop
3. **Order Creation**: User checks out → Locks SKUs → Validates → Creates orders → Decrements stock → Schedules cancellation job
4. **Payment Processing**: External gateway → Webhook → Validates → Updates status → Removes cancellation job → Notifies user
5. **Payment Timeout**: Queue job runs → Cancels orders → Restores stock → Marks payment failed

---

## Conclusion

This e-commerce API implements a robust, scalable system with:
- **Complex product management** with variants and multi-language support
- **Reliable cart and order processing** with stock management
- **Asynchronous payment handling** with queue-based timeouts
- **Data integrity** through transactions, locks, and optimistic locking

The queue system is essential for handling payment timeouts without blocking the API or requiring manual intervention.
