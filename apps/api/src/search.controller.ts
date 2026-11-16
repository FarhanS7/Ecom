// @shopscale/api/search.controller - Public search endpoint (T031).
// Invariants:
// 1. Mounts at /v1/search (via v1 global prefix).
// 2. Channel isolation: marketplace searches only marketplace_enabled; store searches scope to storeId.
// 3. Typo-tolerant matching with facet aggregations.

import { Controller, Get, NotFoundException, Query, UnprocessableEntityException } from '@nestjs/common';
import { searchQueryService, autocompleteService, resolveStorefront } from '@shopscale/backend';
import { z } from '@shopscale/contracts';

const searchParamsSchema = z.object({
  q: z.string().default(''),
  channel: z.enum(['marketplace', 'store']).default('marketplace'),
  storeSlug: z.string().optional(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(['relevance', 'newest', 'price_asc', 'price_desc', 'popularity']).default('relevance'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

@Controller('search')
export class SearchController {
  @Get()
  async search(@Query() rawQuery: Record<string, unknown>): Promise<unknown> {
    const parsed = searchParamsSchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Invalid search parameters.');
    }

    const { q, channel, storeSlug, category, categoryId, brand, minPrice, maxPrice, sort, limit, cursor } =
      parsed.data;

    let storeId: string | undefined;
    if (channel === 'store') {
      if (!storeSlug) {
        throw new UnprocessableEntityException('storeSlug is required for store-channel search.');
      }
      const storefront = await resolveStorefront(storeSlug);
      if (!storefront) {
        throw new NotFoundException('Storefront not found.');
      }
      storeId = storefront.storeId;
    }

    const results = await searchQueryService.search(
      q,
      {
        channel,
        storeId,
        brand,
        categoryId,
        categoryPath: category,
        minPriceCents: minPrice,
        maxPriceCents: maxPrice,
      },
      {
        limit,
        cursor,
        sort,
      },
    );

    return results;
  }

  @Get('suggest')
  async suggest(@Query() rawQuery: Record<string, unknown>): Promise<unknown> {
    const suggestParamsSchema = z.object({
      q: z.string().default(''),
      channel: z.enum(['marketplace', 'store']).default('marketplace'),
      storeSlug: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(10).default(6),
    });

    const parsed = suggestParamsSchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Invalid suggestion parameters.');
    }

    const { q, channel, storeSlug, limit } = parsed.data;

    let storeId: string | undefined;
    if (channel === 'store' && storeSlug) {
      const storefront = await resolveStorefront(storeSlug);
      if (!storefront) {
        throw new NotFoundException('Storefront not found.');
      }
      storeId = storefront.storeId;
    }

    const suggestions = await autocompleteService.suggest(q, {
      channel,
      storeId,
      limit,
    });

    return { suggestions };
  }
}
