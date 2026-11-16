// Seller store inventory page (T040).
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { loadSellerInventory } from '@/features/seller/load';
import { SellerInventoryTable } from '@/features/seller/inventory-table';

export const metadata = {
  title: 'Inventory & Stock Management | Store Console',
};

export default async function SellerInventoryPage({
  params,
}: {
  params: { storeId: string };
}) {
  const result = await loadSellerInventory(params.storeId);

  if (result.status === 'not-found') notFound();

  if (result.status === 'unavailable') {
    return (
      <Card className="ss-form-card" data-testid="inventory-outage">
        <h2>Inventory temporarily unavailable</h2>
        <p className="ss-error" role="alert">
          We could not load store inventory right now. Please refresh shortly.
        </p>
      </Card>
    );
  }

  if (result.status === 'unauthenticated') {
    return (
      <Card className="ss-form-card">
        <h2>Sign in required</h2>
        <p>Please sign in to view store inventory.</p>
      </Card>
    );
  }

  return (
    <div className="ss-console__stack">
      <SellerInventoryTable storeId={params.storeId} initialInventory={result.data} />
    </div>
  );
}
