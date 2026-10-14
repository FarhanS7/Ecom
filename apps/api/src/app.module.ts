// @shopscale/api/app.module - NestJS root module
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getEnv } from '@shopscale/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
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
  controllers: [],
  providers: [],
})
export class AppModule {}