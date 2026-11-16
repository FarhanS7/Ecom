// @shopscale/api/orders.controller.test - Unit tests for OrdersController & SellerOrdersController (T055)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  OrdersController,
  SellerOrdersController,
  SellerReturnsController,
} from './orders.controller.js';
import {
  AlreadyShippedError,
  FulfillmentStoreMismatchError,
  FulfillmentSuborderNotFoundError,
  IllegalFulfillmentTransitionError,
  InvoiceForbiddenError,
  InvoiceNotFoundError,
  MissingTrackingRefError,
  OrderAlreadyCancelledError,
  OrderItemNotFoundError,
  OrderNotDeliveredError,
  OrderNotFoundError,
  OrderNotPaidError,
  ReturnAlreadyInspectedError,
  ReturnQuantityExceededError,
  ReturnRequestNotFoundError,
  SuborderNotFoundError,
  authorizeStore,
  fulfillmentService,
  invoiceService,
  orderQueryService,
  returnsService,
} from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  authorizeStore: vi.fn(),
  orderQueryService: {
    listCustomerOrders: vi.fn(),
    getCustomerOrder: vi.fn(),
    listSellerOrders: vi.fn(),
    getSellerOrder: vi.fn(),
  },
  fulfillmentService: {
    transitionSuborder: vi.fn(),
  },
  invoiceService: {
    getInvoiceForOrder: vi.fn(),
  },
  returnsService: {
    cancelOrder: vi.fn(),
    createReturnRequest: vi.fn(),
    listReturnRequests: vi.fn(),
    listSellerReturnRequests: vi.fn(),
    inspectReturnRequest: vi.fn(),
  },
  OrderNotFoundError: class OrderNotFoundError extends Error {
    constructor() {
      super('Order not found');
      this.name = 'OrderNotFoundError';
    }
  },
  SuborderNotFoundError: class SuborderNotFoundError extends Error {
    constructor() {
      super('Suborder not found');
      this.name = 'SuborderNotFoundError';
    }
  },
  OrderNotPaidError: class OrderNotPaidError extends Error {
    constructor(status = 'PENDING') {
      super(`Cannot transition fulfillment status for an unpaid order (payment status: ${status}).`);
      this.name = 'OrderNotPaidError';
    }
  },
  IllegalFulfillmentTransitionError: class IllegalFulfillmentTransitionError extends Error {
    constructor(from = 'PENDING', to = 'DELIVERED') {
      super(`Illegal fulfillment transition from '${from}' to '${to}'.`);
      this.name = 'IllegalFulfillmentTransitionError';
    }
  },
  MissingTrackingRefError: class MissingTrackingRefError extends Error {
    constructor() {
      super('trackingRef is required when transitioning suborder to SHIPPED.');
      this.name = 'MissingTrackingRefError';
    }
  },
  FulfillmentSuborderNotFoundError: class FulfillmentSuborderNotFoundError extends Error {
    constructor() {
      super('Suborder not found');
      this.name = 'FulfillmentSuborderNotFoundError';
    }
  },
  FulfillmentStoreMismatchError: class FulfillmentStoreMismatchError extends Error {
    constructor() {
      super('Suborder store mismatch');
      this.name = 'FulfillmentStoreMismatchError';
    }
  },
  AlreadyShippedError: class AlreadyShippedError extends Error {
    constructor() {
      super('Cannot cancel shipped order');
      this.name = 'AlreadyShippedError';
    }
  },
  OrderAlreadyCancelledError: class OrderAlreadyCancelledError extends Error {
    constructor() {
      super('Order already cancelled');
      this.name = 'OrderAlreadyCancelledError';
    }
  },
  OrderNotDeliveredError: class OrderNotDeliveredError extends Error {
    constructor() {
      super('Order not delivered');
      this.name = 'OrderNotDeliveredError';
    }
  },
  ReturnQuantityExceededError: class ReturnQuantityExceededError extends Error {
    constructor() {
      super('Return quantity exceeded');
      this.name = 'ReturnQuantityExceededError';
    }
  },
  OrderItemNotFoundError: class OrderItemNotFoundError extends Error {
    constructor() {
      super('Order item not found');
      this.name = 'OrderItemNotFoundError';
    }
  },
  ReturnRequestNotFoundError: class ReturnRequestNotFoundError extends Error {
    constructor() {
      super('Return request not found');
      this.name = 'ReturnRequestNotFoundError';
    }
  },
  ReturnAlreadyInspectedError: class ReturnAlreadyInspectedError extends Error {
    constructor() {
      super('Return already inspected');
      this.name = 'ReturnAlreadyInspectedError';
    }
  },
  InvoiceNotFoundError: class InvoiceNotFoundError extends Error {
    constructor(msg = 'Invoice not found') {
      super(msg);
      this.name = 'InvoiceNotFoundError';
    }
  },
  InvoiceForbiddenError: class InvoiceForbiddenError extends Error {
    constructor(msg = 'Invoice forbidden') {
      super(msg);
      this.name = 'InvoiceForbiddenError';
    }
  },
}));

