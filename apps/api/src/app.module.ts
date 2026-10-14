// @shopscale/api/app.module - NestJS root module
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getEnv } from '@shopscale/config';
import { HealthController } from './health.controller.js';
import { HealthProbeService } from './health-probe.service.js';
import { PingController } from './ping.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
        // Fail fast at boot on missing/malformed secrets. getEnv() names
        // fields but never values; nothing secret is logged or returned.
        const parsed = getEnv();
        return parsed as unknown as Record<string, string>;
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
  controllers: [HealthController, PingController],
  providers: [HealthProbeService],
})
export class AppModule {}
