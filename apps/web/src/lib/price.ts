// @shopscale/web lib/price - Money formatting (T024a, shared from T025b).
// Deterministic, locale-pinned: server and client must render the same label,
// otherwise hydration would mismatch. The fallback covers a currency code the
// runtime cannot format (never throws into a render).

export function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
