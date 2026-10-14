'use client';

// Customer address management (T091b): list, create, edit, delete through
// the same-origin gateway. Validation errors announce; input persists across
// failed submits; deletes confirm inline (two-step button, no dialog trap).

import { useCallback, useEffect, useState } from 'react';
import { gatewayRequest } from '@/lib/csrf';
import { Field, useAuthForm } from '@/features/auth/auth-forms';

interface AddressItem {
  id: string;
  fields: Record<string, string>;
  createdAt: string;
}

const EMPTY = { name: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: '', phone: '' };

function fieldError(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    if (typeof record['detail'] === 'string') return record['detail'];
    if (typeof record['title'] === 'string') return record['title'];
  }
  return 'Request failed.';
}

export function AddressesSection() {
  const [items, setItems] = useState<AddressItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { serverError, pending, submit } = useAuthForm();

  const reload = useCallback(async () => {
    try {
      const res = await gatewayRequest('/api/v1/me/addresses', { method: 'GET' });
      if (res.ok) {
        const body = (await res.json()) as { items?: AddressItem[] };
        setItems(Array.isArray(body.items) ? body.items : []);
      }
    } catch {
      // List stays as-is on network failure; the form below still works.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startEdit(item: AddressItem): void {
    setEditingId(item.id);
    setForm({ ...EMPTY, ...item.fields });
    setConfirmDeleteId(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function save(): Promise<void> {
    const payload = { ...form, line2: form.line2 === '' ? undefined : form.line2, phone: form.phone === '' ? undefined : form.phone };
    await submit(async () => {
      const res = editingId
        ? await gatewayRequest(`/api/v1/me/addresses/${editingId}`, { method: 'PATCH', body: payload })
        : await gatewayRequest('/api/v1/me/addresses', { method: 'POST', body: payload });
      if (res.ok) {
        cancelEdit();
        await reload();
        return { ok: true, detail: '' };
      }
      return { ok: false, detail: fieldError(await res.json().catch(() => null)) };
    });
  }

  async function remove(id: string): Promise<void> {
    await submit(async () => {
      const res = await gatewayRequest(`/api/v1/me/addresses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConfirmDeleteId(null);
        await reload();
        return { ok: true, detail: '' };
      }
      return { ok: false, detail: 'Delete failed.' };
    });
  }

  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <section aria-labelledby="addresses-title">
      <h2 id="addresses-title">Addresses</h2>
      {!loaded ? (
        <p role="status">Loading addresses…</p>
      ) : items.length === 0 ? (
        <p>No saved addresses yet.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.fields['name']}</strong>
              <br />
              {item.fields['line1']}, {item.fields['city']} {item.fields['postalCode']}
              <br />
              <button type="button" onClick={() => startEdit(item)} style={{ minHeight: '44px' }}>
                Edit
              </button>{' '}
              {confirmDeleteId === item.id ? (
                <span>
                  <button type="button" onClick={() => void remove(item.id)} disabled={pending} style={{ minHeight: '44px' }}>
                    Confirm delete
                  </button>{' '}
                  <button type="button" onClick={() => setConfirmDeleteId(null)} style={{ minHeight: '44px' }}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteId(item.id)} style={{ minHeight: '44px' }}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>{editingId ? 'Edit address' : 'Add address'}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Full name" name="addr-name" value={form.name} onChange={set('name')} autoComplete="name" />
        <Field label="Street" name="addr-line1" value={form.line1} onChange={set('line1')} autoComplete="street-address" />
        <Field label="Apt / suite (optional)" name="addr-line2" value={form.line2} onChange={set('line2')} required={false} />
        <Field label="City" name="addr-city" value={form.city} onChange={set('city')} autoComplete="address-level2" />
        <Field label="Region" name="addr-region" value={form.region} onChange={set('region')} autoComplete="address-level1" />
        <Field label="Postal code" name="addr-postal" value={form.postalCode} onChange={set('postalCode')} autoComplete="postal-code" />
        <Field label="Country (2 letters)" name="addr-country" value={form.country} onChange={set('country')} autoComplete="country" />
        <Field label="Phone (optional)" name="addr-phone" type="tel" value={form.phone} onChange={set('phone')} required={false} autoComplete="tel" />
        <button type="submit" disabled={pending} style={{ minHeight: '44px' }}>
          {pending ? 'Saving…' : editingId ? 'Save changes' : 'Add address'}
        </button>{' '}
        {editingId ? (
          <button type="button" onClick={cancelEdit} style={{ minHeight: '44px' }}>
            Cancel
          </button>
        ) : null}
      </form>
      {serverError ? (
        <p role="alert" style={{ color: 'var(--color-error)' }}>
          {serverError}
        </p>
      ) : null}
    </section>
  );
}
