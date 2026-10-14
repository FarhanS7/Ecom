#!/usr/bin/env node
// scripts/openapi.mjs - Generate docs/openapi.json from the built API (T006b).
// Reads the COMPILED dist (tsc emits decorator metadata, which the esbuild
// test runner strips — document generation cannot run under vitest).
//
// Usage (from repo root, after a build):
//   pnpm build && pnpm openapi
// Requires a valid environment (copy .env.example to .env with demo secrets);
// values never enter the generated document (see the secret scan below).
// Exit codes: 0 ok (+drift-free), 1 validation/generation failure.

import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outPath = join(repoRoot, 'docs', 'openapi.json');

// Resolve workspace deps in the api package's context (pnpm isolation:
// root cannot import @nestjs/swagger directly).
const apiRequire = createRequire(join(repoRoot, 'apps', 'api', 'package.json'));
const { SwaggerModule, DocumentBuilder } = apiRequire('@nestjs/swagger');

const { createApp } = await import(pathToFileURL(join(repoRoot, 'apps', 'api', 'dist', 'main.js')).href);

let app = null;
try {
  const created = await createApp();
  app = created.app;
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('ShopScale API')
    .setDescription('Multi-vendor e-commerce marketplace API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const raw = JSON.stringify(document, null, 2);

  // Secret scan BEFORE writing: the document must never contain configured
  // secret values, even if a future DTO echoes one by mistake.
  const secrets = [
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_REFRESH_SECRET,
    process.env.MOCK_PAYMENTS_SECRET,
    process.env.DATABASE_URL,
  ].filter((v) => typeof v === 'string' && v.length > 10);
  for (const secret of secrets) {
    if (raw.includes(secret)) {
      console.error('REFUSED: generated OpenAPI document contains a configured secret value.');
      process.exit(1);
    }
  }

  // Contract validation (mirrors the committed-artifact test).
  const failures = [];
  if (document.info?.title !== 'ShopScale API') failures.push('info.title');
  if (document.info?.version !== '1.0') failures.push('info.version');
  for (const p of ['/health/live', '/health/ready', '/v1/ping', '/v1/auth/register', '/v1/auth/login', '/v1/auth/refresh', '/v1/auth/logout', '/v1/auth/me']) {
    if (!document.paths?.[p]) failures.push(`paths[${p}]`);
  }
  if (failures.length > 0) {
    console.error(`OpenAPI contract validation failed: ${failures.join(', ')}`);
    process.exit(1);
  }

  await writeFile(outPath, `${raw}\n`, 'utf8');
  console.log(`wrote ${outPath}`);
  console.log(`openapi field (as measured): ${document.openapi}`);
  console.log('paths:', Object.keys(document.paths ?? {}).join(', '));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  console.error('Hint: copy .env.example to .env with demo secrets, then pnpm build && pnpm openapi');
  process.exit(1);
} finally {
  if (app) await app.close();
}
