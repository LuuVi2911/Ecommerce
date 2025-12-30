# Ecommerce API

A comprehensive, production-ready ecommerce backend API built with NestJS, featuring multi-language support, role-based access control, real-time notifications, and complete order management.

## 🚀 Features

### Authentication & Security

- **User Registration** - Email-based registration with OTP verification
- **Login/Logout** - JWT-based authentication with access and refresh tokens
- **Google OAuth** - Social login integration
- **Two-Factor Authentication (2FA)** - TOTP-based 2FA setup and management
- **Password Recovery** - Forgot password functionality with email verification
- **Device Tracking** - Track user devices and manage multiple sessions
- **Refresh Token Management** - Automatic cleanup of expired refresh tokens via cron jobs
- **Role-Based Access Control (RBAC)** - Fine-grained permission system
- **Rate Limiting** - API throttling to prevent abuse
- **Security Headers** - Helmet integration for enhanced security
- **CORS Support** - Configurable cross-origin resource sharing

### User Management

- **User CRUD Operations** - Complete user lifecycle management
- **User Profiles** - View and update user profiles
- **Password Management** - Change password functionality
- **User Status** - Manage user status (ACTIVE, INACTIVE, BLOCKED)
- **Multi-language User Data** - User translations for internationalization
- **User Audit Trail** - Track who created, updated, or deleted users

### Product Management

- **Product CRUD** - Full product management capabilities
- **Product Variants** - Support for product variants and SKUs
- **SKU Management** - Individual SKU pricing, stock, and images
- **Product Translations** - Multi-language product names and descriptions
- **Product Images** - Multiple image support per product
- **Product Publishing** - Control product visibility with publish dates
- **Product Reviews** - Integrated review system for products

### Category Management

- **Category CRUD** - Complete category management
- **Hierarchical Categories** - Parent-child category relationships
- **Category Translations** - Multi-language category support
- **Category Logos** - Branded category logos

### Brand Management

- **Brand CRUD** - Brand management system
- **Brand Translations** - Multi-language brand names and descriptions
- **Brand Logos** - Brand logo management

### Shopping Cart

- **Add to Cart** - Add products to shopping cart
- **Update Cart Items** - Modify quantities in cart
- **Remove from Cart** - Delete cart items
- **View Cart** - Retrieve cart with pagination

### Order Management

- **Create Orders** - Place orders from cart
- **Order List** - View user orders with filtering
- **Order Details** - Detailed order information
- **Cancel Orders** - Order cancellation functionality
- **Order Status Tracking** - Track orders through lifecycle:
  - PENDING_PAYMENT
  - PENDING_PICKUP
  - PENDING_DELIVERY
  - DELIVERED
  - RETURNED
  - CANCELLED
- **Order Snapshots** - Historical order data preservation (product details at time of purchase)

### Payment Processing

- **Payment Webhooks** - Secure webhook receiver for payment gateways
- **Payment Status Management** - Track payment status (PENDING, SUCCESS, FAILED)
- **Payment Gateway Integration** - Ready for payment gateway integration
- **Real-time Payment Notifications** - WebSocket-based payment updates
- **Payment Queue Processing** - Background job processing with BullMQ
- **Payment Transaction Logging** - Complete payment transaction history

### Reviews & Ratings

- **Create Reviews** - Post product reviews after purchase
- **Update Reviews** - Edit existing reviews
- **Review Media** - Attach images and videos to reviews
- **Product Reviews** - View all reviews for a product
- **Review Tracking** - Track review update count

### Media Management

- **Image Upload** - Upload multiple images (up to 100 files)
- **AWS S3 Integration** - Cloud storage with S3
- **Presigned URLs** - Direct client-to-S3 uploads
- **Static File Serving** - Serve uploaded files
- **File Validation** - File type and size validation

### Internationalization (i18n)

- **Multi-language Support** - Full i18n implementation
- **Language Management** - Add and manage languages
- **Translation System** - Translations for:
  - Products
  - Categories
  - Brands
  - Users
