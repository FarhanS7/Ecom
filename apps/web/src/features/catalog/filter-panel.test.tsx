// T025b: the filter card writes the URL and nothing else. next/navigation is
// mocked so the assertions are about the URL the reader would actually land on.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterPanel } from '@/features/catalog/filter-panel';

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/products',
}));


beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  nav.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

function pushedQuery(): URLSearchParams {
  const target = String(nav.push.mock.calls[0]?.[0] ?? '');
  return new URLSearchParams(target.split('?')[1] ?? '');
}

describe('sort pills (T025b)', () => {
  it('marks the active sort and links the others without losing the filters', () => {
    nav.params = new URLSearchParams('category=audio&min=10');
    render(<FilterPanel basePath="/products" />);

    const newest = screen.getByRole('link', { name: 'Newest' });
    expect(newest).toHaveAttribute('aria-current', 'true');

    const popular = screen.getByRole('link', { name: 'Popular' });
    expect(popular).not.toHaveAttribute('aria-current');
    const parsed = new URLSearchParams((popular.getAttribute('href') ?? '').split('?')[1]);
    expect(parsed.get('sort')).toBe('popularity');
    expect(parsed.get('category')).toBe('audio');
    expect(parsed.get('min')).toBe('10');
  });

  it('drops the cursor stack when the sort changes (a cursor belongs to one result set)', () => {
    nav.params = new URLSearchParams('sort=newest&after=opaque-cursor');
    render(<FilterPanel basePath="/products" />);

    const parsed = new URLSearchParams(
      (screen.getByRole('link', { name: 'Popular' }).getAttribute('href') ?? '').split('?')[1],
    );
    expect(parsed.get('sort')).toBe('popularity');
    expect(parsed.get('after')).toBeNull();
  });

  it('shows the store-scoped base path for a store channel', () => {
    render(<FilterPanel basePath="/stores/alpha/products" />);
    expect(screen.getByRole('link', { name: 'Newest' })).toHaveAttribute(
      'href',
      '/stores/alpha/products',
    );
  });
});

describe('price and category form (T025b)', () => {
  it('pushes a normalized URL and resets pagination', () => {
    nav.params = new URLSearchParams('sort=price_desc&after=opaque-cursor');
    render(<FilterPanel basePath="/products" />);

    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '25.5' } });
    fireEvent.change(screen.getByLabelText('Category slug'), { target: { value: 'Audio' } });
    const form = screen.getByRole('button', { name: 'Apply filters' }).closest('form');
    fireEvent.submit(form as HTMLFormElement);

    expect(nav.push).toHaveBeenCalledTimes(1);
    const [path] = String(nav.push.mock.calls[0]?.[0] ?? '').split('?');
    expect(path).toBe('/products');
    const parsed = pushedQuery();
    expect(parsed.get('min')).toBe('10');
    expect(parsed.get('max')).toBe('25.5');
    // Normalized exactly like an inbound URL would be (lowercased slug).
    expect(parsed.get('category')).toBe('audio');
    expect(parsed.get('sort')).toBe('price_desc');
    expect(parsed.get('after')).toBeNull();
  });

  it('drops values the parser rejects instead of putting them in the URL', () => {
    render(<FilterPanel basePath="/products" />);
    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: 'free' } });
    fireEvent.change(screen.getByLabelText('Category slug'), { target: { value: '../etc' } });
    const form = screen.getByRole('button', { name: 'Apply filters' }).closest('form');
    fireEvent.submit(form as HTMLFormElement);

    const target = String(nav.push.mock.calls[0]?.[0] ?? '');
    expect(target).toBe('/products');
  });

  it('seeds the inputs from the URL and only offers Clear when a filter is set', () => {
    nav.params = new URLSearchParams('min=10&category=audio&sort=newest');
    const { unmount } = render(<FilterPanel basePath="/products" />);
    expect(screen.getByLabelText('Minimum price')).toHaveValue('10');
    expect(screen.getByLabelText('Category slug')).toHaveValue('audio');
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/products');
    unmount();

    nav.params = new URLSearchParams();
    render(<FilterPanel basePath="/products" />);
    expect(screen.queryByRole('link', { name: 'Clear filters' })).toBeNull();
  });

  it('renders category chips instead of the free-text slug when a set is supplied', () => {
    nav.params = new URLSearchParams('category=audio');
    render(
      <FilterPanel
        basePath="/products"
        categories={[
          { slug: 'audio', name: 'Audio' },
          { slug: 'home', name: 'Home' },
        ]}
      />,
    );

    expect(screen.queryByLabelText('Category slug')).toBeNull();
    const audio = screen.getByRole('link', { name: 'Audio' });
    expect(audio).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/products?category=home',
    );
  });
});
