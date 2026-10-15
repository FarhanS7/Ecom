'use client';

// @shopscale/web features/seller/variant-table - Variants (T027c).
// Variants ARE the prices: the product's minimum is derived from them, and a
// product cannot be published without at least one active variant.
//
// Every write here is version-gated by the PRODUCT's counter (T020b), and the
// server action returns the re-read product with it, so the table hands a fresh
// version back to the workspace after each save. SKU is immutable — the API's
// update contract has no sku field, because order lines reference variants.

import { useState } from 'react';
import type { ProductResponse, VariantResponse } from '@shopscale/contracts';
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  Tag,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { saveVariant } from '@/features/seller/actions';
import {
  formatAttributes,
  formatMajorUnits,
  type FieldErrors,
  type VariantFormValues,
} from '@/features/seller/validation';
import { ActionNotice, ConflictNotice } from '@/features/seller/notices';
import { formatPrice } from '@/lib/price';

export interface VariantTableProps {
  storeId: string;
  product: ProductResponse;
  variants: VariantResponse[];
  /** `false` when the list could not be loaded — an outage, not "no variants". */
  loaded: boolean;
  onVariants: (variants: VariantResponse[]) => void;
  /** Adopts the version the write bumped, so the next write stays current. */
  onProduct: (product: ProductResponse) => void;
}

type Notice = { tone: 'ok' | 'error'; text: string } | null;

const EMPTY_ADD: VariantFormValues = { sku: '', price: '', attributes: '', status: 'active' };

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function attributeSummary(attributes: Record<string, unknown>): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return 'No attributes';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
}

