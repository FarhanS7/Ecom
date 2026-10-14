// @shopscale/backend/inventory - Stock invariants, reservations, movement ledger
export interface Inventory {
  variantId: string;
  onHand: number;
  reserved: number;
  version: number;
}

export interface StockMovement {
  id: string;
  variantId: string;
  delta: number;
  reason: 'reservation' | 'confirmation' | 'release' | 'adjustment' | 'restock' | 'damage' | 'return';
  refType: 'order' | 'reservation' | 'adjustment' | null;
  refId: string | null;
  createdAt: Date;
}

export interface Reservation {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  expiresAt: Date;
  status: 'active' | 'confirmed' | 'released' | 'expired';
}

export interface InventoryPorts {
  getAvailability(variantIds: string[]): Promise<Map<string, { onHand: number; reserved: number; available: number }>>;
  reserve(items: Array<{ variantId: string; quantity: number }>, orderId: string, ttlMinutes: number): Promise<Reservation[]>;
  confirmReservation(reservationId: string): Promise<void>;
  releaseReservation(reservationId: string, reason: 'expired' | 'cancelled' | 'payment_failed'): Promise<void>;
  adjustStock(variantId: string, delta: number, reason: StockMovement['reason'], refType: StockMovement['refType'], refId: string | null): Promise<void>;
  getMovements(variantId: string, limit: number): Promise<StockMovement[]>;
}

export const inventoryPorts: InventoryPorts = {
  async getAvailability() { return new Map(); },
  async reserve() { throw new Error('Not implemented'); },
  async confirmReservation() { throw new Error('Not implemented'); },
  async releaseReservation() { throw new Error('Not implemented'); },
  async adjustStock() { throw new Error('Not implemented'); },
  async getMovements() { return []; },
};