// @shopscale/api/addresses.controller - Customer address book (T091a).
// Session-guarded; every statement owner-scoped by (id, user_id) in the
// service layer. Foreign IDs share one generic 404 with unknown IDs.

import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  createAddress,
  deleteAddress,
  getAddress,
  listAddresses,
  updateAddress,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import { addressFields, addressListResponse, addressResponse, flowAccepted } from '@shopscale/contracts';
import { parseBody } from './auth.controller.js';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

@Controller('me/addresses')
@UseGuards(SessionGuard)
export class AddressesController {
  private actorId(req: GuardedRequest): string {
    if (!req.actor) throw new NotFoundException('Address not found.');
    return req.actor.userId;
  }

  @Get()
  async list(@Req() req: GuardedRequest): Promise<unknown> {
    const items = await listAddresses(this.actorId(req));
    return addressListResponse.parse({ items });
  }

  @Post()
  @HttpCode(201)
  async create(@Req() req: GuardedRequest, @Body() rawBody: unknown): Promise<unknown> {
    // Self-scoped routes use 422 for malformed bodies (no cross-user oracle
    // exists here); foreign IDs share the generic 404 below.
    const created = await createAddress(this.actorId(req), parseBody(addressFields, rawBody));
    return addressResponse.parse(created);
  }

  @Get(':id')
  async read(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Address not found.');
    const found = await getAddress(this.actorId(req), id);
    if (!found) throw new NotFoundException('Address not found.');
    return addressResponse.parse(found);
  }

  @Patch(':id')
  async update(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Address not found.');
    const updated = await updateAddress(this.actorId(req), id, parseBody(addressFields, rawBody));
    if (!updated) throw new NotFoundException('Address not found.');
    return addressResponse.parse(updated);
  }

  @Delete(':id')
  async remove(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Address not found.');
    const deleted = await deleteAddress(this.actorId(req), id);
    if (!deleted) throw new NotFoundException('Address not found.');
    return flowAccepted.parse({ ok: true });
  }
}
