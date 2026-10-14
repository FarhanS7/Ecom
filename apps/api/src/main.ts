// @shopscale/api - NestJS HTTP API entry point
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { getEnv, resetEnvCache } from '@shopscale/config';
import type { Env } from '@shopscale/config';
import { AppModule } from './app.module.js';

/**
 * Single application creation path for production and tests.
 * Fails fast BEFORE binding any port: missing/malformed secrets stop here.
 * getEnv() errors name fields only (see @shopscale/config); callers log the
 * message without embellishment so no secret can leak into logs.
 */
export async function createApp(): Promise<{ app: NestFastifyApplication; env: Env }> {
  resetEnvCache();
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

  // Health routes live on HealthController (platform logic in @shopscale/backend).
  app.getHttpAdapter().get('/metrics', () => ({ /* Prometheus metrics arrive in T072 */ }));

  return { app, env };
}

async function bootstrap() {
  const { app, env } = await createApp();

  // OpenAPI docs are wired here (production entry), not in createApp():
  // @nestjs/swagger's explorer reads design:paramtypes metadata that only
  // tsc emits. The vitest/esbuild runner strips it, so document creation
  // cannot run inside unit/integration tests. /docs is verified in dev/prod.
  const config = new DocumentBuilder()
    .setTitle('ShopScale API')
    .setDescription('Multi-vendor e-commerce marketplace API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.PORT, '0.0.0.0');
  console.log(`API listening on port ${env.PORT}`);
}

// Auto-run only as the process entry point (node dist/main.js), so tests can
// import { createApp } without binding ports or exiting the worker.
const entryPoint = typeof process.argv[1] === 'string' ? process.argv[1] : '';
if (/main\.(ts|js)$/.test(entryPoint)) {
  bootstrap().catch((err) => {
    console.error(err instanceof Error ? err.message : 'API failed to start');
    process.exit(1);
  });
}
