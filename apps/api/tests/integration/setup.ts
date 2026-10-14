// Vitest setup: establish a valid environment BEFORE test files import the
// Nest application module. @nestjs/config runs `validate` (→ getEnv()) at
// module-definition time, so the env must exist before the first import of
// AppModule. Individual tests may mutate env afterwards via resetEnvCache().
import { resetEnvCache } from '@shopscale/config';

// The closed-port URL is the DEFAULT only: a real DATABASE_URL provided by
// the environment (CI services, bench host) is always respected. Specs that
// need a deterministically stopped DB pin their own URL per test.
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgres://shopscale:shopscale@127.0.0.1:54329/shopscale';
process.env['REDIS_CACHE_URL'] = 'redis://localhost:6379';
process.env['JWT_ACCESS_SECRET'] = 't005-access-secret-000000000000000';
process.env['JWT_REFRESH_SECRET'] = 't005-refresh-secret-00000000000000';
process.env['MOCK_PAYMENTS_SECRET'] = 't005-mock-payments-secret-00000000';
resetEnvCache();
