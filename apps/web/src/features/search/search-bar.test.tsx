// Unit tests for SearchAutocomplete (T032)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SearchAutocomplete } from './search-bar';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
}));

describe('SearchAutocomplete Component (T032)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    nav.push.mockReset();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders search input with combobox ARIA roles', () => {
    render(<SearchAutocomplete placeholder="Search anything…" />);

    const input = screen.getByRole('combobox');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
  });

  it('fetches suggestions after debounced typing and renders dropdown', async () => {
    const fakeSuggestions = [
      { type: 'product', text: 'Wireless Headphones', slug: 'wireless-headphones', priceCents: 9900 },
      { type: 'category', text: 'Headphones', slug: 'headphones' },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ suggestions: fakeSuggestions }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<SearchAutocomplete />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'head' } });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeDefined();
    });

    expect(screen.getByText('Wireless Headphones')).toBeDefined();
    expect(screen.getByText('Headphones')).toBeDefined();
    expect(screen.getByText('$99.00')).toBeDefined();
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('navigates through suggestions using ArrowDown, ArrowUp, and Enter keys', async () => {
    const fakeSuggestions = [
      { type: 'product', text: 'Item 1', slug: 'item-1', priceCents: 1000 },
      { type: 'product', text: 'Item 2', slug: 'item-2', priceCents: 2000 },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ suggestions: fakeSuggestions }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<SearchAutocomplete />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'item' } });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeDefined();
    });

    // ArrowDown -> highlights option 0
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('suggestion-option-0');

    // ArrowDown -> highlights option 1
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('suggestion-option-1');

    // ArrowUp -> back to option 0
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe('suggestion-option-0');

    // Enter -> selects highlighted option and navigates
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(nav.push).toHaveBeenCalledWith('/products/item-1');
  });

  it('closes dropdown on Escape key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ suggestions: [{ type: 'product', text: 'Test', slug: 'test' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<SearchAutocomplete />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeDefined();
    });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });
});
