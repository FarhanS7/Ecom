// @shopscale/api/channel.controller - Public storefront channel read (T016b).
// No guard: storefront discovery is public. Unknown, malformed, pending, and
// suspended slugs share one generic 404 (suspended storefronts are
// unavailable, never explained). The theme is always validated-or-default.

import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { resolveStorefront } from '@shopscale/backend';
import { storeChannelResponse } from '@shopscale/contracts';

const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;

@Controller('stores')
export class ChannelController {
  @Get(':slug')
  async channel(@Param('slug') slug: string): Promise<unknown> {
    if (!SLUG_PATTERN.test(slug)) {
      throw new NotFoundException('Storefront not found.');
    }
    const storefront = await resolveStorefront(slug);
    if (!storefront) {
      throw new NotFoundException('Storefront not found.');
    }
    return storeChannelResponse.parse({
      channel: 'store',
      slug: storefront.slug,
      name: storefront.name,
      theme: storefront.theme,
    });
  }
}
