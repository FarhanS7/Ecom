-- 0024-reporting-views.sql
-- Materialized read models for sales analytics, GMV, and store performance (AD-2, REQ-ENG-002 / T066).

CREATE MATERIALIZED VIEW IF NOT EXISTS "mv_daily_sales" AS
WITH so_items AS (
  SELECT
    so.id AS seller_order_id,
    so.store_id,
    date_trunc('day', so.created_at)::date AS order_day,
    so.total_cents,
    so.subtotal_cents,
    so.discount_cents,
    COALESCE(SUM(oi.qty), 0)::integer AS items_qty
  FROM seller_orders so
  JOIN orders o ON o.id = so.order_id
  LEFT JOIN order_items oi ON oi.seller_order_id = so.id
  WHERE o.payment_status = 'PAID'
  GROUP BY so.id, so.store_id, date_trunc('day', so.created_at)::date, so.total_cents, so.subtotal_cents, so.discount_cents
)
SELECT
  order_day AS "day",
  store_id AS "store_id",
  COUNT(*)::integer AS "orders_count",
  COALESCE(SUM(items_qty), 0)::integer AS "units_sold",
  COALESCE(SUM(total_cents), 0)::bigint AS "gmv_cents",
  COALESCE(SUM(subtotal_cents - discount_cents), 0)::bigint AS "net_sales_cents",
  CASE
    WHEN COUNT(*) > 0 THEN (COALESCE(SUM(total_cents), 0) / COUNT(*))::integer
    ELSE 0
  END AS "avg_order_value_cents"
FROM so_items
GROUP BY order_day, store_id;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_mv_daily_sales"
  ON "mv_daily_sales" ("day", "store_id");

CREATE INDEX IF NOT EXISTS "idx_mv_daily_sales_store_day"
  ON "mv_daily_sales" ("store_id", "day" DESC);


CREATE MATERIALIZED VIEW IF NOT EXISTS "mv_store_performance" AS
WITH paid_suborders AS (
  SELECT
    so.id,
    so.store_id,
    so.total_cents,
    so.created_at
  FROM seller_orders so
  JOIN orders o ON o.id = so.order_id
  WHERE o.payment_status = 'PAID'
)
SELECT
  s.id AS "store_id",
  s.name AS "store_name",
  s.slug AS "store_slug",
  COUNT(pso.id)::integer AS "total_orders",
  COALESCE(SUM(pso.total_cents), 0)::bigint AS "lifetime_gmv_cents",
  CASE
    WHEN COUNT(pso.id) > 0 THEN (COALESCE(SUM(pso.total_cents), 0) / COUNT(pso.id))::integer
    ELSE 0
  END AS "avg_order_value_cents",
  MAX(pso.created_at) AS "last_order_at"
FROM stores s
LEFT JOIN paid_suborders pso ON pso.store_id = s.id
GROUP BY s.id, s.name, s.slug;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_mv_store_performance"
  ON "mv_store_performance" ("store_id");