export function VariantTable({
  storeId,
  product,
  variants,
  loaded,
  onVariants,
  onProduct,
}: VariantTableProps) {
  const [add, setAdd] = useState<VariantFormValues>(EMPTY_ADD);
  const [addErrors, setAddErrors] = useState<FieldErrors>({});
  const [addNotice, setAddNotice] = useState<Notice>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<VariantFormValues>(EMPTY_ADD);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [editNotice, setEditNotice] = useState<Notice>(null);
  // A saved row closes, so its confirmation cannot live inside the row.
  const [editSaved, setEditSaved] = useState<Notice>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editConflict, setEditConflict] = useState<{
    message: string;
    current: ProductResponse | null;
  } | null>(null);

  async function submitAdd() {
    setAddBusy(true);
    setAddNotice(null);
    setAddErrors({});
    const state = await saveVariant({
      storeId,
      productId: product.id,
      variantId: null,
      expectedVersion: product.version,
      values: add,
    });
    setAddBusy(false);

    switch (state.status) {
      case 'saved':
        onVariants([...variants, state.variant]);
        if (state.product) onProduct(state.product);
        setAdd(EMPTY_ADD);
        setAddNotice(
          state.product
            ? { tone: 'ok', text: `Added ${state.variant.sku}.` }
            : {
                tone: 'error',
                text: `Added ${state.variant.sku}, but the product version could not be refreshed. Reload this page before the next change.`,
              },
        );
        return;
      case 'invalid':
        setAddErrors(state.errors);
        setAddNotice({ tone: 'error', text: 'Check the highlighted fields.' });
        return;
      case 'conflict':
        // A create carries no version, so its only conflict is the scoped
        // unique SKU: the message belongs on that field.
        setAddErrors({ sku: state.message });
        setAddNotice({ tone: 'error', text: 'Check the highlighted fields.' });
        return;
      case 'not-found':
        setAddNotice({ tone: 'error', text: 'This product is not available to your account.' });
        return;
      case 'unauthenticated':
        setAddNotice({ tone: 'error', text: 'Your session has expired. Sign in again to continue.' });
        return;
      default:
        setAddNotice({
          tone: 'error',
          text: 'We could not reach the catalog just now. Please try again shortly.',
        });
    }
  }

  function startEdit(variant: VariantResponse) {
    setEditingId(variant.id);
    setEdit({
      sku: variant.sku,
      price: formatMajorUnits(variant.priceCents),
      attributes: formatAttributes(variant.attributes),
      status: variant.status,
    });
    setEditErrors({});
    setEditNotice(null);
    setEditSaved(null);
    setEditConflict(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditErrors({});
    setEditNotice(null);
    setEditConflict(null);
  }

  async function submitEdit(retryVersion?: number) {
    if (editingId === null) return;
    setEditBusy(true);
    setEditNotice(null);
    setEditErrors({});
    setEditConflict(null);
    const state = await saveVariant({
      storeId,
      productId: product.id,
      variantId: editingId,
      expectedVersion: retryVersion ?? product.version,
      values: edit,
    });
    setEditBusy(false);

    switch (state.status) {
      case 'saved':
        onVariants(variants.map((item) => (item.id === state.variant.id ? state.variant : item)));
        if (state.product) onProduct(state.product);
        setEditingId(null);
        setEditNotice(null);
        setEditSaved(
          state.product
            ? { tone: 'ok', text: `Saved ${state.variant.sku}.` }
            : {
                tone: 'error',
                text: `Saved ${state.variant.sku}, but the product version could not be refreshed. Reload this page before the next change.`,
              },
        );
        return;
      case 'invalid':
        setEditErrors(state.errors);
        setEditNotice({ tone: 'error', text: 'Check the highlighted fields.' });
        return;
      case 'conflict':
        // The conflict payload describes the PRODUCT (the versioned row), not
        // the variant, so only "apply my changes" is offered: there is no
        // current variant to reload from here.
        setEditConflict({ message: state.message, current: state.current });
        return;
      case 'not-found':
        setEditNotice({ tone: 'error', text: 'This variant is not available to your account.' });
        return;
      case 'unauthenticated':
        setEditNotice({ tone: 'error', text: 'Your session has expired. Sign in again to continue.' });
        return;
      default:
        setEditNotice({
          tone: 'error',
          text: 'We could not reach the catalog just now. Please try again shortly.',
        });
    }
  }

  return (
    <Card className="ss-form-card">
      <section aria-labelledby="variants-title" className="ss-stack">
        <h3 id="variants-title" className="type-h3">
          Variants
        </h3>
        <p className="type-caption">
          Prices come from variants, and the product shows the lowest active price.
        </p>

        {!loaded ? (
          <ActionNotice tone="error">
            The variant list could not be loaded just now. Reload the page to try again.
          </ActionNotice>
        ) : variants.length === 0 ? (
          <p className="type-caption">
            No variants yet. A product needs at least one active variant before it can be published.
          </p>
        ) : (
          <ul className="ss-variants-list">
            {variants.map((variant) => (
              <li key={variant.id} className="ss-variants-list__row">
                {editingId === variant.id ? (
                  <form
                    className="ss-form ss-form--inline"
                    noValidate
                    aria-label={`Edit ${variant.sku}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitEdit();
                    }}
                  >
                    <p className="ss-hint">
                      SKU <code>{variant.sku}</code> cannot change.
                    </p>
                    <TextField
                      label="Price"
                      name={`variant-price-${variant.id}`}
                      value={edit.price}
                      onChange={(value) => setEdit((previous) => ({ ...previous, price: value }))}
                      error={editErrors['priceCents']}
                    />
                    <SelectField
                      label="Status"
                      name={`variant-status-${variant.id}`}
                      value={edit.status}
                      options={STATUS_OPTIONS}
                      onChange={(value) =>
                        setEdit((previous) => ({
                          ...previous,
                          status: value === 'inactive' ? 'inactive' : 'active',
                        }))
                      }
                      error={editErrors['status']}
                    />
                    <TextAreaField
                      label="Attributes"
                      name={`variant-attributes-${variant.id}`}
                      value={edit.attributes}
                      onChange={(value) => setEdit((previous) => ({ ...previous, attributes: value }))}
                      rows={2}
                      hint='One per line, like "color = Black".'
                      error={editErrors['attributes']}
                    />
                    <div className="ss-form__actions">
                      <PrimaryButton type="submit" loading={editBusy}>
                        Save variant
                      </PrimaryButton>
                      <SecondaryButton onClick={cancelEdit}>Cancel</SecondaryButton>
                    </div>
                    {editNotice ? (
                      <ActionNotice tone={editNotice.tone}>{editNotice.text}</ActionNotice>
                    ) : null}
                    {editConflict ? (
                      <ConflictNotice
                        message={editConflict.message}
                        onApply={
                          editConflict.current
                            ? () => void submitEdit(editConflict.current?.version)
                            : undefined
                        }
                      />
                    ) : null}
                  </form>
                ) : (
                  <>
                    <div className="ss-variants-list__cell">
                      <strong>{variant.sku}</strong>
                      <p className="type-caption">
                        {formatPrice(variant.priceCents, product.currency)}
                      </p>
                    </div>
                    <div className="ss-variants-list__cell">
                      <Tag bordered={variant.status !== 'active'}>
                        {variant.status === 'active' ? 'Active' : 'Inactive'}
                      </Tag>
                    </div>
                    <p className="type-caption ss-variants-list__attributes">
                      {attributeSummary(variant.attributes)}
                    </p>
                    <SecondaryButton onClick={() => startEdit(variant)}>
                      {`Edit ${variant.sku}`}
                    </SecondaryButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {editSaved ? (
          <ActionNotice tone={editSaved.tone}>{editSaved.text}</ActionNotice>
        ) : null}

        <form
          className="ss-form ss-form--inline"
          noValidate
          aria-label="Add a variant"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdd();
          }}
        >
          <h4 className="type-card-title">Add a variant</h4>
          <TextField
            label="SKU"
            name="add-sku"
            value={add.sku}
            onChange={(value) => setAdd((previous) => ({ ...previous, sku: value }))}
            required={false}
            error={addErrors['sku']}
          />
          <TextField
            label="Price"
            name="add-price"
            value={add.price}
            onChange={(value) => setAdd((previous) => ({ ...previous, price: value }))}
            required={false}
            error={addErrors['priceCents']}
          />
          <TextAreaField
            label="Attributes"
            name="add-attributes"
            value={add.attributes}
            onChange={(value) => setAdd((previous) => ({ ...previous, attributes: value }))}
            rows={2}
            hint='One per line, like "color = Black".'
            error={addErrors['attributes']}
          />
          <div className="ss-form__actions">
            <PrimaryButton type="submit" loading={addBusy}>
              Add variant
            </PrimaryButton>
          </div>
          {addNotice ? <ActionNotice tone={addNotice.tone}>{addNotice.text}</ActionNotice> : null}
        </form>
      </section>
    </Card>
  );
}
