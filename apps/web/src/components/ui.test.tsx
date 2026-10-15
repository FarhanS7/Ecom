// T023b: component state tests in jsdom. These assert OBSERVABLE behavior
// (accessible names, disabled/busy state, token variables) rather than the
// implementation, so a refactor that keeps the contract keeps the tests green.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  ArrowButton,
  Blocks,
  Card,
  HeartIcon,
  IconCircleButton,
  PrimaryButton,
  RatingBadge,
  SearchPill,
  SecondaryButton,
  TenantScope,
  TextField,
} from './ui.js';
import { Header } from './header.js';

afterEach(cleanup);

const THEME = {
  primary: '#111111',
  background: '#222222',
  surface: '#333333',
  text: '#444444',
  muted: '#555555',
  accent: '#666666',
  radius: 8,
};

describe('primary actions (T023b)', () => {
  it('renders one labelled button and reflects disabled/busy state', () => {
    const { rerender } = render(<PrimaryButton>View all products</PrimaryButton>);
    const button = screen.getByRole('button', { name: 'View all products' });
    expect(button).toBeEnabled();

    rerender(<PrimaryButton loading>View all products</PrimaryButton>);
    const busy = screen.getByRole('button', { name: 'View all products' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a link when given an href and blocks it while busy', () => {
    const { rerender } = render(<PrimaryButton href="/products">Browse</PrimaryButton>);
    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/products');

    const onClick = vi.fn();
    rerender(
      <PrimaryButton href="/products" disabled onClick={onClick}>
        Browse
      </PrimaryButton>,
    );
    const blocked = screen.getByRole('link', { name: 'Browse' });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(blocked);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('secondary buttons share the button anatomy with a token surface', () => {
    render(<SecondaryButton>Buy now</SecondaryButton>);
    expect(screen.getByRole('button', { name: 'Buy now' }).className).toContain('ss-btn--secondary');
  });
});

describe('icon-only controls are named (T023b)', () => {
  it('exposes the required accessible name', () => {
    render(
      <IconCircleButton label="Wishlist">
        <HeartIcon filled />
      </IconCircleButton>,
    );
    expect(screen.getByRole('button', { name: 'Wishlist' })).toBeInTheDocument();
  });

  it('arrow buttons carry the same name and the arrow glyph', () => {
    render(<ArrowButton label="Open product" href="/products/1" position="tr" />);
    const link = screen.getByRole('link', { name: 'Open product' });
    expect(link).toHaveAttribute('href', '/products/1');
    expect(link.className).toContain('ss-arrow--tr');
  });
});

describe('cards and ratings (T023b)', () => {
  it('a linked card is an anchor and names itself from its heading', () => {
    render(
      <Card href="/products/1" labelledBy="card-title">
        <h3 id="card-title">Light Grey Headphone</h3>
      </Card>,
    );
    const link = screen.getByRole('link', { name: 'Light Grey Headphone' });
    expect(link.className).toContain('ss-card--link');
  });

  it('the rating badge announces the numeric value', () => {
    render(<RatingBadge value={4.7} />);
    expect(screen.getByLabelText('Rated 4.7 out of 5')).toBeInTheDocument();
  });
});

describe('search and forms (T023b)', () => {
  it('search is a labelled input inside a search landmark that submits', () => {
    const onSubmit = vi.fn();
    render(<SearchPill onSubmit={onSubmit} />);
    const input = screen.getByRole('searchbox', { name: 'Search products' });
    expect(input).toHaveAttribute('name', 'q');
    fireEvent.submit(screen.getByRole('search'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state on the search button', () => {
    render(<SearchPill submitting />);
    const submit = screen.getByRole('button', { name: 'Searching' });
    expect(submit).toHaveAttribute('aria-busy', 'true');
  });

  it('form errors announce and mark the field invalid', () => {
    render(
      <TextField label="Full name" name="full-name" value="Kept" onChange={() => {}} error="Required" />,
    );
    const input = screen.getByLabelText('Full name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(input).toHaveValue('Kept');
  });
});

describe('header variants (T023b)', () => {
  it('signed out shows the Sign in pill and the cart count', () => {
    render(<Header tenantName="ShopScale" cartCount={3} />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Cart, 3 items' })).toHaveAttribute('href', '/cart');
    expect(screen.getByRole('link', { name: 'Wishlist' })).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('signed in shows the account pill and can hide search', () => {
    render(<Header tenantName="ShopScale" account={{ name: 'Ada' }} search={false} />);
    expect(screen.getByRole('link', { name: /Ada/ })).toHaveAttribute('href', '/account');
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('uses the tenant wordmark, never placeholder branding', () => {
    render(<Header tenantName="ShopScale" search={false} />);
    expect(screen.queryByText(/nitec/i)).toBeNull();
    expect(screen.getAllByText(/shopscale\./).length).toBeGreaterThan(0);
  });
});

describe('theme scope and empty reflow (T023b)', () => {
  it('maps a valid theme onto the allowlisted variables', () => {
    render(
      <TenantScope theme={THEME} testId="store-theme" dataStore="alpha">
        <span>content</span>
      </TenantScope>,
    );
    const scope = screen.getByTestId('store-theme');
    expect(scope).toHaveAttribute('data-tenant');
    expect(scope.getAttribute('style')).toContain('--store-primary: #111111');
  });

  it('rejects an injected theme value and falls back to the defaults', () => {
    render(
      <TenantScope theme={{ ...THEME, accent: 'var(--x)' }} testId="store-theme">
        <span>content</span>
      </TenantScope>,
    );
    const style = screen.getByTestId('store-theme').getAttribute('style') ?? '';
    expect(style).not.toContain('var(--x)');
  });

  it('drops empty blocks so neighbours reflow', () => {
    const { container } = render(
      <Blocks>
        {null}
        {false}
        {undefined}
      </Blocks>,
    );
    expect(container).toBeEmptyDOMElement();

    render(
      <Blocks>
        {null}
        <p>Kept</p>
        {false}
      </Blocks>,
    );
    expect(screen.getByText('Kept')).toBeInTheDocument();
  });
});
