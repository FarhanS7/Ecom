// @shopscale/backend/commerce/pii-masker - PII privacy protection utility (T055).
// Invariants:
// 1. If order is unpaid (payment_status !== 'PAID'), customer PII (fullName, line1, line2, phone) is masked for seller views.
// 2. Only once order is PAID is shipping address unmasked to vendors for fulfillment.
// 3. Regional fields (city, state, postalCode, country) remain visible for zone & rate determination.

import type { AddressSnapshot } from './schema.js';

export function maskAddressSnapshot(
  address: AddressSnapshot,
  isPaid: boolean,
): AddressSnapshot {
  if (isPaid) {
    return { ...address };
  }

  return {
    fullName: '*** MASKED UNTIL PAID ***',
    line1: '*** MASKED UNTIL PAID ***',
    line2: null,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    phone: address.phone ? '***-***-****' : null,
  };
}
