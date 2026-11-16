// Unit tests for DomainEventsConsumer (T030)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { DomainEventsConsumer } from './domain-events.consumer.js';
import * as backend from '@shopscale/backend';
import type { OutboxRecord, SqlClient } from '@shopscale/backend';

vi.mock('bullmq', () => {
  return {
    Worker: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('DomainEventsConsumer (T030)', () => {
  let mockSql: { begin: ReturnType<typeof vi.fn> };
  let projectProductSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSql = {
      begin: vi.fn().mockImplementation(async (callback) => {
        const fakeTx = { unsafe: vi.fn() };
        return callback(fakeTx);
      }),
    };

    projectProductSpy = vi.spyOn(backend, 'projectProductEvent').mockResolvedValue({
      status: 'PROJECTED',
      productId: 'prod-1',
      version: 2,
    });
  });

  it('dispatches product event to projectProductEvent inside transaction', async () => {
    const consumer = new DomainEventsConsumer(mockSql as unknown as SqlClient, 'domain-events');

    const job = {
      id: 'job-1',
      data: {
        id: 'evt-1',
        aggregateType: 'product',
        aggregateId: 'prod-1',
        aggregateVersion: 2,
        eventType: 'ProductChanged',
        schemaVersion: 1,
        payload: { title: 'New Shoes' },
        correlationId: null,
        causationId: null,
        storeId: 'store-1',
        occurredAt: new Date(),
        createdAt: new Date(),
        publishedAt: null,
        leaseUntil: null,
        attempts: 0,
      },
    } as unknown as Job<OutboxRecord>;

    await consumer.handleJob(job);

    expect(mockSql.begin).toHaveBeenCalledTimes(1);
    expect(projectProductSpy).toHaveBeenCalledTimes(1);
    expect(projectProductSpy.mock.calls[0]![1]).toMatchObject({
      id: 'evt-1',
      aggregateId: 'prod-1',
      aggregateVersion: 2,
      type: 'ProductChanged',
    });
  });

  it('skips non-product events without opening transaction', async () => {
    const consumer = new DomainEventsConsumer(mockSql as unknown as SqlClient, 'domain-events');

    const job = {
      id: 'job-2',
      data: {
        id: 'evt-2',
        aggregateType: 'analytics',
        aggregateId: 'stat-1',
        eventType: 'PageViewed',
        payload: {},
      },
    } as unknown as Job<OutboxRecord>;

    await consumer.handleJob(job);

    expect(mockSql.begin).not.toHaveBeenCalled();
    expect(projectProductSpy).not.toHaveBeenCalled();
  });

  it('invalidates pdp cache on product events', async () => {
    const mockCache = {
      invalidatePattern: vi.fn().mockResolvedValue(undefined),
    };
    const consumer = new DomainEventsConsumer(mockSql as unknown as SqlClient, 'domain-events', {
      cache: mockCache,
    });

    const job = {
      id: 'job-pdp',
      data: {
        id: 'evt-pdp',
        aggregateType: 'product',
        aggregateId: 'prod-pdp',
        aggregateVersion: 1,
        eventType: 'ProductChanged',
        payload: { title: 'Updated' },
      },
    } as unknown as Job<OutboxRecord>;

    await consumer.handleJob(job);

    expect(mockCache.invalidatePattern).toHaveBeenCalledWith('cache:pdp:*');
  });

  it('closes worker on shutdown', async () => {
    const consumer = new DomainEventsConsumer(mockSql as unknown as SqlClient, 'domain-events');
    await consumer.close();
    expect(consumer.worker.close).toHaveBeenCalledTimes(1);
  });
});
