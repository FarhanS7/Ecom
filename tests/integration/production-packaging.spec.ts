import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';

describe('Production Deployment Packaging & Rollback Verification (TASK-086)', () => {
  const rootDir = process.cwd();

  describe('Multi-Stage Dockerfiles & Security Constraints', () => {
    const dockerfiles = [
      { path: 'apps/api/Dockerfile', service: 'API' },
      { path: 'apps/web/Dockerfile', service: 'Web' },
      { path: 'apps/worker/Dockerfile', service: 'Worker' },
    ];

    for (const df of dockerfiles) {
      it(`enforces multi-stage build and unprivileged 'node' user in ${df.service} Dockerfile`, () => {
        const fullPath = path.resolve(rootDir, df.path);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, 'utf8');

        // Multi-stage check
        expect(content).toContain('FROM node:20-alpine AS builder');
        expect(content).toContain('FROM node:20-alpine AS runner');

        // Security check: must run as non-root user node (UID 1000)
        expect(content).toMatch(/USER\s+node/);

        // Corepack / pnpm check
        expect(content).toContain('corepack prepare pnpm@9.1.0 --activate');
      });
    }

    it('defines healthchecks on HTTP service Dockerfiles', () => {
      const apiContent = fs.readFileSync(path.resolve(rootDir, 'apps/api/Dockerfile'), 'utf8');
      const webContent = fs.readFileSync(path.resolve(rootDir, 'apps/web/Dockerfile'), 'utf8');

      expect(apiContent).toContain('HEALTHCHECK');
      expect(apiContent).toContain('/health/live');

      expect(webContent).toContain('HEALTHCHECK');
      expect(webContent).toContain('/api/health/live');
    });
  });

  describe('Production Compose Configuration (infra/compose.prod.yml)', () => {
    const composePath = path.resolve(rootDir, 'infra/compose.prod.yml');

    it('validates production compose schema and service topology', () => {
      expect(fs.existsSync(composePath)).toBe(true);
      const raw = fs.readFileSync(composePath, 'utf8');
      const compose = parse(raw) as {
        services: Record<string, {
          restart?: string;
          logging?: { driver: string; options: { 'max-size': string; 'max-file': string } };
          deploy?: { resources?: { limits?: { memory?: string } } };
          depends_on?: Record<string, { condition: string }>;
          healthcheck?: { test: string[] };
        }>;
      };

      const requiredServices = ['postgres', 'redis', 'migration-runner', 'api', 'worker', 'web'];
      for (const s of requiredServices) {
        expect(compose.services[s]).toBeDefined();
      }

      // 1. Pre-deploy migration sequencing
      const api = compose.services['api']!;
      const worker = compose.services['worker']!;
      expect(api.depends_on?.['migration-runner']?.condition).toBe('service_completed_successfully');
      expect(worker.depends_on?.['migration-runner']?.condition).toBe('service_completed_successfully');

      // 2. Logging rotation policies
      for (const s of ['postgres', 'redis', 'api', 'worker', 'web']) {
        const logging = compose.services[s]!.logging;
        expect(logging).toBeDefined();
        expect(logging?.driver).toBe('json-file');
        expect(logging?.options['max-size']).toBeDefined();
        expect(logging?.options['max-file']).toBeDefined();
      }

      // 3. Memory limits
      for (const s of ['postgres', 'redis', 'api', 'worker', 'web']) {
        const memory = compose.services[s]?.deploy?.resources?.limits?.memory;
        expect(memory).toBeDefined();
      }

      // 4. Restart policies
      expect(compose.services['postgres']?.restart).toBe('always');
      expect(compose.services['redis']?.restart).toBe('always');
      expect(compose.services['api']?.restart).toBe('always');
      expect(compose.services['worker']?.restart).toBe('always');
      expect(compose.services['web']?.restart).toBe('always');
    });
  });

  describe('Rollback Playbook & Strategy', () => {
    const deploymentDocPath = path.resolve(rootDir, 'docs/operations/deployment.md');

    it('documents concrete rollback triggers and expand-contract migration rules', () => {
      expect(fs.existsSync(deploymentDocPath)).toBe(true);
      const doc = fs.readFileSync(deploymentDocPath, 'utf8');

      expect(doc).toContain('Rollback Triggers');
      expect(doc).toContain('0.50%'); // Error rate threshold
      expect(doc).toContain('500'); // Latency threshold
      expect(doc).toContain('Expand-and-Contract');
      expect(doc).toContain('Pre-Deploy Migration Invariant');
    });
  });
});
