// @shopscale/config - Validated configuration (public entry).
// Implementation lives in ./env.ts; this file re-exports only, so importers
// never depend on internal paths.
export { envSchema, getEnv, resetEnvCache } from './env.js';
export type { Env } from './env.js';
