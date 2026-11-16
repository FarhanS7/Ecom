// Component tests for SellerInventoryTable and StockAdjustmentModal (T040).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { InventoryItemView } from '@shopscale/contracts';
import {
  computeStockStatus,
  SellerInventoryTable,
} from './inventory-table';

vi.mock('@/features/seller/actions', () => ({
  adjustStockAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

const mockInventory: InventoryItemView[] = [
  {
    variantId: '11111111-1111-4111-a111-111111111111',
    sku: 'SKU-IN-STOCK',
    productTitle: 'Running Shoes',
    onHand: 20,
    reserved: 5,
    available: 15,
    version: 1,
  },
  {
    variantId: '22222222-2222-4222-a222-222222222222',
    sku: 'SKU-LOW-STOCK',
    productTitle: 'Cotton T-Shirt',
    onHand: 4,
    reserved: 1,
    available: 3,
    version: 1,
  },
  {
    variantId: '33333333-3333-4333-a333-333333333333',
    sku: 'SKU-OUT-OF-STOCK',
    productTitle: 'Denim Jacket',
    onHand: 2,
    reserved: 2,
    available: 0,
    version: 1,
  },
];

describe('SellerInventoryTable (T040 Component Tests)', () => {
  describe('computeStockStatus', () => {
    it('accurately identifies stock availability tiers', () => {
      expect(computeStockStatus(0)).toEqual({ label: 'Out of Stock', tone: 'danger' });
      expect(computeStockStatus(-1)).toEqual({ label: 'Out of Stock', tone: 'danger' });
      expect(computeStockStatus(3)).toEqual({ label: 'Low Stock', tone: 'warning' });
      expect(computeStockStatus(5)).toEqual({ label: 'Low Stock', tone: 'warning' });
      expect(computeStockStatus(6)).toEqual({ label: 'In Stock', tone: 'success' });
      expect(computeStockStatus(100)).toEqual({ label: 'In Stock', tone: 'success' });
    });
  });

  describe('table rendering and search filter', () => {
    it('renders all inventory rows with onHand, reserved, and available counts', () => {
      render(
        <SellerInventoryTable
          storeId="store-123"
          initialInventory={mockInventory}
        />,
      );

      expect(screen.getByTestId('variant-row-SKU-IN-STOCK')).toBeDefined();
      expect(screen.getByTestId('on-hand-SKU-IN-STOCK').textContent).toBe('20');
      expect(screen.getByTestId('reserved-SKU-IN-STOCK').textContent).toBe('5');
      expect(screen.getByTestId('available-SKU-IN-STOCK').textContent).toBe('15');

      expect(screen.getByText('Running Shoes')).toBeDefined();
      expect(screen.getByText('Cotton T-Shirt')).toBeDefined();
      expect(screen.getByText('Denim Jacket')).toBeDefined();

      // Badges
      expect(screen.getByText('In Stock')).toBeDefined();
      expect(screen.getByText('Low Stock')).toBeDefined();
      expect(screen.getByText('Out of Stock')).toBeDefined();
    });

    it('filters rows based on user query string', () => {
      render(
        <SellerInventoryTable
          storeId="store-123"
          initialInventory={mockInventory}
        />,
      );

      const searchInput = screen.getByPlaceholderText('Filter by SKU or title...');
      fireEvent.change(searchInput, { target: { value: 'shoes' } });

      expect(screen.getByText('Running Shoes')).toBeDefined();
      expect(screen.queryByText('Cotton T-Shirt')).toBeNull();
      expect(screen.queryByText('Denim Jacket')).toBeNull();
    });
  });

  describe('StockAdjustmentModal interaction', () => {
    it('opens adjustment modal and calculates projected on-hand and available', () => {
      render(
        <SellerInventoryTable
          storeId="store-123"
          initialInventory={mockInventory}
        />,
      );

      const adjustBtn = screen.getAllByRole('button', { name: /Adjust Stock/i })[0]!;
      fireEvent.click(adjustBtn);

      expect(screen.getByTestId('stock-adjustment-modal')).toBeDefined();
      expect(screen.getByText(/Adjust Stock for SKU-IN-STOCK/)).toBeDefined();

      const deltaInput = screen.getByTestId('adjustment-delta-input');
      fireEvent.change(deltaInput, { target: { value: '10' } });

      // Current on-hand 20 + 10 = 30; reserved 5 -> available 25
      expect(screen.getByTestId('projected-on-hand').textContent).toBe('30');
      expect(screen.getByTestId('projected-available').textContent).toBe('25');
    });

    it('displays error if seller attempts to reduce on-hand below reserved count', () => {
      render(
        <SellerInventoryTable
          storeId="store-123"
          initialInventory={mockInventory}
        />,
      );

      const adjustBtn = screen.getAllByRole('button', { name: /Adjust Stock/i })[0]!;
      fireEvent.click(adjustBtn);

      const deltaInput = screen.getByTestId('adjustment-delta-input');
      // On-hand is 20, reserved is 5. -16 delta -> projected 4 < 5 reserved!
      fireEvent.change(deltaInput, { target: { value: '-16' } });

      const submitBtn = screen.getByRole('button', { name: /Apply Adjustment/i });
      fireEvent.click(submitBtn);

      expect(screen.getByTestId('adjustment-error')).toBeDefined();
      expect(screen.getByTestId('adjustment-error').textContent).toContain(
        'Cannot reduce stock below active reservations (5).',
      );
    });
  });
});
