// scripts/settlement.ts - CLI command to trigger periodic simulated seller settlements (T070).
import { getDb, settlementService } from '@shopscale/backend';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const storeIdArg = args.find((a) => a.startsWith('--store='))?.split('=')[1];
  const daysArg = args.find((a) => a.startsWith('--days='))?.split('=')[1];
  const days = daysArg ? parseInt(daysArg, 10) : 7;

  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  console.log('--- ShopScale Simulated Seller Settlement CLI ---');
  console.log(`Settlement Period: [${periodStart.toISOString()} -> ${periodEnd.toISOString()}] (${days} days)`);

  const sql = getDb();
  try {
    if (storeIdArg) {
      console.log(`Settling single store: ${storeIdArg}`);
      const res = await settlementService.settleStorePeriod({
        storeId: storeIdArg,
        periodStart,
        periodEnd,
      });
      console.log('\nSettlement Result:');
      console.log(`  Payout ID:             ${res.payoutId}`);
      console.log(`  Store ID:              ${res.storeId}`);
      console.log(`  Gross Sales:           $${(res.grossSalesCents / 100).toFixed(2)}`);
      console.log(`  Refund Deductions:     $${(res.refundDeductionsCents / 100).toFixed(2)}`);
      console.log(`  Net Sales:             $${(res.netSalesCents / 100).toFixed(2)}`);
      console.log(`  Commission (${(res.commissionBps / 100).toFixed(2)}%):  $${(res.commissionCents / 100).toFixed(2)}`);
      console.log(`  Net Payout:            $${(res.amountCents / 100).toFixed(2)}`);
      console.log(`  Carried Forward:       $${(res.carriedForwardCents / 100).toFixed(2)}`);
      console.log(`  Status:                ${res.status}`);
      console.log(`  Effect Key:            ${res.effectKey}`);
      console.log(`  Existing:              ${res.isExisting ? 'YES' : 'NO'}`);
    } else {
      console.log('Settling all active stores...');
      const results = await settlementService.settleAllStoresPeriod({
        periodStart,
        periodEnd,
      });
      console.log(`\nProcessed ${results.length} stores.`);
      for (const res of results) {
        console.log(
          `  Store ${res.storeId.slice(0, 8)}: Gross=$${(res.grossSalesCents / 100).toFixed(2)}, ` +
            `Net=$${(res.netSalesCents / 100).toFixed(2)}, Commission=$${(res.commissionCents / 100).toFixed(2)}, ` +
            `Payout=$${(res.amountCents / 100).toFixed(2)}, Status=${res.status}`,
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Settlement CLI failed:', err);
  process.exit(1);
});
