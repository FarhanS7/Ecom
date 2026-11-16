// @shopscale/backend/notifications/schema - Drizzle schema for invoices and notification deliveries (T061).
import { pgTable, text, timestamp, uuid, bigint, integer, jsonb } from 'drizzle-orm/pg-core';

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  userId: uuid('user_id').notNull(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  storageKey: text('storage_key').notNull(),
  totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('GENERATED'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  effectKey: text('effect_key').notNull().unique(),
  userId: uuid('user_id'),
  channel: text('channel').notNull(),
  template: text('template').notNull(),
  recipient: text('recipient').notNull(),
  status: text('status').notNull().default('DELIVERED'),
  attempts: integer('attempts').notNull().default(1),
  providerRef: text('provider_ref'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type InvoiceRecord = typeof invoices.$inferSelect;
export type NewInvoiceRecord = typeof invoices.$inferInsert;
export type NotificationDeliveryRecord = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDeliveryRecord = typeof notificationDeliveries.$inferInsert;
