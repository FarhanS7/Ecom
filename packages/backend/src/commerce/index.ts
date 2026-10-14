// @shopscale/backend/commerce - Checkout, orders, seller suborders, fulfillment, returns, refunds
export interface Order {
  id: string;
  userId: string;
  channel: 'marketplace' | 'store';
  storeId: string | null;
  status: 'pending' | 'paid' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  totalCents: number;
  currency: string;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  sellerId: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Suborder {
  id: string;
  orderId: string;
  sellerId: string;
  status: 'pending' | 'paid' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  items: OrderItem[];
}

export interface CommercePorts {
  createOrder(data: {
    userId: string;
    channel: 'marketplace' | 'store';
    storeId: string | null;
    items: Array<{ variantId: string; quantity: number; unitPriceCents: number }>;
    shippingAddressId: string;
    billingAddressId: string | null;
    couponCode: string | null;
    idempotencyKey: string;
  }): Promise<Order>;
  findOrderById(id: string): Promise<Order | null>;
  findOrdersByUser(userId: string, options: { cursor?: string; limit: number }): Promise<{ items: Order[]; nextCursor: string | null }>;
  findSubordersBySeller(sellerId: string, options: { cursor?: string; limit: number }): Promise<{ items: Suborder[]; nextCursor: string | null }>;
  transitionSuborder(suborderId: string, toStatus: Suborder['status']): Promise<void>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
  requestReturn(data: { orderId: string; suborderId: string; items: Array<{ orderItemId: string; quantity: number }>; reason: string }): Promise<void>;
  processRefund(data: { orderId: string; suborderId: string; amountCents: number; reason: string }): Promise<void>;
}

export const commercePorts: CommercePorts = {
  async createOrder() { throw new Error('Not implemented'); },
  async findOrderById() { return null; },
  async findOrdersByUser() { return { items: [], nextCursor: null }; },
  async findSubordersBySeller() { return { items: [], nextCursor: null }; },
  async transitionSuborder() { throw new Error('Not implemented'); },
  async cancelOrder() { throw new Error('Not implemented'); },
  async requestReturn() { throw new Error('Not implemented'); },
  async processRefund() { throw new Error('Not implemented'); },
};