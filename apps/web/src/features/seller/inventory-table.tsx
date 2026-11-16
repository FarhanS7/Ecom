'use client';

// @shopscale/web features/seller/inventory-table - Seller variant inventory table and adjustment UI (T040).
// Invariants:
// 1. Explicitly displays On Hand, Reserved, and Available stock counters.
// 2. Highlights low stock (<= 5) and out of stock (= 0).
// 3. StockAdjustmentModal enforces valid delta and captures seller reason.
// 4. StockMovementsDrawer displays immutable audit ledger history.

import { useEffect, useState } from 'react';
import type { InventoryItemView, StockMovementItem } from '@shopscale/contracts';
import { Card, PrimaryButton, SecondaryButton, Tag, SelectField } from '@/components/ui';
import { adjustStockAction } from '@/features/seller/actions';

export interface SellerInventoryTableProps {
  storeId: string;
  initialInventory: InventoryItemView[];
}

export function computeStockStatus(available: number): {
  label: string;
  tone: 'danger' | 'warning' | 'success';
} {
  if (available <= 0) return { label: 'Out of Stock', tone: 'danger' };
  if (available <= 5) return { label: 'Low Stock', tone: 'warning' };
  return { label: 'In Stock', tone: 'success' };
}

export function SellerInventoryTable({ storeId, initialInventory }: SellerInventoryTableProps) {
  const [inventory, setInventory] = useState<InventoryItemView[]>(initialInventory);
  const [filter, setFilter] = useState('');
  const [adjustingVariant, setAdjustingVariant] = useState<InventoryItemView | null>(null);
  const [historyVariant, setHistoryVariant] = useState<InventoryItemView | null>(null);

  const filteredItems = inventory.filter((item) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return item.sku.toLowerCase().includes(q) || (item.productTitle?.toLowerCase().includes(q) ?? false);
  });

  const handleStockAdjusted = (updated: { variantId: string; onHand: number; reserved: number; available: number }) => {
    setInventory((prev) =>
      prev.map((item) =>
        item.variantId === updated.variantId
          ? {
              ...item,
              onHand: updated.onHand,
              reserved: updated.reserved,
              available: updated.available,
            }
          : item,
      ),
    );
    setAdjustingVariant(null);
  };

  return (
    <Card className="ss-console__panel" data-testid="seller-inventory-card">
      <div className="ss-console__panel-header flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold">Inventory & Restocking</h2>
          <p className="text-sm text-muted-foreground">
            Track on-hand stock, active checkout reservations, and manage warehouse levels.
          </p>
        </div>
        <div className="w-72">
          <label htmlFor="inventory-search" className="sr-only">
            Search Inventory
          </label>
          <input
            id="inventory-search"
            type="text"
            className="ss-input"
            placeholder="Filter by SKU or title..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="empty-inventory">
          {inventory.length === 0 ? 'No product variants found in this store.' : 'No variants match your search filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" data-testid="inventory-table">
            <thead>
              <tr className="border-b border-border text-sm font-semibold text-muted-foreground">
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Product Title</th>
                <th className="py-3 px-4 text-right">On Hand</th>
                <th className="py-3 px-4 text-right">Reserved</th>
                <th className="py-3 px-4 text-right">Available</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item) => {
                const status = computeStockStatus(item.available);
                return (
                  <tr key={item.variantId} className="hover:bg-muted/50" data-testid={`variant-row-${item.sku}`}>
                    <td className="py-3 px-4 font-mono text-sm font-semibold">{item.sku}</td>
                    <td className="py-3 px-4 text-sm">{item.productTitle ?? 'Untitled Product'}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium" data-testid={`on-hand-${item.sku}`}>
                      {item.onHand}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground font-medium" data-testid={`reserved-${item.sku}`}>
                      {item.reserved}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-bold" data-testid={`available-${item.sku}`}>
                      {item.available}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Tag
                        bordered
                        hot={status.tone === 'danger'}
                      >
                        {status.label}
                      </Tag>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <SecondaryButton
                        onClick={() => setAdjustingVariant(item)}
                        data-testid={`adjust-btn-${item.sku}`}
                      >
                        Adjust Stock
                      </SecondaryButton>
                      <SecondaryButton
                        onClick={() => setHistoryVariant(item)}
                        data-testid={`history-btn-${item.sku}`}
                      >
                        Ledger
                      </SecondaryButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adjustingVariant && (
        <StockAdjustmentModal
          storeId={storeId}
          item={adjustingVariant}
          onClose={() => setAdjustingVariant(null)}
          onSuccess={handleStockAdjusted}
        />
      )}

      {historyVariant && (
        <StockMovementsDrawer
          storeId={storeId}
          item={historyVariant}
          onClose={() => setHistoryVariant(null)}
        />
      )}
    </Card>
  );
}

export interface StockAdjustmentModalProps {
  storeId: string;
  item: InventoryItemView;
  onClose: () => void;
  onSuccess: (updated: { variantId: string; onHand: number; reserved: number; available: number }) => void;
}

