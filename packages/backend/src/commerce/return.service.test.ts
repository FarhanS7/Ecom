// packages/backend/src/commerce/return.service.test.ts - Unit tests for returns and cancellations (T058).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { ReturnsService } from './returns.service.js';
import {
  AlreadyShippedError,
  OrderAlreadyCancelledError,
  OrderItemNotFoundError,
  OrderNotDeliveredError,
  OrderNotFoundError,
  ReturnAlreadyInspectedError,
  ReturnQuantityExceededError,
  ReturnRequestNotFoundError,
} from './errors.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';

vi.mock('../inventory/inventory.service.js', () => ({
  inventoryService: {
    adjustStock: vi.fn(),
    releaseReservation: vi.fn(),
  },
}));

vi.mock('../platform/outbox.service.js', () => ({
  writeOutboxEvent: vi.fn(),
}));

type MockTx = (...args: unknown[]) => Promise<unknown[]>;
type MockCb = (tx: MockTx) => Promise<unknown>;
interface MockSql {
  begin: (cb: MockCb) => Promise<unknown>;
}

function createSql(mock: MockSql): Sql {
  return mock as unknown as Sql;
}

describe('ReturnsService (T058 Unit Tests)', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const orderId = '22222222-2222-4222-8222-222222222222';
  const suborderId = '33333333-3333-4333-8333-333333333333';
  const orderItemId = '44444444-4444-4444-8444-444444444444';
  const storeId = '55555555-5555-4555-8555-555555555555';
  const variantId = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cancelOrder', () => {
    it('throws OrderNotFoundError when order does not exist or user mismatch', async () => {
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => [];
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(service.cancelOrder(userId, orderId)).rejects.toThrow(OrderNotFoundError);
    });

    it('throws OrderAlreadyCancelledError if order is already cancelled', async () => {
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => [
            {
              id: orderId,
              user_id: userId,
              payment_status: 'PAID',
              fulfillment_status: 'CANCELLED',
              total_cents: 5000,
            },
          ];
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(service.cancelOrder(userId, orderId)).rejects.toThrow(
        OrderAlreadyCancelledError,
      );
    });

    it('throws AlreadyShippedError if order fulfillment_status is SHIPPED or DELIVERED', async () => {
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => [
            {
              id: orderId,
              user_id: userId,
              payment_status: 'PAID',
              fulfillment_status: 'SHIPPED',
              total_cents: 5000,
            },
          ];
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(service.cancelOrder(userId, orderId)).rejects.toThrow(AlreadyShippedError);
    });

    it('throws AlreadyShippedError if any child suborder is SHIPPED', async () => {
      let callCount = 0;
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => {
            callCount++;
            if (callCount === 1) {
              return [
                {
                  id: orderId,
                  user_id: userId,
                  payment_status: 'PAID',
                  fulfillment_status: 'PENDING',
                  total_cents: 5000,
                },
              ];
            }
            if (callCount === 2) {
              return [
                {
                  id: suborderId,
                  store_id: storeId,
                  fulfillment_status: 'SHIPPED',
                },
              ];
            }
            return [];
          };
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(service.cancelOrder(userId, orderId)).rejects.toThrow(AlreadyShippedError);
    });

    it('cancels paid order, triggers restock and refund request event', async () => {
      let callCount = 0;
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => {
            callCount++;
            if (callCount === 1) {
              // Order row
              return [
                {
                  id: orderId,
                  user_id: userId,
                  payment_status: 'PAID',
                  fulfillment_status: 'PENDING',
                  total_cents: 5000,
                },
              ];
            }
            if (callCount === 2) {
              // Suborder rows
              return [
                {
                  id: suborderId,
                  store_id: storeId,
                  fulfillment_status: 'PENDING',
                },
              ];
            }
            if (callCount === 3 || callCount === 4) {
              // Update order / suborder
              return [];
            }
            if (callCount === 5) {
              // Order items
              return [
                {
                  id: orderItemId,
                  order_id: orderId,
                  seller_order_id: suborderId,
                  store_id: storeId,
                  variant_id: variantId,
                  qty: 2,
                },
              ];
            }
            return [];
          };
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      const result = await service.cancelOrder(userId, orderId, 'Customer requested cancellation');

      expect(result.orderId).toBe(orderId);
      expect(result.fulfillmentStatus).toBe('CANCELLED');
      expect(result.refundInitiated).toBe(true);

      // Verify inventory restock was called
      expect(inventoryService.adjustStock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId,
          variantId,
          deltaOnHand: 2,
          reason: 'return_restock',
          refId: orderId,
        }),
      );

      // Verify outbox events written
      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'order.refund_requested',
          payload: expect.objectContaining({
            orderId,
            amountCents: 5000,
          }),
        }),
      );

      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'order.cancelled',
        }),
      );
    });
  });

  describe('createReturnRequest', () => {
    it('throws OrderNotDeliveredError when order is not DELIVERED', async () => {
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => [
            {
              id: orderId,
              user_id: userId,
              payment_status: 'PAID',
              fulfillment_status: 'SHIPPED',
            },
          ];
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(
        service.createReturnRequest(userId, {
          orderId,
          orderItemId,
          qty: 1,
          reason: 'Defective item',
        }),
      ).rejects.toThrow(OrderNotDeliveredError);
    });

    it('throws OrderItemNotFoundError when order item is not found', async () => {
      let queryIdx = 0;
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => {
            queryIdx++;
            if (queryIdx === 1) {
              return [
                {
                  id: orderId,
                  user_id: userId,
                  payment_status: 'PAID',
                  fulfillment_status: 'DELIVERED',
                },
              ];
            }
            return [];
          };
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(
        service.createReturnRequest(userId, {
          orderId,
          orderItemId,
          qty: 1,
          reason: 'Defective item',
        }),
      ).rejects.toThrow(OrderItemNotFoundError);
    });

    it('throws ReturnQuantityExceededError when requested return exceeds remaining returnable units', async () => {
      let queryIdx = 0;
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => {
            queryIdx++;
            if (queryIdx === 1) {
              return [
                {
                  id: orderId,
                  user_id: userId,
                  payment_status: 'PAID',
                  fulfillment_status: 'DELIVERED',
                },
              ];
            }
            if (queryIdx === 2) {
              return [
                {
                  id: orderItemId,
                  order_id: orderId,
                  seller_order_id: suborderId,
                  store_id: storeId,
                  variant_id: variantId,
                  qty: 3, // Purchased 3 units
                },
              ];
            }
            if (queryIdx === 3) {
              return [{ total_returned: 2 }]; // 2 units already returned
            }
            return [];
          };
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      // Attempting to return 2 more units (only 1 remaining)
      await expect(
        service.createReturnRequest(userId, {
          orderId,
          orderItemId,
          qty: 2,
          reason: 'Wrong size',
        }),
      ).rejects.toThrow(ReturnQuantityExceededError);
    });

    it('successfully creates return request when quantity is valid', async () => {
      const returnRequestId = '99999999-9999-4999-8999-999999999999';
      let queryIdx = 0;
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => {
            queryIdx++;
            if (queryIdx === 1) {
              return [
                {
                  id: orderId,
                  user_id: userId,
                  payment_status: 'PAID',
                  fulfillment_status: 'DELIVERED',
                },
              ];
            }
            if (queryIdx === 2) {
              return [
                {
                  id: orderItemId,
                  order_id: orderId,
                  seller_order_id: suborderId,
                  store_id: storeId,
                  variant_id: variantId,
                  qty: 3,
                },
              ];
            }
            if (queryIdx === 3) {
              return [{ total_returned: 1 }]; // 1 already returned, 2 available
            }
            if (queryIdx === 4) {
              return [
                {
                  id: returnRequestId,
                  order_id: orderId,
                  seller_order_id: suborderId,
                  store_id: storeId,
                  order_item_id: orderItemId,
                  user_id: userId,
                  qty: 1,
                  reason: 'Wrong size',
                  customer_notes: 'Need a larger size',
                  status: 'PENDING_INSPECTION',
                  inspection_notes: null,
                  created_at: new Date(),
                },
              ];
            }
            return [];
          };
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      const result = await service.createReturnRequest(userId, {
        orderId,
        orderItemId,
        qty: 1,
        reason: 'Wrong size',
        customerNotes: 'Need a larger size',
      });

      expect(result.id).toBe(returnRequestId);
      expect(result.status).toBe('PENDING_INSPECTION');
      expect(result.qty).toBe(1);
      expect(result.reason).toBe('Wrong size');

      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'return.requested',
          payload: expect.objectContaining({
            returnRequestId,
            orderId,
            qty: 1,
          }),
        }),
      );
    });
  });

  describe('listSellerReturnRequests', () => {
    it('returns formatted return requests for store', async () => {
      const returnRequestId = '99999999-9999-4999-8999-999999999999';
      const mockSql = Object.assign(
        async () => [
          {
            id: returnRequestId,
            order_id: orderId,
            seller_order_id: suborderId,
            store_id: storeId,
            order_item_id: orderItemId,
            user_id: userId,
            qty: 2,
            reason: 'Defective item',
            customer_notes: null,
            status: 'PENDING_INSPECTION',
            inspection_notes: null,
            created_at: new Date('2026-01-01T00:00:00Z'),
            title_snapshot: 'Test Product',
            sku_snapshot: 'SKU-123',
            unit_price_cents: 2500,
          },
        ],
        { begin: async (cb: MockCb) => cb(async () => []) },
      );

      const service = new ReturnsService(createSql(mockSql));
      const returns = await service.listSellerReturnRequests(storeId);
      expect(returns.length).toBe(1);
      expect(returns[0]!.id).toBe(returnRequestId);
      expect(returns[0]!.itemTitle).toBe('Test Product');
      expect(returns[0]!.itemSku).toBe('SKU-123');
      expect(returns[0]!.itemUnitPriceCents).toBe(2500);
      expect(returns[0]!.status).toBe('PENDING_INSPECTION');
    });
  });

  describe('inspectReturnRequest', () => {
    it('throws ReturnRequestNotFoundError if return request not found or store mismatch', async () => {
      const mockSql = {
        begin: async (cb: MockCb) => cb(async () => []),
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(
        service.inspectReturnRequest(storeId, '88888888-8888-4888-8888-888888888888', {
          decision: 'APPROVED',
          restock: false,
        }),
      ).rejects.toThrow(ReturnRequestNotFoundError);
    });

    it('throws ReturnAlreadyInspectedError if return is already processed', async () => {
      const returnRequestId = '99999999-9999-4999-8999-999999999999';
      const mockSql = {
        begin: async (cb: MockCb) =>
          cb(async () => [
            {
              id: returnRequestId,
              store_id: storeId,
              status: 'APPROVED',
            },
          ]),
      };

      const service = new ReturnsService(createSql(mockSql));
      await expect(
        service.inspectReturnRequest(storeId, returnRequestId, {
          decision: 'APPROVED',
          restock: false,
        }),
      ).rejects.toThrow(ReturnAlreadyInspectedError);
    });

    it('approves return with restock=true, adjusts inventory, and emits return.inspected', async () => {
      const returnRequestId = '99999999-9999-4999-8999-999999999999';
      let callCount = 0;
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => {
            callCount++;
            if (callCount === 1) {
              return [
                {
                  id: returnRequestId,
                  order_id: orderId,
                  seller_order_id: suborderId,
                  store_id: storeId,
                  order_item_id: orderItemId,
                  user_id: userId,
                  qty: 2,
                  reason: 'Defective item',
                  customer_notes: 'Broken seal',
                  status: 'PENDING_INSPECTION',
                  inspection_notes: null,
                  created_at: new Date('2026-01-01T00:00:00Z'),
                  variant_id: variantId,
                  title_snapshot: 'Test Product',
                  sku_snapshot: 'SKU-123',
                  unit_price_cents: 2500,
                },
              ];
            }
            return [];
          };
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      const result = await service.inspectReturnRequest(storeId, returnRequestId, {
        decision: 'APPROVED',
        inspectionNotes: 'Item verified and restocked',
        restock: true,
      });

      expect(result.id).toBe(returnRequestId);
      expect(result.status).toBe('APPROVED');
      expect(result.inspectionNotes).toBe('Item verified and restocked');

      // Verify inventory adjustment
      expect(inventoryService.adjustStock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId,
          variantId,
          deltaOnHand: 2,
          reason: 'return_restock',
          refId: returnRequestId,
        }),
      );

      // Verify outbox event
      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'return.inspected',
          payload: expect.objectContaining({
            returnRequestId,
            decision: 'APPROVED',
            restock: true,
          }),
        }),
      );
    });

    it('rejects return with inspection notes and emits outbox without restock', async () => {
      const returnRequestId = '99999999-9999-4999-8999-999999999999';
      let callCount = 0;
      const mockSql = {
        begin: async (cb: MockCb) => {
          const tx = async () => {
            callCount++;
            if (callCount === 1) {
              return [
                {
                  id: returnRequestId,
                  order_id: orderId,
                  seller_order_id: suborderId,
                  store_id: storeId,
                  order_item_id: orderItemId,
                  user_id: userId,
                  qty: 1,
                  reason: 'Customer damage',
                  customer_notes: null,
                  status: 'PENDING_INSPECTION',
                  inspection_notes: null,
                  created_at: new Date('2026-01-01T00:00:00Z'),
                  variant_id: variantId,
                  title_snapshot: 'Test Product',
                  sku_snapshot: 'SKU-123',
                  unit_price_cents: 2500,
                },
              ];
            }
            return [];
          };
          return cb(tx);
        },
      };

      const service = new ReturnsService(createSql(mockSql));
      const result = await service.inspectReturnRequest(storeId, returnRequestId, {
        decision: 'REJECTED',
        inspectionNotes: 'Item visibly altered by customer',
        restock: false,
      });

      expect(result.id).toBe(returnRequestId);
      expect(result.status).toBe('REJECTED');
      expect(result.inspectionNotes).toBe('Item visibly altered by customer');

      // Verify inventory adjustment was NOT called
      expect(inventoryService.adjustStock).not.toHaveBeenCalled();

      // Verify outbox event
      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'return.inspected',
          payload: expect.objectContaining({
            returnRequestId,
            decision: 'REJECTED',
            restock: false,
          }),
        }),
      );
    });
  });
});
