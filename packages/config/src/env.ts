// @shopscale/config/env - Validated environment schema and access.
// All secrets are validated at boot; error messages name fields but NEVER
// include values. Importers must use getEnv()/resetEnvCache(), never read
// process.env directly for configured keys.

import { z } from 'zod';

// z.coerce.boolean() applies Boolean(value), so the string "false" parses as TRUE:
// there would be no way to turn a flag off from the environment (only an absent
// variable would fall back to the default). Accept the conventional spellings
// explicitly and reject anything else, so a typo is a boot error rather than a
// silent default. Found by the T028c live run: the T010b login spec sets
// COOKIE_SECURE=false and still received a `Secure` cookie.
const booleanFlag = z
  .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((value) => value === true || value === 'true' || value === '1')
  .default(true);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_CACHE_URL: z.string().url(),
  REDIS_JOBS_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanFlag,
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  MOCK_PAYMENTS_SECRET: z.string().min(32),
  MOCK_PAYMENTS_BASE_URL: z.string().url().optional(),
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z.string().optional(),
  MINIO_REGION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const msg = Object.entries(errors)
      .map(([k, v]) => `${k}: ${v.join(', ')}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