- **Language Detection** - Automatic language detection from headers or query params
- **Error Messages** - Localized error messages

### Real-time Features (WebSocket)

- **Chat System** - Real-time messaging via WebSocket
- **Payment Notifications** - Real-time payment status updates
- **Redis Adapter** - Scalable WebSocket with Redis adapter
- **Connection Management** - Track WebSocket connections

### Background Jobs & Scheduling

- **Payment Queue** - Process payments asynchronously with BullMQ
- **Cron Jobs** - Scheduled tasks for maintenance
- **Refresh Token Cleanup** - Automatic cleanup of expired tokens
- **Redis Queue** - Distributed job queue with Redis

### API Documentation

- **Swagger/OpenAPI** - Interactive API documentation
- **Bearer Token Auth** - JWT authentication in Swagger
- **API Key Auth** - Payment webhook API key authentication
- **Request/Response Schemas** - Zod-validated schemas

### Logging & Monitoring

- **Structured Logging** - Pino logger integration
- **Request Logging** - Log all API requests
- **File-based Logs** - Persistent log files
- **Error Tracking** - Comprehensive error logging

### Caching

- **Redis Caching** - High-performance caching layer
- **Cache Manager** - NestJS cache manager integration

### Data Management

- **Soft Deletes** - Soft delete functionality for data preservation
- **Audit Fields** - Track created/updated/deleted by and timestamps
- **Pagination** - Efficient pagination for all list endpoints
- **Filtering & Sorting** - Advanced query capabilities

## 🛠️ Tech Stack

- **Framework**: NestJS 11
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache/Queue**: Redis, BullMQ
- **Authentication**: JWT, OAuth2 (Google)
- **File Storage**: AWS S3
- **Real-time**: Socket.IO with Redis adapter
- **Validation**: Zod
- **Documentation**: Swagger/OpenAPI
- **Logging**: Pino
- **Email**: Resend (React Email templates)
- **Security**: Helmet, bcrypt, rate limiting

## 📋 Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Redis server
- AWS S3 account (for file storage)
- Google OAuth credentials (for social login)
- Resend API key (for email)

## 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd ecom
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory with the following variables:

   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/ecom
   ACCESS_TOKEN_SECRET=your-secret-key
   ACCESS_TOKEN_EXPIRES_IN=15m
   REFRESH_TOKEN_SECRET=your-refresh-secret-key
   REFRESH_TOKEN_EXPIRES_IN=7d
   PAYMENT_API_KEY=your-payment-api-key
   ADMIN_NAME=Admin
   ADMIN_PASSWORD=admin-password
   ADMIN_EMAIL=admin@example.com
   ADMIN_PHONE_NUMBER=+1234567890
   OTP_EXPIRES_IN=5m
   RESEND_API_KEY=your-resend-api-key
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   GOOGLE_CLIENT_REDIRECT_URI=http://localhost:3000
   APP_NAME=Ecommerce API
   PREFIX_STATIC_ENPOINT=/media/static
   S3_REGION=us-east-1
   S3_ACCESS_KEY=your-s3-access-key
   S3_SECRET_KEY=your-s3-secret-key
   S3_BUCKET_NAME=your-bucket-name
   S3_ENPOINT=https://s3.amazonaws.com
   REDIS_URL=redis://localhost:6379
   PORT=3000
   ```

4. **Run database migrations**

   ```bash
   npx prisma migrate deploy
   ```

5. **Generate Prisma client**

   ```bash
   npx prisma generate
   ```

6. **Seed initial data (optional)**

   ```bash
   npm run init-seed-data
   ```

7. **Create permissions (optional)**
   ```bash
   npm run create-permissions
   ```

## 🚀 Running the Application

### Development

```bash
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

### Debug Mode

```bash
npm run start:debug
```

## 📚 API Documentation

Once the application is running, access the Swagger documentation at:

