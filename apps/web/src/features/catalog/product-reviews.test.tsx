// @shopscale/web features/catalog/product-reviews.test.tsx - Unit tests for ProductReviews component (RV-1, RV-2 / T064).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductReviews } from './product-reviews';
import { csrfFetch, gatewayRequest } from '@/lib/csrf';

vi.mock('@/lib/csrf', () => ({
  gatewayRequest: vi.fn(),
  csrfFetch: vi.fn(),
}));

describe('ProductReviews (T064)', () => {
  const productId = '11111111-1111-4111-8111-111111111111';

  const mockReviewsData = {
    items: [
      {
        id: 'rev-001',
        productId,
        rating: 5,
        body: 'Incredible keyboard! Keys feel smooth and responsive.',
        authorName: 'Charlie',
        isVerifiedPurchaser: true,
        createdAt: '2026-11-16T12:00:00.000Z',
      },
    ],
    ratingAvg: 5.0,
    ratingCount: 1,
    nextCursor: null,
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders reviews list with author, rating, body, and verified purchaser badge', () => {
    render(<ProductReviews productId={productId} initialReviews={mockReviewsData} />);

    expect(screen.getByTestId('reviews-avg')).toHaveTextContent('5.0');
    expect(screen.getByTestId('reviews-count')).toHaveTextContent('Based on 1 review');
    expect(screen.getByTestId('review-author')).toHaveTextContent('Charlie');
    expect(screen.getByTestId('review-body')).toHaveTextContent(
      'Incredible keyboard! Keys feel smooth and responsive.',
    );
    expect(screen.getByTestId('verified-purchaser-badge')).toBeInTheDocument();
  });

  it('submits review successfully and renders success message', async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'rev-002' }),
    } as Response);

    vi.mocked(gatewayRequest).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...mockReviewsData,
          ratingCount: 2,
        }),
    } as Response);

    render(<ProductReviews productId={productId} initialReviews={mockReviewsData} />);

    const textarea = screen.getByTestId('review-body-input');
    fireEvent.change(textarea, {
      target: { value: 'Loved the fast shipping and nice package!' },
    });

    const submitBtn = screen.getByTestId('btn-submit-review');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('review-success-message')).toHaveTextContent(
        'Thank you! Your verified review has been submitted.',
      );
    });

    expect(csrfFetch).toHaveBeenCalledWith(
      `/api/v1/catalog/products/${productId}/reviews`,
      {
        rating: 5,
        body: 'Loved the fast shipping and nice package!',
      },
    );
  });

  it('displays 403 error message when non-purchaser attempts to review', async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          message:
            'Only customers who have purchased and received this product may leave a review.',
        }),
    } as Response);

    render(<ProductReviews productId={productId} initialReviews={mockReviewsData} />);

    const textarea = screen.getByTestId('review-body-input');
    fireEvent.change(textarea, { target: { value: 'I have not bought this yet.' } });

    fireEvent.click(screen.getByTestId('btn-submit-review'));

    await waitFor(() => {
      expect(screen.getByTestId('review-error-message')).toHaveTextContent(
        'Only customers who have purchased and received this product may leave a review.',
      );
    });
  });

  it('displays 409 error message when duplicate review is attempted', async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          message:
            'You have already submitted a review for this product. Only one review is permitted.',
        }),
    } as Response);

    render(<ProductReviews productId={productId} initialReviews={mockReviewsData} />);

    const textarea = screen.getByTestId('review-body-input');
    fireEvent.change(textarea, { target: { value: 'Second review attempt.' } });

    fireEvent.click(screen.getByTestId('btn-submit-review'));

    await waitFor(() => {
      expect(screen.getByTestId('review-error-message')).toHaveTextContent(
        'You have already submitted a review for this product. Only one review is permitted.',
      );
    });
  });

  it('allows changing star rating before submission', () => {
    render(<ProductReviews productId={productId} initialReviews={mockReviewsData} />);

    const star4 = screen.getByTestId('star-rating-4');
    fireEvent.click(star4);

    expect(star4).toHaveAttribute('aria-pressed', 'true');
  });
});
