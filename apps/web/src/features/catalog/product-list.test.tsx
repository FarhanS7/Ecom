// T025b: PLP results island — request shape, race safety, and the states.
// next/navigation is mocked so the URL under test is fully controlled.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductList } from '@/features/catalog/product-list';

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

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

function product(id: string, slug: string, title: string) {
  return {
    id,
    slug,
    title,
    brand: null,
    priceCents: 1234,
    currency: 'USD',
    ratingCount: 3,
  };
}

function listPayload(items: unknown[], nextCursor: string | null = null): Response {
  return new Response(JSON.stringify({ items, nextCursor }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  nav.replace.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function requestedUrl(call = 0): string {
  return String(fetchMock.mock.calls[call]?.[0] ?? '');
}

describe('channel is in every request (T025b)', () => {
  it('reads the marketplace endpoint when no store slug is given', async () => {
    fetchMock.mockResolvedValue(listPayload([product(ID_A, 'alpha', 'Alpha')]));
    render(<ProductList />);

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(requestedUrl()).toBe('/api/v1/catalog/marketplace/products?sort=newest&limit=12');
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/products/alpha');
  });

  it('keeps the store channel in the request AND in every product link', async () => {
    fetchMock.mockResolvedValue(listPayload([product(ID_A, 'alpha', 'Alpha')]));
    render(<ProductList storeSlug="t016-alpha" />);

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(requestedUrl()).toBe('/api/v1/catalog/stores/t016-alpha/products?sort=newest&limit=12');
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute(
      'href',
      '/stores/t016-alpha/products/alpha',
    );
  });

  it('forwards the parsed filters and the current cursor upstream', async () => {
    nav.params = new URLSearchParams('sort=price_asc&category=audio&min=10&max=20&after=opaque-cursor');
    fetchMock.mockResolvedValue(listPayload([]));
    render(<ProductList storeSlug="s1" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = new URL(requestedUrl(), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/catalog/stores/s1/products');
    expect(url.searchParams.get('sort')).toBe('price_asc');
    expect(url.searchParams.get('category')).toBe('audio');
    expect(url.searchParams.get('minPrice')).toBe('1000');
    expect(url.searchParams.get('maxPrice')).toBe('2000');
    expect(url.searchParams.get('cursor')).toBe('opaque-cursor');
  });
});

describe('stale responses cannot win (T025b)', () => {
  it('ignores a slow older response that lands after a newer selection', async () => {
    const slow = deferred();
    const fast = deferred();
    fetchMock.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const { rerender } = render(<ProductList />);
    // The reader changes the sort before the first response arrives.
    nav.params = new URLSearchParams('sort=price_asc');
    rerender(<ProductList />);

    fast.resolve(listPayload([product(ID_B, 'beta', 'Beta')]));
    await waitFor(() => expect(screen.getByText('Beta')).toBeInTheDocument());

    // The older request finally answers with the old selection's rows.
    slow.resolve(listPayload([product(ID_A, 'alpha', 'Alpha')]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('aborts the previous request when the selection changes', async () => {
    fetchMock.mockResolvedValue(listPayload([]));
    const { rerender } = render(<ProductList />);
    nav.params = new URLSearchParams('min=5');
    rerender(<ProductList />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
  });
});

describe('loading, error, empty and ready states (T025b)', () => {
  it('shows skeleton cards while loading and never a spinner inside a card', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ProductList />);
    expect(screen.getByTestId('plp-skeletons')).toBeInTheDocument();
    expect(container.querySelectorAll('.ss-skeleton').length).toBeGreaterThan(0);
    expect(container.querySelector('.ss-skeleton .ss-spin')).toBeNull();
    expect(screen.getByText('Loading products')).toBeInTheDocument();
  });

  it('announces a failure and recovers when the reader retries', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(listPayload([product(ID_A, 'alpha', 'Alpha')]));

    render(<ProductList />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Products unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats a malformed body as unavailable instead of rendering junk', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ slug: 'x' }], nextCursor: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(<ProductList />);
    await waitFor(() => expect(screen.getByText('Products unavailable')).toBeInTheDocument());
  });

  it('renders an honest empty state that can clear the filters', async () => {
    nav.params = new URLSearchParams('category=audio');
    fetchMock.mockResolvedValue(listPayload([]));
    render(<ProductList storeSlug="s1" />);

    await waitFor(() =>
      expect(screen.getByText('No products match these filters')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/stores/s1/products',
    );
    expect(screen.queryByTestId('plp-skeletons')).toBeNull();
  });
});

describe('cursor pagination links (T025b)', () => {
  it('appends the response cursor to the stack and keeps the filters', async () => {
    nav.params = new URLSearchParams('sort=price_asc');
    fetchMock.mockResolvedValue(listPayload([product(ID_A, 'alpha', 'Alpha')], 'next-cursor-1'));
    render(<ProductList />);

    await waitFor(() => expect(screen.getByText('Page 1')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull();

    const next = screen.getByRole('link', { name: 'Next page' });
    const [path, query] = (next.getAttribute('href') ?? '').split('?');
    expect(path).toBe('/products');
    const parsed = new URLSearchParams(query);
    expect(parsed.get('sort')).toBe('price_asc');
    expect(parsed.get('after')).toBe('next-cursor-1');
  });

  it('reads a deeper page from the URL and offers the way back', async () => {
    nav.params = new URLSearchParams('sort=price_asc&after=next-cursor-1');
    fetchMock.mockResolvedValue(listPayload([product(ID_B, 'beta', 'Beta')], null));
    render(<ProductList />);

    await waitFor(() => expect(screen.getByText('Page 2')).toBeInTheDocument());
    const previous = screen.getByRole('link', { name: 'Previous page' });
    const parsed = new URLSearchParams((previous.getAttribute('href') ?? '').split('?')[1]);
    expect(parsed.get('sort')).toBe('price_asc');
    expect(parsed.get('after')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull();
  });
});
