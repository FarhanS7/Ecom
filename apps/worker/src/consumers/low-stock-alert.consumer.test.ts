// @shopscale/worker/consumers/low-stock-alert.consumer.test - Unit tests for LowStockAlertConsumer (TASK-076).
import { describe, expect, it, vi } from 'vitest';
import { LowStockAlertConsumer } from './low-stock-alert.consumer.js';
import type { NotificationService, OutboxRecord } from '@shopscale/backend';

describe('LowStockAlertConsumer (TASK-076)', () => {
  const sampleEvent: OutboxRecord = {
    id: 'outbox-1111-2222-3333',
    aggregateType: 'inventory',
    aggregateId: 'variant-uuid-999',
    aggregateVersion: 1,
    eventType: 'inventory.low_stock_alert',
    payload: {
      variantId: 'variant-uuid-999',
      storeId: 'store-uuid-888',
      onHand: 5,
      reserved: 2,
      available: 3,
      threshold: 5,
    },
    storeId: 'store-uuid-888',
    traceId: 'trace-123',
    causationId: null,
    correlationId: null,
    createdAt: new Date('2026-11-17T01:00:00Z'),
    publishedAt: null,
  };

  it('ignores events that are not inventory.low_stock_alert', async () => {
    const mockNotificationService: Partial<NotificationService> = {
      recordDelivery: vi.fn(),
    };
    const consumer = new LowStockAlertConsumer({
      notificationService: mockNotificationService as NotificationService,
    });

    const otherEvent: OutboxRecord = {
      ...sampleEvent,
      eventType: 'order.placed',
    };

    const result = await consumer.processEvent(otherEvent);
    expect(result).toBeNull();
    expect(mockNotificationService.recordDelivery).not.toHaveBeenCalled();
  });

  it('ignores events missing required payload attributes', async () => {
    const mockNotificationService: Partial<NotificationService> = {
      recordDelivery: vi.fn(),
    };
    const consumer = new LowStockAlertConsumer({
      notificationService: mockNotificationService as NotificationService,
    });

    const invalidEvent: OutboxRecord = {
      ...sampleEvent,
      payload: { available: 2 },
    };

    const result = await consumer.processEvent(invalidEvent);
    expect(result).toBeNull();
    expect(mockNotificationService.recordDelivery).not.toHaveBeenCalled();
  });

  it('records delivery in notification ledger with deterministic effect key', async () => {
    const mockDeliveryRecord = {
      id: 'del-uuid-001',
      effectKey: 'low_stock:variant-uuid-999:2026-11-17',
      userId: null,
      channel: 'EMAIL',
      template: 'low_stock_warning',
      recipient: 'store-owner-store-uuid-888@shopscale.local',
      status: 'DELIVERED',
      payload: sampleEvent.payload,
      createdAt: new Date(),
    };

    const mockNotificationService: Partial<NotificationService> = {
      recordDelivery: vi.fn().mockResolvedValue({
        delivery: mockDeliveryRecord,
        alreadyDelivered: false,
      }),
    };

    const consumer = new LowStockAlertConsumer({
      notificationService: mockNotificationService as NotificationService,
    });

    const result = await consumer.processEvent(sampleEvent);

    expect(result).toEqual({
      deliveryId: 'del-uuid-001',
      alreadyDelivered: false,
    });

    expect(mockNotificationService.recordDelivery).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(mockNotificationService.recordDelivery!).mock.calls[0]![0];
    expect(callArgs.channel).toBe('EMAIL');
    expect(callArgs.template).toBe('low_stock_warning');
    expect(callArgs.recipient).toBe('store-owner-store-uuid-888@shopscale.local');
    expect(callArgs.effectKey).toMatch(/^low_stock:variant-uuid-999:\d{4}-\d{2}-\d{2}$/);
  });

  it('safely handles repeated deliveries idempotently', async () => {
    const mockDeliveryRecord = {
      id: 'del-uuid-001',
      effectKey: 'low_stock:variant-uuid-999:2026-11-17',
      userId: null,
      channel: 'EMAIL',
      template: 'low_stock_warning',
      recipient: 'store-owner-store-uuid-888@shopscale.local',
      status: 'DELIVERED',
      payload: sampleEvent.payload,
      createdAt: new Date(),
    };

    const mockNotificationService: Partial<NotificationService> = {
      recordDelivery: vi.fn().mockResolvedValue({
        delivery: mockDeliveryRecord,
        alreadyDelivered: true,
      }),
    };

    const consumer = new LowStockAlertConsumer({
      notificationService: mockNotificationService as NotificationService,
    });

    const result = await consumer.processEvent(sampleEvent);

    expect(result).toEqual({
      deliveryId: 'del-uuid-001',
      alreadyDelivered: true,
    });
  });
});
