// @shopscale/api/product.controller - Seller catalog mutations (T020b).
// Scoped-route rules (T014b/T015b/T018 precedents): unknown store AND
// non-membership AND member-without-catalog:manage AND foreign product IDs
// ALL collapse to one generic 404 (no existence oracle — 403 is reserved
// for platform-admin routes); malformed bodies get 404 here (distinguishing
// "bad input" from "no scope" would oracle store existence); stale versions
// and duplicate SKUs are 409s with constant messages.

import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CatalogError,
  archiveProduct,
  authorizeStore,
  createProduct,
  createVariant,
  getStoreProduct,
  listStoreProducts,
  listVariants,
  setPublication,
  updateProduct,
  updateVariant,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import {
  productCreateRequest,
  productResponse,
  publicationToggleRequest,
  sellerProductListResponse,
  variantCreateRequest,
  variantListResponse,
  variantResponse,
  variantUpdateRequest,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

function notFound(): never {
  throw new NotFoundException('Not found.');
}

function toCatalogError(err: unknown): never {
  if (err instanceof CatalogError) {
    if (err.failure === 'NOT_FOUND') throw new NotFoundException('Not found.');
    // VERSION_CONFLICT and CONFLICT (duplicate SKU) share 409 + constant text.
    throw new ConflictException(err.message);
  }
  throw err;
}

@Controller('seller/stores/:storeId/products')
@UseGuards(SessionGuard)
export class ProductController {
  /**
   * Scope + permission gate shared by every route below. Uniform no-oracle
   * rule (T014b/T015b/T018 matrix): unknown store, non-member, inactive
   * membership, AND member-without-catalog:manage ALL collapse to one
   * generic 404 — 403 is reserved for platform-admin routes only.
   */
  private async gate(req: GuardedRequest, storeId: string): Promise<void> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) notFound();
    const allowed = await authorizeStore({ userId: req.actor.userId, storeId, permission: 'catalog:manage' });
    if (!allowed) notFound();
  }

  @Get()
  async list(@Req() req: GuardedRequest, @Param('storeId') storeId: string): Promise<unknown> {
    await this.gate(req, storeId);
    const items = await listStoreProducts(storeId);
    return sellerProductListResponse.parse({ items });
  }

  @Post()
  @HttpCode(201)
  async create(@Req() req: GuardedRequest, @Param('storeId') storeId: string, @Body() rawBody: unknown): Promise<unknown> {
    await this.gate(req, storeId);
    const parsed = productCreateRequest.safeParse(rawBody);
    if (!parsed.success) notFound();
    try {
      const created = await createProduct({ storeId, ...parsed.data });
      return productResponse.parse(created);
    } catch (err) {
      toCatalogError(err);
    }
  }

  @Get(':productId')
  async read(@Req() req: GuardedRequest, @Param('storeId') storeId: string, @Param('productId') productId: string): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(productId)) notFound();
    try {
      return productResponse.parse(await getStoreProduct(storeId, productId));
    } catch (err) {
      toCatalogError(err);
    }
  }

  @Patch(':productId')
  async update(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(productId)) notFound();
    // Same no-oracle rule as stores.controller: bad input ≡ missing scope.
    const body = rawBody as { expectedVersion?: unknown; title?: unknown; description?: unknown; brand?: unknown; categoryId?: unknown; attributes?: unknown; status?: unknown } | null;
    if (!body || typeof body !== 'object' || typeof body.expectedVersion !== 'number') notFound();
    // Lifecycle transition (T027a): a value outside the contract's enum is
    // malformed input, so it shares the generic 404 with every other bad field
    // instead of oracling the product's existence with a 409/422.
    if (body.status !== undefined && body.status !== 'draft' && body.status !== 'active') notFound();
    const { expectedVersion, ...rest } = body;
    try {
      const updated = await updateProduct({
        storeId,
        productId,
        expectedVersion,
        patch: rest as never,
      });
      return productResponse.parse(updated);
    } catch (err) {
      toCatalogError(err);
    }
  }

  @Post(':productId/archive')
  @HttpCode(200)
  async archive(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(productId)) notFound();
    const body = rawBody as { expectedVersion?: unknown } | null;
    if (!body || typeof body.expectedVersion !== 'number') notFound();
    try {
      return productResponse.parse(await archiveProduct({ storeId, productId, expectedVersion: body.expectedVersion }));
    } catch (err) {
      toCatalogError(err);
    }
  }

  @Patch(':productId/publication')
  async publication(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(productId)) notFound();
    const parsed = publicationToggleRequest.safeParse(rawBody);
    if (!parsed.success) notFound();
    try {
      return productResponse.parse(await setPublication({ storeId, productId, ...parsed.data }));
    } catch (err) {
      toCatalogError(err);
    }
  }

  @Get(':productId/variants')
  async variants(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(productId)) notFound();
    try {
      await getStoreProduct(storeId, productId); // scoped presence → 404
    } catch (err) {
      toCatalogError(err);
    }
    const items = await listVariants(storeId, productId);
    return variantListResponse.parse({ items });
  }

  @Post(':productId/variants')
  @HttpCode(201)
  async createVariant(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(productId)) notFound();
    const parsed = variantCreateRequest.safeParse(rawBody);
    if (!parsed.success) notFound();
    try {
      const created = await createVariant({ storeId, productId, ...parsed.data });
      return variantResponse.parse(created);
    } catch (err) {
      toCatalogError(err);
    }
  }

  @Patch(':productId/variants/:variantId')
  async updateVariant(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(productId) || !UUID_PATTERN.test(variantId)) notFound();
    const parsed = variantUpdateRequest.safeParse(rawBody);
    if (!parsed.success) notFound();
    const { expectedVersion, ...patch } = parsed.data;
    try {
      const updated = await updateVariant({ storeId, productId, variantId, expectedVersion, patch });
      return variantResponse.parse(updated);
    } catch (err) {
      toCatalogError(err);
    }
  }
}
