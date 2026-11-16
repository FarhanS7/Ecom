// @shopscale/api/cart.controller - Durable channel cart management (T041).
// Endpoints under /v1/carts/:channelKey
// Invariants:
// 1. Channel-scoped baskets: marketplace vs store channel.
// 2. Both authenticated users and anonymous guests are supported.
// 3. User carts are strictly isolated (no cross-user leakage).
// 4. Store channel carts reject variants from foreign stores (400 STORE_MISMATCH).
// 5. Quantity bounded at 1..99.

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cartService,
  CartAlreadyMergedError,
  CartNotFoundError,
  CartValidationError,
  extractCookie,
  guestTokenService,
  resolveActor,
  StoreMismatchError,
  TamperedTokenError,
  VariantNotFoundError,
} from '@shopscale/backend';
import type { Actor, CartOwner } from '@shopscale/backend';
import {
  addCartItemSchema,
  authCookies,
  mergeCartRequestSchema,
  updateCartItemSchema,
} from '@shopscale/contracts';
import type { CartDto, MergeCartResponse } from '@shopscale/contracts';

interface CartRequest {
  headers?: Record<string, string | string[] | undefined>;
  actor?: Actor;
}

interface CartReply {
  header: (name: string, value: string | string[]) => unknown;
}

const GUEST_COOKIE_NAME = 'cart_guest_token';
const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function getFirstHeader(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

export async function resolveCartOwner(
  req: CartRequest,
  res?: CartReply,
): Promise<CartOwner> {
  // 1. Check if actor already attached (e.g. from upstream guard)
  if (req.actor?.userId) {
    return { kind: 'user', id: req.actor.userId };
  }

  // 2. Check access_token cookie or Authorization header
  const rawCookie = getFirstHeader(req.headers?.['cookie']);
  const accessToken =
    extractCookie(rawCookie, authCookies.accessName) ??
    (getFirstHeader(req.headers?.['authorization'])?.startsWith('Bearer ')
      ? getFirstHeader(req.headers?.['authorization'])!.slice(7).trim()
      : null);

  if (accessToken) {
    const actor = await resolveActor(accessToken);
    if (actor?.userId) {
      req.actor = actor;
      return { kind: 'user', id: actor.userId };
    }
  }

  // 3. Check guest header or guest cookie
  const guestHeader =
    getFirstHeader(req.headers?.['x-guest-id']) ??
    getFirstHeader(req.headers?.['x-guest-token']);
  const guestCookie = extractCookie(rawCookie, GUEST_COOKIE_NAME);

  const existingGuestToken = guestHeader || guestCookie;
  if (existingGuestToken) {
    if (existingGuestToken.includes('.')) {
      const verification = guestTokenService.verifyToken(existingGuestToken);
      if (verification.valid && verification.guestId) {
        return { kind: 'guest', id: verification.guestId };
      }
      throw new UnauthorizedException('Tampered or invalid guest token signature');
    }
    return { kind: 'guest', id: existingGuestToken };
  }

  // 4. Generate new guest ID and set signed cookie
  const newGuestId = randomUUID();
  const signedToken = guestTokenService.mintToken(newGuestId);
  if (res) {
    res.header(
      'Set-Cookie',
      `${GUEST_COOKIE_NAME}=${signedToken}; Path=/; Max-Age=${GUEST_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`,
    );
  }

  return { kind: 'guest', id: newGuestId };
}

function handleCartError(err: unknown): never {
  if (err instanceof StoreMismatchError) {
    throw new BadRequestException({ error: 'STORE_MISMATCH', message: err.message });
  }
  if (err instanceof CartValidationError) {
    if (err.code === 'STORE_NOT_FOUND') {
      throw new NotFoundException(err.message);
    }
    throw new BadRequestException({ error: err.code, message: err.message });
  }
  if (err instanceof VariantNotFoundError || err instanceof CartNotFoundError) {
    throw new NotFoundException(err.message);
  }
  throw err;
}

@Controller('carts')
export class CartController {
  @Get(':channelKey')
  async getCart(
    @Param('channelKey') channelKey: string,
    @Req() req: CartRequest,
    @Res({ passthrough: true }) res: CartReply,
  ): Promise<CartDto> {
    const owner = await resolveCartOwner(req, res);
    try {
      return await cartService.getCart(owner, channelKey);
    } catch (err) {
      handleCartError(err);
    }
  }

  @Post(':channelKey/items')
  @HttpCode(200)
  async addItem(
    @Param('channelKey') channelKey: string,
    @Body() rawBody: unknown,
    @Req() req: CartRequest,
    @Res({ passthrough: true }) res: CartReply,
  ): Promise<CartDto> {
    const parsed = addCartItemSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: 'Invalid item data',
        details: parsed.error.issues,
      });
    }

    const owner = await resolveCartOwner(req, res);
    try {
      return await cartService.addItem(owner, channelKey, parsed.data);
    } catch (err) {
      handleCartError(err);
    }
  }

  @Patch(':channelKey/items/:variantId')
  async updateItem(
    @Param('channelKey') channelKey: string,
    @Param('variantId') variantId: string,
    @Body() rawBody: unknown,
    @Req() req: CartRequest,
    @Res({ passthrough: true }) res: CartReply,
  ): Promise<CartDto> {
    const parsed = updateCartItemSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: 'Invalid quantity',
        details: parsed.error.issues,
      });
    }

    const owner = await resolveCartOwner(req, res);
    try {
      return await cartService.updateItem(owner, channelKey, variantId, parsed.data.quantity);
    } catch (err) {
      handleCartError(err);
    }
  }

  @Delete(':channelKey/items/:variantId')
  async removeItem(
    @Param('channelKey') channelKey: string,
    @Param('variantId') variantId: string,
    @Req() req: CartRequest,
    @Res({ passthrough: true }) res: CartReply,
  ): Promise<CartDto> {
    const owner = await resolveCartOwner(req, res);
    try {
      return await cartService.removeItem(owner, channelKey, variantId);
    } catch (err) {
      handleCartError(err);
    }
  }

  @Delete(':channelKey')
  async clearCart(
    @Param('channelKey') channelKey: string,
    @Req() req: CartRequest,
    @Res({ passthrough: true }) res: CartReply,
  ): Promise<CartDto> {
    const owner = await resolveCartOwner(req, res);
    try {
      return await cartService.clearCart(owner, channelKey);
    } catch (err) {
      handleCartError(err);
    }
  }

  @Post(':channelKey/merge')
  @HttpCode(200)
  async mergeCart(
    @Param('channelKey') channelKey: string,
    @Body() rawBody: unknown,
    @Req() req: CartRequest,
    @Res({ passthrough: true }) res: CartReply,
  ): Promise<MergeCartResponse> {
    const rawCookie = getFirstHeader(req.headers?.['cookie']);
    let accessToken = extractCookie(rawCookie, authCookies.accessName);
    if (!accessToken && getFirstHeader(req.headers?.['authorization'])?.startsWith('Bearer ')) {
      accessToken = getFirstHeader(req.headers?.['authorization'])!.slice(7).trim();
    }

    let actor = req.actor;
    if (!actor && accessToken) {
      actor = (await resolveActor(accessToken)) ?? undefined;
    }

    if (!actor?.userId) {
      throw new UnauthorizedException('Authentication required.');
    }

    const parsed = mergeCartRequestSchema.safeParse(rawBody);
    const bodyToken = parsed.success ? parsed.data.guestToken : undefined;
    const cookieToken = extractCookie(rawCookie, GUEST_COOKIE_NAME);
    const guestToken = bodyToken || cookieToken;

    if (!guestToken) {
      const currentCart = await cartService.getCart({ kind: 'user', id: actor.userId }, channelKey);
      return { mergedCart: currentCart };
    }

    try {
      const result = await cartService.mergeGuestCart(
        { kind: 'user', id: actor.userId },
        guestToken,
        channelKey,
      );

      // Clear guest cookie upon successful merge
      res.header(
        'Set-Cookie',
        `${GUEST_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly`,
      );

      return result;
    } catch (err) {
      if (err instanceof TamperedTokenError) {
        throw new UnauthorizedException('Tampered or invalid guest token signature');
      }
      if (err instanceof CartAlreadyMergedError) {
        throw new ConflictException({ error: 'CART_ALREADY_MERGED', message: err.message });
      }
      handleCartError(err);
    }
  }
}
