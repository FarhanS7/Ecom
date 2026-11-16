// @shopscale/backend/commerce/pii-masker.test - Unit tests for PIIMasker (T055)
import { describe, expect, it } from 'vitest';
import { maskAddressSnapshot } from './pii-masker.js';
import type { AddressSnapshot } from './schema.js';

describe('PIIMasker (T055 Unit Tests)', () => {
  const sampleAddress: AddressSnapshot = {
    fullName: 'Jane Doe',
    line1: '123 Market Street',
    line2: 'Suite 400',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94103',
    country: 'USA',
    phone: '+1-555-0199',
  };

  it('preserves full address when order is PAID', () => {
    const result = maskAddressSnapshot(sampleAddress, true);
    expect(result).toEqual(sampleAddress);
    expect(result.fullName).toBe('Jane Doe');
    expect(result.line1).toBe('123 Market Street');
    expect(result.line2).toBe('Suite 400');
    expect(result.phone).toBe('+1-555-0199');
  });

  it('masks recipient name, street lines, and phone when order is unpaid (PENDING/FAILED)', () => {
    const result = maskAddressSnapshot(sampleAddress, false);

    // Masked PII
    expect(result.fullName).toBe('*** MASKED UNTIL PAID ***');
    expect(result.line1).toBe('*** MASKED UNTIL PAID ***');
    expect(result.line2).toBeNull();
    expect(result.phone).toBe('***-***-****');

    // Preserved non-PII logistics fields
    expect(result.city).toBe('San Francisco');
    expect(result.state).toBe('CA');
    expect(result.postalCode).toBe('94103');
    expect(result.country).toBe('USA');
  });

  it('handles address without line2 or phone cleanly when unpaid', () => {
    const minimalAddress: AddressSnapshot = {
      fullName: 'John Smith',
      line1: '456 Oak Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'USA',
    };

    const result = maskAddressSnapshot(minimalAddress, false);
    expect(result.fullName).toBe('*** MASKED UNTIL PAID ***');
    expect(result.line1).toBe('*** MASKED UNTIL PAID ***');
    expect(result.line2).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.city).toBe('Austin');
  });
});
