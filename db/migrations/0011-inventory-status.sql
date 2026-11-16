-- 0011-inventory-status.sql - Extend reservation status and movement reason constraints for expiry sweeps (T039).

ALTER TABLE "stock_reservations" DROP CONSTRAINT IF EXISTS "stock_reservations_status_check";
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_status_check"
  CHECK ("status" IN ('active', 'released', 'expired', 'consumed'));

ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_reason_check";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_check"
  CHECK ("reason" IN ('initial_stock', 'manual_adjustment', 'reservation_created', 'reservation_released', 'reservation_expired', 'order_fulfillment', 'return_restock'));
