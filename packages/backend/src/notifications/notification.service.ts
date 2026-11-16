// @shopscale/backend/notifications/notification.service - Notification delivery ledger & demo sink (T061).
// Invariants:
// 1. Every notification delivery requires a unique effect_key for idempotent delivery.
// 2. Demo sink records notifications without external side effects (simulated provider).
// 3. Retries do not send duplicate demo messages.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';

export interface RecordDeliveryInput {
  effectKey: string;
  userId?: string | null;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  template: string;
  recipient: string;
  status?: 'PENDING' | 'DELIVERED' | 'FAILED';
  providerRef?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface NotificationDeliveryRow {
  id: string;
  effect_key: string;
  user_id: string | null;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  template: string;
  recipient: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  provider_ref: string | null;
  payload: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class NotificationService {
  constructor(private readonly db?: Sql) {}

  private get sql(): Sql {
    return this.db ?? getDb();
  }

  async recordDelivery(
    input: RecordDeliveryInput,
    sqlTx?: Sql,
  ): Promise<{ delivery: NotificationDeliveryRow; alreadyDelivered: boolean }> {
    const client = sqlTx ?? this.sql;

    // Check if effectKey already exists
    const existing = (await client`
      SELECT id, effect_key, user_id, channel, template, recipient, status, attempts, provider_ref, payload, created_at, updated_at
      FROM notification_deliveries
      WHERE effect_key = ${input.effectKey}
      LIMIT 1
    `) as unknown as NotificationDeliveryRow[];

    const existingRow = existing[0];
    if (existingRow) {
      return { delivery: existingRow, alreadyDelivered: true };
    }

    const providerRef = input.providerRef ?? `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const status = input.status ?? 'DELIVERED';

    const inserted = (await client`
      INSERT INTO notification_deliveries (
        effect_key,
        user_id,
        channel,
        template,
        recipient,
        status,
        attempts,
        provider_ref,
        payload
      ) VALUES (
        ${input.effectKey},
        ${input.userId ?? null},
        ${input.channel},
        ${input.template},
        ${input.recipient},
        ${status},
        1,
        ${providerRef},
        ${input.payload ? JSON.stringify(input.payload) : null}::jsonb
      )
      ON CONFLICT (effect_key) DO UPDATE
      SET attempts = notification_deliveries.attempts + 1,
          updated_at = now()
      RETURNING id, effect_key, user_id, channel, template, recipient, status, attempts, provider_ref, payload, created_at, updated_at
    `) as unknown as NotificationDeliveryRow[];

    const insertedRow = inserted[0];
    if (!insertedRow) {
      throw new Error(`Failed to insert notification delivery for effect key ${input.effectKey}`);
    }

    return { delivery: insertedRow, alreadyDelivered: false };
  }

  async getDeliveriesForUser(userId: string): Promise<NotificationDeliveryRow[]> {
    return (await this.sql`
      SELECT id, effect_key, user_id, channel, template, recipient, status, attempts, provider_ref, payload, created_at, updated_at
      FROM notification_deliveries
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `) as unknown as NotificationDeliveryRow[];
  }
}

export const notificationService = new NotificationService();
