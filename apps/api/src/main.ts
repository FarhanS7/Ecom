// @shopscale/api - NestJS HTTP API entry point
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { getEnv } from '@shopscale/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const env = getEnv();
  
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  app.enableCors({
    origin: env.COOKIE_DOMAIN ? `https://${env.COOKIE_DOMAIN}` : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger/OpenAPI
  const config = new DocumentBuilder()
    .setTitle('ShopScale API')
    .setDescription('Multi-vendor e-commerce marketplace API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Health endpoints
  app.getHttpAdapter().get('/health/live', () => ({ status: 'ok' }));
  app.getHttpAdapter().get('/health/ready', async () => {
    // Delegate to platform readiness check
    return { status: 'ok', checks: {} };
  });
  app.getHttpAdapter().get('/metrics', () => ({ /* Prometheus metrics */ }));

  await app.listen(env.PORT, '0.0.0.0');
  console.log(`API listening on port ${env.PORT}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});