describe('OrdersController & SellerOrdersController (T055 Unit Tests)', () => {
  let ordersController: OrdersController;
  let sellerOrdersController: SellerOrdersController;
  let sellerReturnsController: SellerReturnsController;

  const validUserId = '11111111-1111-1111-1111-111111111111';
  const validStoreId = '22222222-2222-2222-2222-222222222222';
  const validOrderId = '33333333-3333-3333-3333-333333333333';
  const validSuborderId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
    ordersController = new OrdersController();
    sellerOrdersController = new SellerOrdersController();
    sellerReturnsController = new SellerReturnsController();
  });

  describe('OrdersController (Customer)', () => {
    it('throws UnauthorizedException if req.actor is missing', async () => {
      await expect(
        ordersController.listCustomerOrders({ actor: undefined }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        ordersController.getCustomerOrder({ actor: undefined }, validOrderId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lists customer orders with pagination params', async () => {
      vi.mocked(orderQueryService.listCustomerOrders).mockResolvedValueOnce({
        items: [],
        nextCursor: null,
      });

      const result = await ordersController.listCustomerOrders(
        { actor: { userId: validUserId } },
        'cur_123',
        '10',
      );

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(orderQueryService.listCustomerOrders).toHaveBeenCalledWith(validUserId, {
        cursor: 'cur_123',
        limit: 10,
      });
    });

    it('returns customer order detail on valid orderId', async () => {
      const mockDetail = {
        id: validOrderId,
        channelKey: 'marketplace',
        paymentStatus: 'PAID',
        fulfillmentStatus: 'PENDING',
        subtotalCents: 5000,
        shippingCents: 500,
        discountCents: 0,
        totalCents: 5500,
        currency: 'USD',
        createdAt: new Date().toISOString(),
        address: { fullName: 'Alice', line1: 'Street', city: 'City', state: 'ST', postalCode: '12345', country: 'USA' },
        suborders: [],
        items: [],
      };
      vi.mocked(orderQueryService.getCustomerOrder).mockResolvedValueOnce(mockDetail);

      const result = await ordersController.getCustomerOrder(
        { actor: { userId: validUserId } },
        validOrderId,
      );

      expect(result).toEqual(mockDetail);
      expect(orderQueryService.getCustomerOrder).toHaveBeenCalledWith(validUserId, validOrderId);
    });

    it('throws NotFoundException on invalid UUID or when OrderNotFoundError occurs', async () => {
      await expect(
        ordersController.getCustomerOrder({ actor: { userId: validUserId } }, 'not-a-uuid'),
      ).rejects.toThrow(NotFoundException);

      vi.mocked(orderQueryService.getCustomerOrder).mockRejectedValueOnce(
        new OrderNotFoundError(),
      );

      await expect(
        ordersController.getCustomerOrder({ actor: { userId: validUserId } }, validOrderId),
      ).rejects.toThrow(NotFoundException);
    });

    describe('cancelOrder', () => {
      it('throws UnauthorizedException if req.actor is missing', async () => {
        await expect(
          ordersController.cancelOrder({ actor: undefined }, validOrderId, {}),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws NotFoundException on invalid UUID or when OrderNotFoundError occurs', async () => {
        await expect(
          ordersController.cancelOrder({ actor: { userId: validUserId } }, 'invalid-id', {}),
        ).rejects.toThrow(NotFoundException);

        vi.mocked(returnsService.cancelOrder).mockRejectedValueOnce(new OrderNotFoundError());
        await expect(
          ordersController.cancelOrder({ actor: { userId: validUserId } }, validOrderId, {}),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException on AlreadyShippedError or OrderAlreadyCancelledError', async () => {
        vi.mocked(returnsService.cancelOrder).mockRejectedValueOnce(new AlreadyShippedError());
        await expect(
          ordersController.cancelOrder({ actor: { userId: validUserId } }, validOrderId, {}),
        ).rejects.toThrow();

        vi.mocked(returnsService.cancelOrder).mockRejectedValueOnce(new OrderAlreadyCancelledError());
        await expect(
          ordersController.cancelOrder({ actor: { userId: validUserId } }, validOrderId, {}),
        ).rejects.toThrow();
      });

      it('successfully cancels order and returns result', async () => {
        const mockResult = {
          success: true,
          orderId: validOrderId,
          fulfillmentStatus: 'CANCELLED' as const,
          paymentStatus: 'REFUNDED' as const,
          refundInitiated: true,
        };
        vi.mocked(returnsService.cancelOrder).mockResolvedValueOnce(mockResult);

        const result = await ordersController.cancelOrder(
          { actor: { userId: validUserId } },
          validOrderId,
          { reason: 'Customer requested' },
        );

        expect(result).toEqual(mockResult);
        expect(returnsService.cancelOrder).toHaveBeenCalledWith(
          validUserId,
          validOrderId,
          'Customer requested',
        );
      });
    });

    describe('createReturnRequest', () => {
      const validOrderItemId = '88888888-8888-4888-8888-888888888888';

      it('throws UnauthorizedException if req.actor is missing', async () => {
        await expect(
          ordersController.createReturnRequest({ actor: undefined }, validOrderId, {
            orderItemId: validOrderItemId,
            qty: 1,
            reason: 'Defective',
          }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws BadRequestException on invalid payload or OrderNotDeliveredError', async () => {
        await expect(
          ordersController.createReturnRequest(
            { actor: { userId: validUserId } },
            validOrderId,
            { qty: 0, reason: '' },
          ),
        ).rejects.toThrow();

        vi.mocked(returnsService.createReturnRequest).mockRejectedValueOnce(
          new OrderNotDeliveredError(),
        );
        await expect(
          ordersController.createReturnRequest(
            { actor: { userId: validUserId } },
            validOrderId,
            { orderItemId: validOrderItemId, qty: 1, reason: 'Defective' },
          ),
        ).rejects.toThrow();
      });

      it('throws NotFoundException on OrderItemNotFoundError', async () => {
        vi.mocked(returnsService.createReturnRequest).mockRejectedValueOnce(
          new OrderItemNotFoundError('Item not found in order'),
        );
        await expect(
          ordersController.createReturnRequest(
            { actor: { userId: validUserId } },
            validOrderId,
            { orderItemId: validOrderItemId, qty: 1, reason: 'Defective' },
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws ConflictException on ReturnQuantityExceededError', async () => {
        vi.mocked(returnsService.createReturnRequest).mockRejectedValueOnce(
          new ReturnQuantityExceededError(3, 1),
        );
        await expect(
          ordersController.createReturnRequest(
            { actor: { userId: validUserId } },
            validOrderId,
            { orderItemId: validOrderItemId, qty: 3, reason: 'Too many' },
          ),
        ).rejects.toThrow();
      });

      it('creates return request successfully', async () => {
        const mockReturn = {
          id: '99999999-9999-4999-8999-999999999999',
          orderId: validOrderId,
          sellerOrderId: '33333333-3333-4333-8333-333333333333',
          storeId: validStoreId,
          orderItemId: validOrderItemId,
          userId: validUserId,
          qty: 1,
          reason: 'Defective',
          status: 'PENDING_INSPECTION' as const,
          createdAt: new Date().toISOString(),
        };
        vi.mocked(returnsService.createReturnRequest).mockResolvedValueOnce(mockReturn);

        const result = await ordersController.createReturnRequest(
          { actor: { userId: validUserId } },
          validOrderId,
          { orderItemId: validOrderItemId, qty: 1, reason: 'Defective' },
        );

        expect(result).toEqual(mockReturn);
      });
    });

    describe('listReturnRequests', () => {
      it('returns list of return requests for customer order', async () => {
        vi.mocked(returnsService.listReturnRequests).mockResolvedValueOnce([]);

        const result = await ordersController.listReturnRequests(
          { actor: { userId: validUserId } },
          validOrderId,
        );

        expect(result).toEqual([]);
        expect(returnsService.listReturnRequests).toHaveBeenCalledWith(validUserId, validOrderId);
      });
    });
  });

  describe('SellerOrdersController (Vendor)', () => {
    it('throws NotFoundException when user lacks fulfillment:manage grant on store', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(false);

      await expect(
        sellerOrdersController.listSellerOrders(
          { actor: { userId: validUserId } },
          validStoreId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(authorizeStore).toHaveBeenCalledWith({
        userId: validUserId,
        storeId: validStoreId,
        permission: 'fulfillment:manage',
      });
    });

    it('lists seller suborders when authorized', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(true);
      vi.mocked(orderQueryService.listSellerOrders).mockResolvedValueOnce({
        items: [],
        nextCursor: null,
      });

      const result = await sellerOrdersController.listSellerOrders(
        { actor: { userId: validUserId } },
        validStoreId,
        undefined,
        '15',
      );

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(orderQueryService.listSellerOrders).toHaveBeenCalledWith(validStoreId, {
        cursor: undefined,
        limit: 15,
      });
    });

    it('returns seller suborder detail on valid authorized request', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(true);
      const mockSuborder = {
        id: validSuborderId,
        orderId: validOrderId,
        storeId: validStoreId,
        fulfillmentStatus: 'PENDING' as const,
        subtotalCents: 2000,
        shippingCents: 500,
        discountCents: 0,
        totalCents: 2500,
        commissionBpsSnapshot: 1000,
        createdAt: new Date().toISOString(),
      };
      vi.mocked(orderQueryService.getSellerOrder).mockResolvedValueOnce(mockSuborder);

      const result = await sellerOrdersController.getSellerOrder(
        { actor: { userId: validUserId } },
        validStoreId,
        validSuborderId,
      );

      expect(result).toEqual(mockSuborder);
      expect(orderQueryService.getSellerOrder).toHaveBeenCalledWith(validStoreId, validSuborderId);
    });

    it('throws NotFoundException when SuborderNotFoundError occurs', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(true);
      vi.mocked(orderQueryService.getSellerOrder).mockRejectedValueOnce(
        new SuborderNotFoundError(),
      );

      await expect(
        sellerOrdersController.getSellerOrder(
          { actor: { userId: validUserId } },
          validStoreId,
          validSuborderId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    describe('transitionSuborder', () => {
      it('throws NotFoundException on unauthorized or invalid UUID', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(false);
        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            validSuborderId,
            { toStatus: 'PACKED' },
          ),
        ).rejects.toThrow(NotFoundException);

        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            'invalid-uuid',
            { toStatus: 'PACKED' },
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException on invalid payload or missing trackingRef on SHIPPED', async () => {
        vi.mocked(authorizeStore).mockResolvedValue(true);

        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            validSuborderId,
            { toStatus: 'UNKNOWN_STATUS' },
          ),
        ).rejects.toThrow();

        vi.mocked(fulfillmentService.transitionSuborder).mockRejectedValueOnce(
          new MissingTrackingRefError(),
        );

        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            validSuborderId,
            { toStatus: 'SHIPPED' },
          ),
        ).rejects.toThrow();
      });

      it('throws BadRequestException on OrderNotPaidError or IllegalFulfillmentTransitionError', async () => {
        vi.mocked(authorizeStore).mockResolvedValue(true);

        vi.mocked(fulfillmentService.transitionSuborder).mockRejectedValueOnce(
          new OrderNotPaidError('PENDING'),
        );
        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            validSuborderId,
            { toStatus: 'PACKED' },
          ),
        ).rejects.toThrow();

        vi.mocked(fulfillmentService.transitionSuborder).mockRejectedValueOnce(
          new IllegalFulfillmentTransitionError('PENDING', 'DELIVERED'),
        );
        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            validSuborderId,
            { toStatus: 'DELIVERED' },
          ),
        ).rejects.toThrow();
      });

      it('throws NotFoundException on FulfillmentSuborderNotFoundError or FulfillmentStoreMismatchError', async () => {
        vi.mocked(authorizeStore).mockResolvedValue(true);

        vi.mocked(fulfillmentService.transitionSuborder).mockRejectedValueOnce(
          new FulfillmentSuborderNotFoundError(validSuborderId),
        );
        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            validSuborderId,
            { toStatus: 'PACKED' },
          ),
        ).rejects.toThrow(NotFoundException);

        vi.mocked(fulfillmentService.transitionSuborder).mockRejectedValueOnce(
          new FulfillmentStoreMismatchError(validStoreId, validSuborderId),
        );
        await expect(
          sellerOrdersController.transitionSuborder(
            { actor: { userId: validUserId } },
            validStoreId,
            validSuborderId,
            { toStatus: 'PACKED' },
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('successfully calls fulfillmentService.transitionSuborder and returns result', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        const mockResult = {
          success: true,
          isNoop: false,
          suborder: {
            id: validSuborderId,
            orderId: validOrderId,
            storeId: validStoreId,
            fulfillmentStatus: 'SHIPPED' as const,
            subtotalCents: 2000,
            shippingCents: 500,
            discountCents: 0,
            totalCents: 2500,
            commissionBpsSnapshot: 1000,
            trackingRef: 'TRACK123',
            carrier: 'UPS',
            createdAt: new Date().toISOString(),
          },
          parentFulfillmentStatus: 'PARTIALLY_SHIPPED' as const,
        };
        vi.mocked(fulfillmentService.transitionSuborder).mockResolvedValueOnce(mockResult);

        const result = await sellerOrdersController.transitionSuborder(
          { actor: { userId: validUserId } },
          validStoreId,
          validSuborderId,
          { toStatus: 'SHIPPED', trackingRef: 'TRACK123', carrier: 'UPS' },
        );

        expect(result).toEqual(mockResult);
        expect(fulfillmentService.transitionSuborder).toHaveBeenCalledWith({
          storeId: validStoreId,
          suborderId: validSuborderId,
          toStatus: 'SHIPPED',
          trackingRef: 'TRACK123',
          carrier: 'UPS',
          actorId: validUserId,
        });
      });
    });
  });

  describe('SellerReturnsController', () => {
    const validReturnId = '55555555-5555-5555-5555-555555555555';

    describe('listStoreReturns', () => {
      it('throws NotFoundException on unauthorized actor or invalid storeId', async () => {
        await expect(
          sellerReturnsController.listStoreReturns(
            { actor: undefined },
            validStoreId,
          ),
        ).rejects.toThrow(NotFoundException);

        await expect(
          sellerReturnsController.listStoreReturns(
            { actor: { userId: validUserId } },
            'invalid-uuid',
          ),
        ).rejects.toThrow(NotFoundException);

        vi.mocked(authorizeStore).mockResolvedValueOnce(false);
        await expect(
          sellerReturnsController.listStoreReturns(
            { actor: { userId: validUserId } },
            validStoreId,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('returns return requests for authorized seller', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        const mockReturns = [
          {
            id: validReturnId,
            orderId: validOrderId,
            sellerOrderId: validSuborderId,
            storeId: validStoreId,
            orderItemId: '66666666-6666-6666-6666-666666666666',
            userId: validUserId,
            qty: 1,
            reason: 'Defective item',
            customerNotes: null,
            status: 'PENDING_INSPECTION' as const,
            inspectionNotes: null,
            createdAt: new Date().toISOString(),
            itemTitle: 'Defective Widget',
            itemSku: 'WIDGET-01',
            itemUnitPriceCents: 1500,
          },
        ];
        vi.mocked(returnsService.listSellerReturnRequests).mockResolvedValueOnce(mockReturns);

        const result = await sellerReturnsController.listStoreReturns(
          { actor: { userId: validUserId } },
          validStoreId,
          'PENDING_INSPECTION',
        );

        expect(result).toEqual(mockReturns);
        expect(returnsService.listSellerReturnRequests).toHaveBeenCalledWith(
          validStoreId,
          'PENDING_INSPECTION',
        );
      });
    });

    describe('inspectReturn', () => {
      it('throws NotFoundException on invalid returnId or store gate rejection', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        await expect(
          sellerReturnsController.inspectReturn(
            { actor: { userId: validUserId } },
            validStoreId,
            'bad-id',
            { decision: 'APPROVED' },
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('validates inspection body', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        await expect(
          sellerReturnsController.inspectReturn(
            { actor: { userId: validUserId } },
            validStoreId,
            validReturnId,
            { decision: 'INVALID_DECISION' },
          ),
        ).rejects.toThrow();
      });

      it('maps ReturnRequestNotFoundError to NotFoundException', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        vi.mocked(returnsService.inspectReturnRequest).mockRejectedValueOnce(
          new ReturnRequestNotFoundError(validReturnId),
        );

        await expect(
          sellerReturnsController.inspectReturn(
            { actor: { userId: validUserId } },
            validStoreId,
            validReturnId,
            { decision: 'APPROVED', restock: true },
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('maps ReturnAlreadyInspectedError to ConflictException', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        vi.mocked(returnsService.inspectReturnRequest).mockRejectedValueOnce(
          new ReturnAlreadyInspectedError(validReturnId, 'APPROVED'),
        );

        await expect(
          sellerReturnsController.inspectReturn(
            { actor: { userId: validUserId } },
            validStoreId,
            validReturnId,
            { decision: 'APPROVED', restock: true },
          ),
        ).rejects.toThrow();
      });

      it('successfully inspects and approves return request', async () => {
        vi.mocked(authorizeStore).mockResolvedValueOnce(true);
        const mockResult = {
          id: validReturnId,
          orderId: validOrderId,
          sellerOrderId: validSuborderId,
          storeId: validStoreId,
          orderItemId: '66666666-6666-6666-6666-666666666666',
          userId: validUserId,
          qty: 1,
          reason: 'Defective item',
          customerNotes: null,
          status: 'APPROVED' as const,
          inspectionNotes: 'Inspected and restocked',
          createdAt: new Date().toISOString(),
          itemTitle: 'Defective Widget',
          itemSku: 'WIDGET-01',
          itemUnitPriceCents: 1500,
        };
        vi.mocked(returnsService.inspectReturnRequest).mockResolvedValueOnce(mockResult);

        const result = await sellerReturnsController.inspectReturn(
          { actor: { userId: validUserId } },
          validStoreId,
          validReturnId,
          { decision: 'APPROVED', inspectionNotes: 'Inspected and restocked', restock: true },
        );

        expect(result).toEqual(mockResult);
        expect(returnsService.inspectReturnRequest).toHaveBeenCalledWith(
          validStoreId,
          validReturnId,
          { decision: 'APPROVED', inspectionNotes: 'Inspected and restocked', restock: true },
        );
      });
    });

    describe('GET /v1/orders/:id/invoice (T061 Unit Tests)', () => {
      it('returns invoice DTO with presigned download URL for order owner', async () => {
        const mockInvoice = {
          id: '55555555-5555-5555-5555-555555555555',
          order_id: validOrderId,
          user_id: validUserId,
          invoice_number: 'INV-2026-ABCD1234',
          storage_key: `invoices/${validOrderId}.pdf`,
          total_cents: 12500,
          currency: 'USD',
          status: 'GENERATED' as const,
          created_at: new Date('2026-11-16T12:00:00Z'),
          updated_at: new Date('2026-11-16T12:00:00Z'),
        };

        vi.mocked(invoiceService.getInvoiceForOrder).mockResolvedValueOnce({
          invoice: mockInvoice,
          downloadUrl: 'https://minio.local/shopscale-media/invoices/test.pdf?sig=123',
        });

        const result = await ordersController.getOrderInvoice(
          { actor: { userId: validUserId } },
          validOrderId,
        );

        expect(result).toEqual({
          id: mockInvoice.id,
          orderId: validOrderId,
          invoiceNumber: 'INV-2026-ABCD1234',
          totalCents: 12500,
          currency: 'USD',
          status: 'GENERATED',
          downloadUrl: 'https://minio.local/shopscale-media/invoices/test.pdf?sig=123',
          createdAt: mockInvoice.created_at.toISOString(),
        });
        expect(invoiceService.getInvoiceForOrder).toHaveBeenCalledWith({
          userId: validUserId,
          orderId: validOrderId,
          isPrivileged: false,
        });
      });

      it('throws UnauthorizedException if actor has no userId', async () => {
        await expect(
          ordersController.getOrderInvoice({}, validOrderId),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws NotFoundException if order ID is not a valid UUID', async () => {
        await expect(
          ordersController.getOrderInvoice(
            { actor: { userId: validUserId } },
            'not-a-uuid',
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws NotFoundException when invoice does not exist', async () => {
        vi.mocked(invoiceService.getInvoiceForOrder).mockRejectedValueOnce(
          new InvoiceNotFoundError('Invoice not found'),
        );

        await expect(
          ordersController.getOrderInvoice(
            { actor: { userId: validUserId } },
            validOrderId,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws NotFoundException when caller is not owner (no oracle)', async () => {
        vi.mocked(invoiceService.getInvoiceForOrder).mockRejectedValueOnce(
          new InvoiceForbiddenError('Not authorized'),
        );

        await expect(
          ordersController.getOrderInvoice(
            { actor: { userId: '99999999-9999-9999-9999-999999999999' } },
            validOrderId,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('passes isPrivileged=true for admin or support actor', async () => {
        const mockInvoice = {
          id: '55555555-5555-5555-5555-555555555555',
          order_id: validOrderId,
          user_id: '99999999-9999-9999-9999-999999999999',
          invoice_number: 'INV-2026-ADMIN',
          storage_key: `invoices/${validOrderId}.pdf`,
          total_cents: 5000,
          currency: 'USD',
          status: 'GENERATED' as const,
          created_at: new Date('2026-11-16T12:00:00Z'),
          updated_at: new Date('2026-11-16T12:00:00Z'),
        };

        vi.mocked(invoiceService.getInvoiceForOrder).mockResolvedValueOnce({
          invoice: mockInvoice,
          downloadUrl: 'https://minio.local/shopscale-media/invoices/admin.pdf',
        });

        const result = await ordersController.getOrderInvoice(
          { actor: { userId: validUserId, roles: ['support'] } },
          validOrderId,
        );

        expect(result.invoiceNumber).toBe('INV-2026-ADMIN');
        expect(invoiceService.getInvoiceForOrder).toHaveBeenCalledWith({
          userId: validUserId,
          orderId: validOrderId,
          isPrivileged: true,
        });
      });
    });
  });
});
