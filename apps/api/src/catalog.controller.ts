// @shopscale/api/catalog.controller - Public channel-aware catalog reads
// (T021b). No guard: storefront browsing is public. Everything invisible —
// unknown/malformed store slug, unpublished product, draft/archived row,
// suspended store — shares one generic 404 (no existence oracle, matching
// the T016 channel controller rule). The service rechecks the full
// visibility chain in SQL on every read.

import { Controller, Get, NotFoundException, Param, Query, UnprocessableEntityException } from '@nestjs/common';
import { CursorError, getChannelProduct, listChannelProducts, resolveActiveStoreSlug } from '@shopscale/backend';
import { channelListQuery, channelListResponse, channelProductDetail } from '@shopscale/contracts';

const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;
const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function notFound(): never {
  throw new NotFoundException('Not found.');
}

/** Malformed public input → 422 (addresses precedent). Storefront
 * existence is public information, so there is nothing to oracle here. */
function unprocessable(): never {
  throw new UnprocessableEntityException('Invalid query.');
}

@Controller('catalog')
export class CatalogController {
  @Get('marketplace/products')
  async marketplaceList(@Query() rawQuery: Record<string, unknown>): Promise<unknown> {
    const parsed = channelListQuery.safeParse(rawQuery);
    if (!parsed.success) unprocessable();
    const { category, minPrice, maxPrice, sort, limit, cursor } = parsed.data;
    return this.list({
      channel: 'marketplace',
      categorySlug: category,
      minPriceCents: minPrice,
      maxPriceCents: maxPrice,
      sort,
      limit,
      cursor,
    });
  }

  @Get('marketplace/products/:productSlug')
  async marketplaceDetail(@Param('productSlug') productSlug: string): Promise<unknown> {
    if (!PRODUCT_SLUG_PATTERN.test(productSlug)) notFound();
    const detail = await getChannelProduct({ channel: 'marketplace', productSlug });
    if (!detail) notFound();
    return channelProductDetail.parse(detail);
  }

  @Get('stores/:slug/products')
  async storeList(
    @Param('slug') slug: string,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<unknown> {
    if (!SLUG_PATTERN.test(slug)) notFound();
    const parsed = channelListQuery.safeParse(rawQuery);
    if (!parsed.success) unprocessable();
    // Store resolution re-checks status in SQL; false → same 404 as an
    // unknown slug (channel.service.ts parity).
    if (!(await resolveActiveStoreSlug(slug))) notFound();
    const { category, minPrice, maxPrice, sort, limit, cursor } = parsed.data;
    return this.list({
      channel: 'store',
      storeSlug: slug,
      categorySlug: category,
      minPriceCents: minPrice,
      maxPriceCents: maxPrice,
      sort,
      limit,
      cursor,
    });
  }

  @Get('stores/:slug/products/:productSlug')
  async storeDetail(@Param('slug') slug: string, @Param('productSlug') productSlug: string): Promise<unknown> {
    if (!SLUG_PATTERN.test(slug) || !PRODUCT_SLUG_PATTERN.test(productSlug)) notFound();
    const detail = await getChannelProduct({ channel: 'store', storeSlug: slug, productSlug });
    if (!detail) notFound();
    return channelProductDetail.parse(detail);
  }

  /** Shared list path: a cursor from a different sort/channel/filter set is
   * a 422 (public input error), never a silent second page. */
  private async list(query: Parameters<typeof listChannelProducts>[0]): Promise<unknown> {
    try {
      const result = await listChannelProducts(query);
      return channelListResponse.parse(result);
    } catch (err) {
      if (err instanceof CursorError) unprocessable();
      throw err;
    }
  }
}
