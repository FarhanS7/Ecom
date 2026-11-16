// @shopscale/api/app.module - NestJS root module
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getEnv } from '@shopscale/config';
import { HealthController } from './health.controller.js';
import { HealthProbeService } from './health-probe.service.js';
import { PingController } from './ping.controller.js';
import { AuthController } from './auth.controller.js';
import { StoresController } from './stores.controller.js';
import { OnboardingController } from './onboarding.controller.js';
import { ChannelController } from './channel.controller.js';
import { AddressesController } from './addresses.controller.js';
import { ProductController } from './product.controller.js';
import { CatalogController } from './catalog.controller.js';
import { SearchController } from './search.controller.js';
import { SellerMediaController } from './seller-media.controller.js';
import { SellerInventoryController } from './seller-inventory.controller.js';
import { CartController } from './cart.controller.js';
import { ConcurrencyTestController } from './concurrency-test.controller.js';
import { CommerceController } from './commerce.controller.js';
import { WebhookController } from './webhook.controller.js';
import {
  OrdersController,
  SellerOrdersController,
  SellerReturnsController,
} from './orders.controller.js';
import { AuditController } from './audit.controller.js';
import { PromotionsController } from './promotions.controller.js';
import { ReviewsController } from './reviews.controller.js';
import { WishlistController } from './wishlist.controller.js';
import { AnalyticsController } from './analytics.controller.js';
import { CategoriesController } from './categories.controller.js';
import { SupportController } from './support.controller.js';
import { FeatureFlagsController } from './feature-flags.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (_config) => {
        // Fail fast at boot on missing/malformed secrets. getEnv() names
        // fields but never values; nothing secret is logged or returned.
        return getEnv();
      },
    }),
    // Domain modules will be imported here:
    // IdentityModule,
    // StoresModule,
    // CatalogModule,
    // InventoryModule,
    // CommerceModule,
    // PaymentsModule,
    // SearchModule,
    // NotificationsModule,
    // ReportingModule,
    // EngagementModule,
  ],
  controllers: [
    HealthController,
    PingController,
    AuthController,
    StoresController,
    OnboardingController,
    ChannelController,
    AddressesController,
    ProductController,
    CatalogController,
    SearchController,
    SellerMediaController,
    SellerInventoryController,
    CartController,
    ConcurrencyTestController,
    CommerceController,
    WebhookController,
    OrdersController,
    SellerOrdersController,
    SellerReturnsController,
    AuditController,
    PromotionsController,
    ReviewsController,
    WishlistController,
    AnalyticsController,
    CategoriesController,
    SupportController,
    FeatureFlagsController,
  ],
  providers: [HealthProbeService],
})
export class AppModule {}
