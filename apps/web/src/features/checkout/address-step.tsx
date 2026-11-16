'use client';

// @shopscale/web features/checkout/address-step - Address selector and inline creation (T048).

import { useState } from 'react';
import type { AddressItem } from './types';
import { createAddress } from './client';

interface AddressStepProps {
  addresses: AddressItem[];
  selectedAddressId: string | null;
  onSelectAddress: (addressId: string) => void;
  onAddressCreated: (address: AddressItem) => void;
  onContinue: () => void;
}

const EMPTY_FORM = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'United States',
};

export function AddressStep({
  addresses,
  selectedAddressId,
  onSelectAddress,
  onAddressCreated,
  onContinue,
}: AddressStepProps) {
  const [showNewForm, setShowNewForm] = useState(addresses.length === 0);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim() || !formData.line1.trim() || !formData.city.trim() || !formData.postalCode.trim()) {
      setFormError('Please fill in all required address fields.');
      return;
    }

    setIsSaving(true);
    try {
      const created = await createAddress(formData);
      onAddressCreated(created);
      onSelectAddress(created.id);
      setShowNewForm(false);
      setFormData(EMPTY_FORM);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save address.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section aria-labelledby="checkout-address-heading" className="ss-checkout-section" data-testid="address-step">
      <h2 id="checkout-address-heading" className="type-h3" style={{ marginBottom: 'var(--space-4)' }}>
        1. Shipping Address
      </h2>

      {addresses.length > 0 && !showNewForm && (
        <div className="ss-address-list" role="radiogroup" aria-label="Saved shipping addresses">
          {addresses.map((addr) => {
            const isSelected = selectedAddressId === addr.id;
            const fields = addr.fields;
            return (
              <label
                key={addr.id}
                className={`ss-address-card ${isSelected ? 'ss-address-card--selected' : ''}`}
                data-testid={`address-card-${addr.id}`}
              >
                <input
                  type="radio"
                  name="shipping_address"
                  value={addr.id}
                  checked={isSelected}
                  onChange={() => onSelectAddress(addr.id)}
                  aria-label={`Ship to ${fields.name || 'this address'}`}
                  data-testid={`address-radio-${addr.id}`}
                />
                <div className="ss-address-card__content">
                  <span className="type-label" style={{ fontWeight: 600 }}>
                    {fields.name || fields.fullName || 'Saved Address'}
                  </span>
                  <span className="type-body-sm">{fields.line1}</span>
                  {fields.line2 && <span className="type-body-sm">{fields.line2}</span>}
                  <span className="type-body-sm">
                    {fields.city}, {fields.region || fields.state} {fields.postalCode}
                  </span>
                  <span className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                    {fields.country}
                  </span>
                </div>
              </label>
            );
          })}

          <div style={{ marginTop: 'var(--space-3)' }}>
            <button
              type="button"
              className="ss-link-button"
              onClick={() => setShowNewForm(true)}
              data-testid="add-new-address-btn"
            >
              + Add a new shipping address
            </button>
          </div>

          <div style={{ marginTop: 'var(--space-6)' }}>
            <button
              type="button"
              className="ui-button ui-button--primary"
              disabled={!selectedAddressId}
              onClick={onContinue}
              data-testid="continue-to-review-btn"
            >
              Continue to Order Review
            </button>
          </div>
        </div>
      )}

      {showNewForm && (
        <form
          onSubmit={(e) => {
            void handleCreateAddress(e);
          }}
          className="ss-new-address-form"
          data-testid="new-address-form"
        >
          {formError && (
            <div className="ss-form-error" role="alert" style={{ marginBottom: 'var(--space-4)', color: 'var(--color-danger)' }}>
              {formError}
            </div>
          )}

          <div className="ss-form-grid" style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div>
              <label htmlFor="addr-name" className="type-label">Full Name *</label>
              <input
                id="addr-name"
                name="name"
                type="text"
                required
                className="ui-input"
                value={formData.name}
                onChange={handleInputChange}
                data-testid="input-addr-name"
              />
            </div>

            <div>
              <label htmlFor="addr-line1" className="type-label">Street Address *</label>
              <input
                id="addr-line1"
                name="line1"
                type="text"
                required
                className="ui-input"
                value={formData.line1}
                onChange={handleInputChange}
                data-testid="input-addr-line1"
              />
            </div>

            <div>
              <label htmlFor="addr-line2" className="type-label">Apartment, suite, unit (optional)</label>
              <input
                id="addr-line2"
                name="line2"
                type="text"
                className="ui-input"
                value={formData.line2}
                onChange={handleInputChange}
                data-testid="input-addr-line2"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label htmlFor="addr-city" className="type-label">City *</label>
                <input
                  id="addr-city"
                  name="city"
                  type="text"
                  required
                  className="ui-input"
                  value={formData.city}
                  onChange={handleInputChange}
                  data-testid="input-addr-city"
                />
              </div>

              <div>
                <label htmlFor="addr-region" className="type-label">State / Region *</label>
                <input
                  id="addr-region"
                  name="region"
                  type="text"
                  required
                  className="ui-input"
                  value={formData.region}
                  onChange={handleInputChange}
                  data-testid="input-addr-region"
                />
              </div>

              <div>
                <label htmlFor="addr-postalCode" className="type-label">ZIP / Postal *</label>
                <input
                  id="addr-postalCode"
                  name="postalCode"
                  type="text"
                  required
                  className="ui-input"
                  value={formData.postalCode}
                  onChange={handleInputChange}
                  data-testid="input-addr-postalCode"
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)' }}>
            <button
              type="submit"
              className="ui-button ui-button--primary"
              disabled={isSaving}
              data-testid="save-address-btn"
            >
              {isSaving ? 'Saving Address...' : 'Use This Address'}
            </button>
            {addresses.length > 0 && (
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => setShowNewForm(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
