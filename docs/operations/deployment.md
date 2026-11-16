# Production Deployment & Rollback Strategy

## Overview

This guide defines the production packaging, deployment orchestration, and rollback playbooks for the **ShopScale** multi-vendor marketplace stack (TASK-086, Phase 4).

The deployment architecture enforces:
1. **Multi-Stage Containerization**: Minimal Alpine runtimes running as unprivileged `node` user (UID 1000).
2. **Pre-Deploy Migration Gate**: Ephemeral migration container applies additive database migrations before application containers boot.
3. **Zero-Downtime Rollback Safety**: Expand-and-contract schema migrations guarantee backward compatibility with previous container tags.

---

## 1. Production Architecture (\`infra/compose.prod.yml\`)

```
                  ┌──────────────────────┐
                  │   Client Ingress     │
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │    Next.js      │               │   Fastify API   │
   │  (Port 3000)    │──────────────>│  (Port 3001)    │
   └─────────────────┘               └────────┬────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
             ┌─────────────────┐                             ┌─────────────────┐
             │  PostgreSQL 16  │                             │     Redis 7     │
             │   (Port 5432)   │                             │   (Port 6379)   │
             └─────────────────┘                             └─────────────────┘
                      ▲                                               ▲
                      │                                               │
             ┌────────┴────────┐                             ┌────────┴────────┐
             │ Migration Gate  │                             │  BullMQ Worker  │
             │   (Ephemeral)   │                             │   (Background)  │
             └─────────────────┘                             └─────────────────┘
```

### 1.1 Resource Budgets & Log Rotation
| Service | Image Base | Memory Limit | Log Rotation Policy | Healthcheck Endpoint |
|---|---|---|---|---|
| **PostgreSQL** | `postgres:16-alpine` | 768 MB | max-size: 50m, max-file: 5 | `pg_isready` |
| **Redis** | `redis:7-alpine` | 200 MB | max-size: 20m, max-file: 3 | `redis-cli ping` |
| **API** | `node:20-alpine` | 512 MB | max-size: 50m, max-file: 5 | `GET /health/live` |
| **Worker** | `node:20-alpine` | 384 MB | max-size: 50m, max-file: 5 | Internal health hook |
| **Web** | `node:20-alpine` | 512 MB | max-size: 50m, max-file: 5 | `GET /api/health/live` |

---

## 2. Deployment Sequence

Deployment execution follows a strict dependency graph:

```bash
# 1. Pull / build versioned images
docker compose -f infra/compose.prod.yml build

# 2. Boot dependencies and run pre-deploy database migrations
# The migration-runner container exits with code 0 before api/worker boot
docker compose -f infra/compose.prod.yml up -d
```

### 2.1 Pre-Deploy Migration Invariant
The API and Worker services define an explicit Compose dependency:
```yaml
depends_on:
  migration-runner:
    condition: service_completed_successfully
```
If any database migration fails, the deployment halts immediately:
- The previous API and Worker containers remain untouched.
- No live traffic reaches partially migrated tables.

---

## 3. Concrete Rollback Triggers & Thresholds

A rollback MUST be executed immediately without waiting for triage if any of the following triggers fire within a 15-minute post-deployment monitoring window:

| Trigger Condition | Threshold | Detection Source |
|---|---|---|
| **HTTP Error Spike** | Error rate > 0.50% for 2 consecutive minutes | Prometheus / CloudWatch alert `HighHttpErrorRate` |
| **Latency Degradation** | API p95 latency > 500 ms for 3 consecutive minutes | Prometheus alert `ApiLatencyDegraded` |
| **Container Crash Loop** | Any service restarts >= 3 times in 5 minutes | Docker daemon / healthcheck failure |
| **Database Pool Exhaustion** | Connection queue wait time > 1.0 second | PostgreSQL `pg_stat_activity` alert |
| **Data Integrity Anomaly** | Idempotency or stock ledger constraint violation | Application error log `INVENTORY_OVERSELL_RACE` |

---

## 4. Rollback Playbook

When a rollback trigger is breached:

### Step 1: Revert Container Tag
Point the deployment configuration to the last known green release tag:
```bash
export IMAGE_TAG=v1.2.3-green
docker compose -f infra/compose.prod.yml up -d --no-deps api worker web
```

### Step 2: Database Schema Reversibility (Expand-and-Contract)
Because all database migrations in `db/migrations/` follow the **additive-first** pattern:
- New columns are added as nullable or with defaults.
- Columns are never dropped or renamed in the same release as application code.
- Rolling back application containers to the previous version requires **ZERO database rollback**: the older application code safely ignores the newly added columns without crashing.

### Step 3: Verification
Verify rollback health within 60 seconds:
```bash
# Verify healthcheck responses
curl -f http://localhost:3001/health/live
curl -f http://localhost:3000/api/health/live

# Verify error rate returns to baseline
pnpm check
```
