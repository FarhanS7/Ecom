// @shopscale/api/app.module - NestJS root module
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getEnv } from '@shopscale/config';
import { HealthController } from './health.controller.js';
import { HealthProbeService } from './health-probe.service.js';
import { PingController } from './ping.controller.js';
import { AuthController } from './auth.controller.js';

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
  controllers: [HealthController, PingController, AuthController],
  providers: [HealthProbeService],
})
export class AppModule {}
