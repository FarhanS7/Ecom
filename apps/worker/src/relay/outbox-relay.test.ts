// Unit tests for OutboxRelay (T029)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OutboxRelay } from './outbox-relay.js';
import type { EventQueuePublisher } from './outbox-relay.js';
import type { OutboxRecord, OutboxRowDb, SqlClient } from '@shopscale/backend';

describe('OutboxRelay (T029)', () => {
  let mockSql: { unsafe: ReturnType<typeof vi.fn> };
  let mockPublisher: EventQueuePublisher;

  const sampleRow: OutboxRowDb = {
    id: '00000000-0000-0000-0000-000000000001',
    aggregate_type: 'product',
    aggregate_id: '00000000-0000-0000-0000-000000000002',
    aggregate_version: 1,
    event_type: 'ProductChanged',
    schema_version: 1,
    payload: { action: 'created' },
    correlation_id: null,
    causation_id: null,
    store_id: '00000000-0000-0000-0000-000000000003',
    occurred_at: new Date('2026-01-01T00:00:00Z'),
    created_at: new Date('2026-01-01T00:00:00Z'),
    published_at: null,
    lease_until: new Date('2026-01-01T00:00:30Z'),
    attempts: 1,
  };

  beforeEach(() => {
    mockSql = {
      unsafe: vi.fn(),
    };
    mockPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('claims batch using FOR UPDATE SKIP LOCKED CTE', async () => {
    mockSql.unsafe.mockResolvedValueOnce([sampleRow]);

    const relay = new OutboxRelay(mockSql as unknown as SqlClient, mockPublisher, {
      batchSize: 25,
      leaseDurationSeconds: 45,
    });

    const claimed = await relay.claimBatch(25, 45);

    expect(mockSql.unsafe).toHaveBeenCalledTimes(1);
    const [query, params] = mockSql.unsafe.mock.calls[0];
    expect(query).toContain('FOR UPDATE SKIP LOCKED');
    expect(query).toContain('published_at" IS NULL');
    expect(params).toEqual([25, 45]);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(claimed[0]!.eventType).toBe('ProductChanged');
    expect(claimed[0]!.attempts).toBe(1);
  });

  it('marks record published upon queue acknowledgment', async () => {
    mockSql.unsafe.mockResolvedValueOnce([]);

    const relay = new OutboxRelay(mockSql as unknown as SqlClient, mockPublisher);
    await relay.markPublished('event-123');

    expect(mockSql.unsafe).toHaveBeenCalledTimes(1);
    const [query, params] = mockSql.unsafe.mock.calls[0];
    expect(query).toContain('SET "published_at" = now()');
    expect(query).toContain('"lease_until" = NULL');
    expect(params).toEqual(['event-123']);
  });

  it('releases lease on publisher failure', async () => {
    mockSql.unsafe.mockResolvedValueOnce([]);

    const relay = new OutboxRelay(mockSql as unknown as SqlClient, mockPublisher);
    await relay.releaseLease('event-123');

    expect(mockSql.unsafe).toHaveBeenCalledTimes(1);
    const [query, params] = mockSql.unsafe.mock.calls[0];
    expect(query).toContain('SET "lease_until" = NULL');
    expect(params).toEqual(['event-123']);
  });

  it('polls once and publishes events then marks them published', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([sampleRow]) // claimBatch
      .mockResolvedValueOnce([]); // markPublished

    const relay = new OutboxRelay(mockSql as unknown as SqlClient, mockPublisher);
    const count = await relay.pollOnce();

    expect(count).toBe(1);
    expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
    const publishedArg = vi.mocked(mockPublisher.publish).mock.calls[0]![0] as OutboxRecord;
    expect(publishedArg.id).toBe('00000000-0000-0000-0000-000000000001');

    // Verify markPublished was called
    expect(mockSql.unsafe).toHaveBeenCalledTimes(2);
  });

  it('handles publisher failure by releasing lease', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([sampleRow]) // claimBatch
      .mockResolvedValueOnce([]); // releaseLease

    mockPublisher.publish = vi.fn().mockRejectedValueOnce(new Error('Broker unreachable'));

    const relay = new OutboxRelay(mockSql as unknown as SqlClient, mockPublisher);
    const count = await relay.pollOnce();

    expect(count).toBe(0);
    expect(mockSql.unsafe).toHaveBeenCalledTimes(2);
    const [query, params] = mockSql.unsafe.mock.calls[1];
    expect(query).toContain('SET "lease_until" = NULL');
    expect(params).toEqual([sampleRow.id]);
  });

  it('calculates queue lag seconds', async () => {
    mockSql.unsafe.mockResolvedValueOnce([{ lag_seconds: 12.5 }]);

    const relay = new OutboxRelay(mockSql as unknown as SqlClient, mockPublisher);
    const lag = await relay.getQueueLagSeconds();

    expect(lag).toBe(12.5);
    expect(mockSql.unsafe).toHaveBeenCalledTimes(1);
    const [query] = mockSql.unsafe.mock.calls[0];
    expect(query).toContain('lag_seconds');
  });

  it('starts and stops gracefully', async () => {
    mockSql.unsafe.mockResolvedValue([]);

    const relay = new OutboxRelay(mockSql as unknown as SqlClient, mockPublisher, { pollIntervalMs: 10 });
    expect(relay.isRunning()).toBe(false);

    relay.start();
    expect(relay.isRunning()).toBe(true);

    await new Promise((r) => setTimeout(r, 25));
    await relay.stop();
    expect(relay.isRunning()).toBe(false);
  });
});
