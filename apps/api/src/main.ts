// @shopscale/api - NestJS HTTP API entry point
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ValidationError } from 'class-validator';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { getEnv, resetEnvCache } from '@shopscale/config';
import type { Env } from '@shopscale/config';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './problem.filter.js';
import { requestIdHook } from './request-id.hook.js';

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

  // Versioned business API; health/docs/metrics stay unversioned per
  // docs/architecture/api-contracts.md.
  app.setGlobalPrefix('v1', {
    exclude: ['health/live', 'health/ready', 'metrics', 'docs', 'docs-json'],
  });

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
      // api-contracts.md: validation failures are 422, not 400.
      errorHttpStatusCode: 422,
      // Shape violations as constraint data (property + constraint keys);
      // the problem filter maps them without ever echoing rejected values.
      exceptionFactory: (validationErrors: ValidationError[] = []) =>
        new UnprocessableEntityException(
          validationErrors.map((e) => ({
            property: e.property,
            constraints: e.constraints ?? {},
          })),
        ),
    }),
  );

  const adapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ProblemFilter(adapterHost));

  const fastify = app.getHttpAdapter().getInstance();
  // getInstance() is adapter-typed as any; the hook module declares only the
  // structural shapes it uses, so no fastify import leaks into our code.
  fastify.addHook('onRequest', requestIdHook);

  // Unknown routes flow through Nest's own not-found handling into the
  // global ProblemFilter (single-handler limit on the Fastify adapter), so
  // they share the same problem contract — proven by the 404 test.

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
