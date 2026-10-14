// @shopscale/api/ping.controller - Minimal versioned probe (T006b).
// Exists to prove three conventions over real HTTP: the /v1 prefix, the
// ValidationPipe → problem mapping for invalid input, and request-ID
// propagation. It is intentionally tiny; business endpoints arrive in their
// owning tasks and reuse these conventions without changes.
//
// Metadata note: the query DTO is validated by an EXPLICIT param pipe, not by
// inferred design:paramtypes — the esbuild/vitest runner strips decorator
// metadata, so inferred DTO types are invisible to the global ValidationPipe
// under tests. Explicit pipes behave identically in tsc builds and tests.

import { Controller, Get, Query, UnprocessableEntityException } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min, validate } from 'class-validator';
import { Type, plainToInstance } from 'class-transformer';

export class PingQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PingQueryPipe implements PipeTransform {
  async transform(value: unknown, _metadata: ArgumentMetadata): Promise<PingQuery> {
    const dto = plainToInstance(PingQuery, value ?? {}, { enableImplicitConversion: true });
    const errors = await validate(dto);
    if (errors.length > 0) {
      // Constraint KEYS only (see backend validationErrorMap): values may be
      // secrets and must never cross into responses.
      throw new UnprocessableEntityException(
        errors.map((e) => ({ property: e.property, constraints: e.constraints ?? {} })),
      );
    }
    return dto;
  }
}

@Controller('ping')
export class PingController {
  @Get()
  ping(@Query(new PingQueryPipe()) query: PingQuery): { pong: true; limit: number } {
    return { pong: true, limit: query.limit ?? 20 };
  }
}
