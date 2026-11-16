// Unit tests for Outbox service (T029)
import { describe, expect, it, vi } from 'vitest';
import { sanitizePayload, writeOutboxEvent, OutboxValidationError } from './outbox.service.js';
import type { DomainEvent } from './outbox.service.js';

describe('Outbox Service (T029)', () => {
  describe('sanitizePayload', () => {
    it('redacts sensitive fields recursively', () => {
      const sensitive = {
        userId: '123',
        password: 'plain-password',
        userToken: 'secret-token-123',
        nested: {
          clientSecret: 'shhh',
          cvv: '123',
          cardNumber: '4111222233334444',
          publicName: 'John',
        },
        items: [
          { sku: 'SKU-1', priceCents: 1000 },
          { api_key: 'key-abc', publicNote: 'hello' },
        ],
      };

      interface SanitizedShape {
        userId: string;
        password: string;
        userToken: string;
        nested: {
          clientSecret: string;
          cvv: string;
          cardNumber: string;
          publicName: string;
        };
        items: Array<{ sku?: string; priceCents?: number; api_key?: string; publicNote?: string }>;
      }
      const sanitized = sanitizePayload(sensitive) as SanitizedShape;
      expect(sanitized.userId).toBe('123');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.userToken).toBe('[REDACTED]');
      expect(sanitized.nested.clientSecret).toBe('[REDACTED]');
      expect(sanitized.nested.cvv).toBe('[REDACTED]');
      expect(sanitized.nested.cardNumber).toBe('[REDACTED]');
      expect(sanitized.nested.publicName).toBe('John');
      expect(sanitized.items[0]).toEqual({ sku: 'SKU-1', priceCents: 1000 });
      expect(sanitized.items[1].api_key).toBe('[REDACTED]');
      expect(sanitized.items[1].publicNote).toBe('hello');
    });

    it('returns primitives and null as-is', () => {
      expect(sanitizePayload(null)).toBeNull();
      expect(sanitizePayload(42)).toBe(42);
      expect(sanitizePayload('plain')).toBe('plain');
      expect(sanitizePayload(true)).toBe(true);
    });
  });

  describe('writeOutboxEvent', () => {
    it('validates required event fields', async () => {
      const mockTx = { unsafe: vi.fn() };

      // Missing aggregateType
      await expect(
        writeOutboxEvent(mockTx, {
          aggregateType: '',
          aggregateId: '00000000-0000-0000-0000-000000000001',
          type: 'ProductChanged',
          payload: {},
        }),
      ).rejects.toBeInstanceOf(OutboxValidationError);

      // Missing aggregateId
      await expect(
        writeOutboxEvent(mockTx, {
          aggregateType: 'product',
          aggregateId: '',
          type: 'ProductChanged',
          payload: {},
        }),
      ).rejects.toBeInstanceOf(OutboxValidationError);

      // Missing type
      await expect(
        writeOutboxEvent(mockTx, {
          aggregateType: 'product',
          aggregateId: '00000000-0000-0000-0000-000000000001',
          type: '',
          payload: {},
        }),
      ).rejects.toBeInstanceOf(OutboxValidationError);

      expect(mockTx.unsafe).not.toHaveBeenCalled();
    });

    it('inserts event into outbox with sanitized payload and defaults', async () => {
      const fakeRow = {
        id: '11111111-1111-1111-1111-111111111111',
        aggregate_type: 'product',
        aggregate_id: '22222222-2222-2222-2222-222222222222',
        aggregate_version: 3,
        event_type: 'ProductChanged',
        schema_version: 1,
        payload: { title: 'Updated Lamp' },
        correlation_id: 'corr-1',
        causation_id: 'cause-1',
        store_id: '33333333-3333-3333-3333-333333333333',
        occurred_at: new Date('2026-01-01T00:00:00Z'),
        created_at: new Date('2026-01-01T00:00:00Z'),
        published_at: null,
        lease_until: null,
        attempts: 0,
      };

      const mockTx = {
        unsafe: vi.fn().mockResolvedValue([fakeRow]),
      };

      const event: DomainEvent = {
        aggregateType: 'product',
        aggregateId: '22222222-2222-2222-2222-222222222222',
        aggregateVersion: 3,
        type: 'ProductChanged',
        payload: { title: 'Updated Lamp', secretNote: 'secret-123' },
        correlationId: 'corr-1',
        causationId: 'cause-1',
        storeId: '33333333-3333-3333-3333-333333333333',
      };

      const record = await writeOutboxEvent(mockTx, event);

      expect(mockTx.unsafe).toHaveBeenCalledTimes(1);
      const [sql, params] = mockTx.unsafe.mock.calls[0];
      expect(sql).toContain('INSERT INTO "outbox"');
      expect(sql).toContain('::text::jsonb');
      // Verify parameters passed to SQL
      expect(params[1]).toBe('product');
      expect(params[2]).toBe('22222222-2222-2222-2222-222222222222');
      expect(params[3]).toBe(3);
      expect(params[4]).toBe('ProductChanged');
      expect(params[5]).toBe(1);
      // Verify payload was serialized with redaction
      const parsedPayload = JSON.parse(params[6]);
      expect(parsedPayload.title).toBe('Updated Lamp');
      expect(parsedPayload.secretNote).toBe('[REDACTED]');
      expect(params[7]).toBe('corr-1');
      expect(params[8]).toBe('cause-1');
      expect(params[9]).toBe('33333333-3333-3333-3333-333333333333');

      expect(record.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(record.aggregateType).toBe('product');
      expect(record.aggregateId).toBe('22222222-2222-2222-2222-222222222222');
      expect(record.aggregateVersion).toBe(3);
      expect(record.eventType).toBe('ProductChanged');
      expect(record.publishedAt).toBeNull();
      expect(record.attempts).toBe(0);
    });
  });
});
