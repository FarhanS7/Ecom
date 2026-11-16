'use client';

// @shopscale/web features/catalog/product-reviews - Verified reviews & ratings UI (RV-1, RV-2 / T064).

import { useEffect, useState, useTransition } from 'react';
import type { ListReviewsResponseDto, ReviewDto } from '@shopscale/contracts';
import { Card, PrimaryButton, StarIcon, Tag } from '@/components/ui';
import { csrfFetch, gatewayRequest } from '@/lib/csrf';

export interface ProductReviewsProps {
  productId: string;
  initialReviews?: ListReviewsResponseDto | undefined;
}

export function ProductReviews({ productId, initialReviews }: ProductReviewsProps) {
  const [data, setData] = useState<ListReviewsResponseDto | null>(initialReviews ?? null);
  const [loading, setLoading] = useState(!initialReviews);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchReviews = async () => {
    try {
      const res = await gatewayRequest(`/api/v1/catalog/products/${productId}/reviews`, {
        method: 'GET',
      });
      if (res.ok) {
        const json = (await res.json()) as ListReviewsResponseDto;
        setData(json);
      }
    } catch {
      // Ignore network errors on passive fetch
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialReviews) {
      void fetchReviews();
    }
  }, [productId, initialReviews]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length < 3) {
      setErrorMessage('Review text must be at least 3 characters.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const res = await csrfFetch(`/api/v1/catalog/products/${productId}/reviews`, {
          rating,
          body: trimmed,
        });

        if (res.ok) {
          setBody('');
          setSuccessMessage('Thank you! Your verified review has been submitted.');
          await fetchReviews();
        } else {
          const errData = (await res.json().catch(() => ({}))) as {
            message?: string;
            statusCode?: number;
          };
          if (res.status === 403) {
            setErrorMessage(
              'Only customers who have purchased and received this product may leave a review.',
            );
          } else if (res.status === 409) {
            setErrorMessage(
              'You have already submitted a review for this product. Only one review is permitted.',
            );
          } else if (res.status === 401) {
            setErrorMessage('Please log in to submit a review.');
          } else {
            setErrorMessage(errData.message || 'Failed to submit review.');
          }
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Network error submitting review.');
      }
    });
  };

  const reviews = data?.items ?? [];
  const ratingAvg = data?.ratingAvg ?? 0;
  const ratingCount = data?.ratingCount ?? 0;

  return (
    <Card as="section" className="ss-pdp__reviews" labelledBy="pdp-reviews-heading">
      <div className="ss-reviews__summary">
        <div>
          <h2 id="pdp-reviews-heading" className="type-card-title">
            Customer Reviews
          </h2>
          <p className="type-caption" style={{ color: 'var(--text-secondary)' }}>
            Verified purchaser feedback & ratings
          </p>
        </div>

        {ratingCount > 0 ? (
          <div className="ss-reviews__rating-large">
            <span className="ss-reviews__rating-number" data-testid="reviews-avg">
              {ratingAvg.toFixed(1)}
            </span>
            <div>
              <div className="ss-reviews__rating-stars" aria-label={`Average ${ratingAvg} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    style={{
                      color:
                        star <= Math.round(ratingAvg)
                          ? 'var(--color-star)'
                          : 'var(--text-ghost)',
                    }}
                  >
                    <StarIcon size={16} />
                  </span>
                ))}
              </div>
              <p
                className="type-caption"
                data-testid="reviews-count"
                style={{ color: 'var(--text-secondary)' }}
              >
                Based on {ratingCount} {ratingCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>
        ) : (
          <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
            No reviews yet. Be the first to review!
          </p>
        )}
      </div>

      {/* Review Submission Form */}
      <form
        className="ss-reviews__form"
        onSubmit={(e) => {
          handleSubmit(e);
        }}
        data-testid="review-form"
      >
        <h3 className="type-body" style={{ fontWeight: 600 }}>
          Write a Review
        </h3>

        <div>
          <label className="type-caption" style={{ display: 'block', marginBottom: '4px' }}>
            Rating
          </label>
          <div className="ss-reviews__star-picker" aria-label="Rating selection">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= (hoverRating ?? rating);
              return (
                <button
                  type="button"
                  key={star}
                  aria-pressed={rating === star}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  data-testid={`star-rating-${star}`}
                  className={`ss-reviews__star-btn ${active ? 'ss-reviews__star-btn--active' : ''}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                >
                  <StarIcon size={20} />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="review-body"
            className="type-caption"
            style={{ display: 'block', marginBottom: '4px' }}
          >
            Review Details
          </label>
          <textarea
            id="review-body"
            data-testid="review-body-input"
            className="ss-reviews__textarea"
            placeholder="Tell us about the quality, delivery, and how it matched your expectations..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={isPending}
            rows={3}
            required
          />
        </div>

        {errorMessage ? (
          <p
            role="alert"
            data-testid="review-error-message"
            className="type-body-sm"
            style={{ color: 'var(--color-danger)' }}
          >
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p
            role="status"
            data-testid="review-success-message"
            className="type-body-sm"
            style={{ color: 'var(--color-brand)' }}
          >
            {successMessage}
          </p>
        ) : null}

        <div>
          <PrimaryButton
            type="submit"
            disabled={isPending}
            loading={isPending}
            data-testid="btn-submit-review"
          >
            Submit Review
          </PrimaryButton>
        </div>
      </form>

      {/* Reviews List */}
      {loading ? (
        <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading reviews...
        </p>
      ) : reviews.length > 0 ? (
        <ul className="ss-reviews__list" aria-label="Customer reviews">
          {reviews.map((rev: ReviewDto) => (
            <li key={rev.id} className="ss-reviews__item" data-testid="review-item">
              <div className="ss-reviews__author-row">
                <div className="ss-reviews__author-info">
                  <span className="ss-reviews__author-name" data-testid="review-author">
                    {rev.authorName}
                  </span>
                  {rev.isVerifiedPurchaser ? (
                    <span data-testid="verified-purchaser-badge">
                      <Tag tone="positive">Verified Purchaser</Tag>
                    </span>
                  ) : null}
                </div>
                <time className="ss-reviews__date" dateTime={rev.createdAt}>
                  {new Date(rev.createdAt).toLocaleDateString()}
                </time>
              </div>

              <div
                className="ss-reviews__rating-stars"
                aria-label={`Rated ${rev.rating} out of 5 stars`}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    style={{
                      color: star <= rev.rating ? 'var(--color-star)' : 'var(--text-ghost)',
                    }}
                  >
                    <StarIcon size={14} />
                  </span>
                ))}
              </div>

              <p className="type-body" data-testid="review-body" style={{ margin: 0 }}>
                {rev.body}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
