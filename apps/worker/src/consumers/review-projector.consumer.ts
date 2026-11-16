// @shopscale/worker/consumers/review-projector.consumer - Asynchronous rating rollup projector (T064 / RV-1, RV-2).
// Invariants:
// 1. Consumes review.created / ReviewChanged outbox events from BullMQ.
// 2. Recomputes rating_sum and rating_count on products table.
// 3. Updates denormalized search_documents rating_avg and rating_count.
// 4. Invalidates PDP cache keys.
// 5. Safe on replay / idempotent.

import {
  reviewService,
  type OutboxRecord,
  type ReviewService,
} from '@shopscale/backend';

export interface ReviewProjectorOptions {
  reviewService?: ReviewService;
  cache?: {
    invalidatePattern(pattern: string): Promise<void>;
  };
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export interface ReviewProjectorResult {
  productId: string;
  ratingSum: number;
  ratingCount: number;
  ratingAvg: number;
}

export class ReviewProjectorConsumer {
  private readonly reviewService: ReviewService;
  private readonly cache?: { invalidatePattern(pattern: string): Promise<void> } | undefined;
  private readonly logger: NonNullable<ReviewProjectorOptions['logger']>;

  constructor(options?: ReviewProjectorOptions) {
    this.reviewService = options?.reviewService ?? reviewService;
    this.cache = options?.cache;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  async processEvent(event: OutboxRecord): Promise<ReviewProjectorResult | null> {
    const rawPayload = event.payload;
    const payload =
      typeof rawPayload === 'string'
        ? (JSON.parse(rawPayload) as Record<string, unknown>)
        : (rawPayload as Record<string, unknown>);

    const productId = (payload?.['productId'] || payload?.['product_id']) as string | undefined;

    if (!productId) {
      this.logger.warn(
        `[ReviewProjector] Event ${event.id} missing productId in payload. Skipping.`,
      );
      return null;
    }

    this.logger.info(
      `[ReviewProjector] Updating rating projection for product ${productId} from event ${event.id}`,
    );

    const result = await this.reviewService.updateRatingRollup(productId);

    if (this.cache) {
      try {
        await this.cache.invalidatePattern(`cache:pdp:${productId}*`);
        await this.cache.invalidatePattern('cache:search:*');
      } catch (cacheErr) {
        this.logger.warn(
          `[ReviewProjector] Failed to invalidate cache for product ${productId}:`,
          cacheErr,
        );
      }
    }

    this.logger.info(
      `[ReviewProjector] Product ${productId} ratings updated: avg=${result.ratingAvg}, count=${result.ratingCount}`,
    );

    return {
      productId,
      ratingSum: result.ratingSum,
      ratingCount: result.ratingCount,
      ratingAvg: result.ratingAvg,
    };
  }
}
