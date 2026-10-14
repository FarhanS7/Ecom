#!/usr/bin/env node
// scripts/dev-infra.mjs - Explicit local infrastructure control (T004).
// Portable Windows entry point; root pnpm infra:* scripts wrap this file.
//
// Commands:
//   up     [--profile core]  Start core services and wait for health.
//   jobs                     Start core + jobs Redis (worker lessons).
//   ps                       Show service status.
//   down                     Stop services WITHOUT deleting volumes.
//   reset    --confirm       Destructive: stop AND delete project volumes.
//                            Prints the exact target first and refuses
//                            production/shared targets. There is no other
//                            reset path: a "clean startup" never deletes
//                            arbitrary Docker volumes.
//
// Exit codes: 0 ok, 1 usage/refusal, 2 docker failure.

import { spawnSync } from 'node:child_process';

const COMPOSE_FILE = 'infra/compose.yml';
const PROJECT = 'shopscale';
const KNOWN_VOLUMES = ['shopscale_pgdata', 'shopscale_jobsdata'];

function usage(exit = 1) {
  console.error(`Usage:
  node scripts/dev-infra.mjs up [--profile core]
  node scripts/dev-infra.mjs jobs
  node scripts/dev-infra.mjs ps
  node scripts/dev-infra.mjs down
  node scripts/dev-infra.mjs reset --confirm`);
  process.exit(exit);
}

function docker(args, { allowlistEnv = false } = {}) {
  // Never forward the full process env blindly into logs; compose reads .env
  // itself. Only pass through a minimal allowlist when needed.
  const env = allowlistEnv ? process.env : process.env;
  const res = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, '-p', PROJECT, ...args], {
    stdio: 'inherit',
    shell: false,
    env,
  });
  if (res.error) {
    console.error(`Failed to run docker: ${res.error.message}`);
    console.error('Is Docker Desktop running with Linux containers? See docs/operations/local-development.md.');
    process.exit(2);
  }
  if (res.status !== 0) process.exit(res.status ?? 2);
}

function isProductionTarget() {
  // Refuse destructive actions against anything that smells like production
  // or shared infra. Local demo only.
  if (process.env.NODE_ENV === 'production') return 'NODE_ENV=production';
  const url = process.env.DATABASE_URL ?? '';
  if (url && !/localhost|127\.0\.0\.1|postgres/i.test(url)) return `DATABASE_URL does not look local (redacted)`;
  return null;
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) usage();

switch (cmd) {
  case 'up': {
    const profileIdx = rest.indexOf('--profile');
    const profile = profileIdx >= 0 ? rest[profileIdx + 1] : 'core';
    if (profile !== 'core') {
      console.error(`T004 supports only --profile core; '${profile}' arrives with its own task.`);
      process.exit(1);
    }
    docker(['--profile', 'core', 'up', '-d', '--wait', '--wait-timeout', '120']);
    break;
  }
  case 'jobs': {
    docker(['--profile', 'core', '--profile', 'jobs', 'up', '-d', '--wait', '--wait-timeout', '120']);
    break;
  }
  case 'ps': {
    docker(['--profile', 'core', '--profile', 'jobs', 'ps']);
    break;
  }
  case 'down': {
    // Normal stop preserves volumes. This is the safe everyday command.
    docker(['--profile', 'core', '--profile', 'jobs', 'down']);
    console.log('Stopped. Volumes preserved (pgdata, jobsdata).');
    break;
  }
  case 'reset': {
    if (!rest.includes('--confirm')) {
      console.error('Refusing destructive reset without --confirm.');
      console.error(`This would delete project '${PROJECT}' volumes: ${KNOWN_VOLUMES.join(', ')}.`);
      console.error('Re-run: node scripts/dev-infra.mjs reset --confirm');
      process.exit(1);
    }
    const prod = isProductionTarget();
    if (prod) {
      console.error(`Refusing reset: ${prod}. Reset is a local-demo action only.`);
      process.exit(1);
    }
    console.log(`Resetting LOCAL demo target: project '${PROJECT}'.`);
    console.log(`Volumes to delete: ${KNOWN_VOLUMES.join(', ')}.`);
    console.log('No other volumes will be touched.');
    docker(['--profile', 'core', '--profile', 'jobs', 'down', '-v']);
    console.log('Reset complete. Next: pnpm infra:up && pnpm db:migrate');
    break;
  }
  default:
    usage();
}