```
http://localhost:3000/api
```

## 🧪 Testing

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## 📁 Project Structure

```
ecom/
├── src/
│   ├── routes/           # API route modules
│   │   ├── auth/         # Authentication endpoints
│   │   ├── user/         # User management
│   │   ├── product/      # Product management
│   │   ├── category/     # Category management
│   │   ├── brand/        # Brand management
│   │   ├── cart/         # Shopping cart
│   │   ├── order/        # Order management
│   │   ├── payment/      # Payment processing
│   │   ├── review/       # Reviews and ratings
│   │   ├── media/        # Media upload
│   │   ├── profile/      # User profile
│   │   ├── role/         # Role management
│   │   ├── permission/   # Permission management
│   │   └── language/     # Language management
│   ├── shared/           # Shared modules and utilities
│   ├── websockets/       # WebSocket gateways
│   ├── queues/           # Background job consumers
│   ├── cronjobs/         # Scheduled tasks
│   ├── i18n/             # Translation files
│   └── generated/        # Generated code (Prisma, i18n)
├── prisma/               # Database schema and migrations
├── emails/               # Email templates
├── initialScript/        # Initialization scripts
└── test/                 # E2E tests
```

## 🔐 Authentication

The API uses JWT-based authentication with the following flow:

1. **Register** - User registers with email and receives OTP
2. **Verify OTP** - User verifies email with OTP code
3. **Login** - User logs in and receives access token and refresh token
4. **Refresh Token** - Use refresh token to get new access token
5. **Protected Routes** - Include access token in `Authorization: Bearer <token>` header

### Google OAuth Flow

1. Get authorization URL: `GET /auth/google-link`
2. Redirect user to returned URL
3. User authorizes and is redirected to callback
4. Callback returns access and refresh tokens

## 🎯 Key Endpoints

### Authentication

- `POST /auth/register` - Register new user
- `POST /auth/otp` - Send OTP for verification
- `POST /auth/login` - Login user
- `POST /auth/refresh-token` - Refresh access token
- `POST /auth/logout` - Logout user
- `GET /auth/google-link` - Get Google OAuth URL
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/2fa/setup` - Setup two-factor authentication
- `POST /auth/2fa/disable` - Disable two-factor authentication

### Products

- `GET /products` - List products (public)
- `GET /products/:productId` - Get product details (public)

### Cart

- `GET /cart` - Get user cart
- `POST /cart` - Add item to cart
- `PUT /cart/:cartItemId` - Update cart item
- `POST /cart/delete` - Remove items from cart

### Orders

- `GET /orders` - List user orders
- `POST /orders` - Create order
- `GET /orders/:orderId` - Get order details
- `PUT /orders/:orderId` - Cancel order

### Reviews

- `GET /reviews/products/:productId` - Get product reviews (public)
- `POST /reviews` - Create review
- `PUT /reviews/:reviewId` - Update review

### Media

- `POST /media/images/upload` - Upload images
- `POST /media/images/upload/presigned-url` - Get presigned URL for direct upload
- `GET /media/static/:filename` - Serve static files (public)

## 🔄 Background Jobs

The application uses BullMQ for background job processing:

- **Payment Queue** - Processes payment webhooks asynchronously
- **Cron Jobs** - Scheduled tasks for maintenance (e.g., refresh token cleanup)

## 🌐 Internationalization

The API supports multiple languages. Set the language via:

- Query parameter: `?lang=en`
- Accept-Language header: `Accept-Language: en`

Supported languages are managed through the `/languages` endpoints.

## 📝 Code Quality

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Type safety
- **Zod** - Runtime validation

## 🚢 Deployment

The application is ready for deployment to various platforms. Key considerations:

1. Set all environment variables
2. Run database migrations
3. Ensure Redis is accessible
4. Configure AWS S3 credentials
5. Set up proper CORS origins
6. Configure rate limiting thresholds

---

Built with ❤️ using NestJS
