-- A carrier for shipped orders (src/lib/shop/carrier.ts): the carrier it went with, a label bought for it
-- through the carrier service, its latest tracking, and when it was delivered (claimed once, so the
-- buyer's Delivered email goes once). Tracking updates find their order by number.
ALTER TABLE shop_orders ADD COLUMN carrier TEXT NOT NULL DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN label JSON_TEXT;
ALTER TABLE shop_orders ADD COLUMN tracking_status JSON_TEXT;
ALTER TABLE shop_orders ADD COLUMN delivered_at TIMESTAMPTZ;
CREATE INDEX shop_orders_tracking ON shop_orders (tracking);