export function StockAdjustmentModal({
  storeId,
  item,
  onClose,
  onSuccess,
}: StockAdjustmentModalProps) {
  const [deltaStr, setDeltaStr] = useState('');
  const [reason, setReason] = useState<'manual_adjustment' | 'initial_stock' | 'return_restock'>('manual_adjustment');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const delta = parseInt(deltaStr, 10) || 0;
  const projectedOnHand = item.onHand + delta;
  const projectedAvailable = Math.max(0, projectedOnHand - item.reserved);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (delta === 0) {
      setError('Please enter a non-zero stock adjustment quantity.');
      return;
    }
    if (projectedOnHand < item.reserved) {
      setError(`Cannot reduce stock below active reservations (${item.reserved}).`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await adjustStockAction(storeId, {
        variantId: item.variantId,
        deltaOnHand: delta,
        reason,
      });

      if (res.status === 'ok') {
        onSuccess({
          variantId: item.variantId,
          onHand: res.data.onHand,
          reserved: res.data.reserved,
          available: res.data.available,
        });
      } else if (res.status === 'conflict') {
        setError(res.message);
      } else {
        setError('Failed to adjust stock. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjustment-modal-title"
      data-testid="stock-adjustment-modal"
    >
      <div className="bg-background rounded-lg shadow-xl max-w-md w-full p-6 border border-border">
        <h3 id="adjustment-modal-title" className="text-lg font-bold mb-2">
          Adjust Stock for {item.sku}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Current On Hand: <strong>{item.onHand}</strong> | Reserved:{' '}
          <strong>{item.reserved}</strong> | Available: <strong>{item.available}</strong>
        </p>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="deltaOnHand" className="block text-sm font-medium mb-1">
              Stock Delta (+ for addition, - for removal)
            </label>
            <input
              id="deltaOnHand"
              type="number"
              step="1"
              value={deltaStr}
              onChange={(e) => setDeltaStr(e.target.value)}
              className="w-full px-3 py-2 border rounded-md border-border bg-background"
              placeholder="e.g. +20 or -5"
              autoFocus
              data-testid="adjustment-delta-input"
            />
          </div>

          <SelectField
            label="Adjustment Reason"
            name="reason"
            value={reason}
            onChange={(val) => setReason(val as 'manual_adjustment' | 'initial_stock' | 'return_restock')}
            options={[
              { value: 'manual_adjustment', label: 'Manual Adjustment / Correction' },
              { value: 'initial_stock', label: 'Initial Inventory Ingestion' },
              { value: 'return_restock', label: 'Customer Return Restocking' },
            ]}
          />

          <div className="p-3 bg-muted rounded-md text-sm space-y-1">
            <div>
              Projected On Hand: <strong data-testid="projected-on-hand">{projectedOnHand}</strong>
            </div>
            <div>
              Projected Available:{' '}
              <strong data-testid="projected-available">{projectedAvailable}</strong>
            </div>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200" role="alert" data-testid="adjustment-error">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <SecondaryButton onClick={onClose} disabled={isSubmitting}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" loading={isSubmitting} data-testid="submit-adjustment-btn">
              Apply Adjustment
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface StockMovementsDrawerProps {
  storeId: string;
  item: InventoryItemView;
  onClose: () => void;
}

export function StockMovementsDrawer({
  storeId,
  item,
  onClose,
}: StockMovementsDrawerProps) {
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/v1/seller/stores/${storeId}/inventory/${item.variantId}/movements`);
        if (!res.ok) throw new Error('Failed to load ledger history');
        const data = (await res.json()) as { items: StockMovementItem[] };
        if (active) setMovements(data.items ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error loading history');
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchHistory();
    return () => {
      active = false;
    };
  }, [storeId, item.variantId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="movements-drawer-title"
      data-testid="stock-movements-drawer"
    >
      <div className="bg-background h-full max-w-lg w-full p-6 border-l border-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h3 id="movements-drawer-title" className="text-lg font-bold">
              Movement Ledger
            </h3>
            <p className="text-sm text-muted-foreground font-mono">{item.sku}</p>
          </div>
          <SecondaryButton onClick={onClose} data-testid="close-drawer-btn">
            Close
          </SecondaryButton>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading audit movements...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">{error}</div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No movements recorded for this variant.</div>
          ) : (
            <div className="space-y-3">
              {movements.map((mov) => (
                <div key={mov.id} className="p-3 bg-muted/40 rounded-md border border-border text-sm space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>{mov.reason}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(mov.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs font-mono">
                    {mov.deltaOnHand !== 0 && (
                      <span className={mov.deltaOnHand > 0 ? 'text-green-600' : 'text-red-600'}>
                        OnHand: {mov.deltaOnHand > 0 ? `+${mov.deltaOnHand}` : mov.deltaOnHand}
                      </span>
                    )}
                    {mov.deltaReserved !== 0 && (
                      <span className={mov.deltaReserved > 0 ? 'text-amber-600' : 'text-blue-600'}>
                        Reserved: {mov.deltaReserved > 0 ? `+${mov.deltaReserved}` : mov.deltaReserved}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">OpKey: {mov.operationKey}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
