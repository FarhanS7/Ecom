// @shopscale/api/webhook.controller - Webhook endpoints for external providers
import {
  BadRequestException,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { getEnv } from '@shopscale/config';
import {
  ExpiredTimestampError,
  InvalidSignatureError,
  MissingSignatureHeadersError,
  WebhookQuarantineConflictError,
  webhookService,
} from '@shopscale/backend';

interface WebhookRequest {
  rawBody?: Buffer | string;
  body?: unknown;
}

@Controller('webhooks')
export class WebhookController {
  @Post('payments')
  @HttpCode(200)
  async handlePaymentWebhook(
    @Req() req: WebhookRequest,
    @Headers('x-shopscale-signature') signatureHeader?: string,
    @Headers('x-shopscale-timestamp') timestampHeader?: string,
  ) {
    const env = getEnv();
    const secret = env.MOCK_PAYMENTS_SECRET;

    let rawBody = '';
    if (Buffer.isBuffer(req.rawBody)) {
      rawBody = req.rawBody.toString('utf-8');
    } else if (typeof req.rawBody === 'string') {
      rawBody = req.rawBody;
    } else if (req.body !== undefined && req.body !== null) {
      rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    try {
      const result = await webhookService.ingestPaymentWebhook({
        provider: 'mock-payments',
        rawBody,
        signatureHeader,
        timestampHeader,
        secret,
      });

      return {
        received: true,
        eventId: result.eventId,
        status: result.status,
      };
    } catch (err) {
      if (err instanceof MissingSignatureHeadersError || err instanceof ExpiredTimestampError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof InvalidSignatureError) {
        throw new UnauthorizedException(err.message);
      }
      if (err instanceof WebhookQuarantineConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof Error && err.name === 'ZodError') {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
