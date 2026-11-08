-- An order's history (src/lib/shop/history.ts): what happened to it and when (placed, paid, emails sent,
-- shipped, refunds, stock put back, status changes) and the shop's notes, each with who did it (empty:
-- the site itself). Written by the server only; editors read it. And the shop's own status for an order
-- (Settings > Shop, Order statuses: an id, empty for none).
CREATE TABLE shop_order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL,
  by TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  data JSON_TEXT,
  FOREIGN KEY (order_id) REFERENCES shop_orders (id) ON DELETE CASCADE
);
CREATE INDEX shop_order_events_order ON shop_order_events (order_id, at);
ALTER TABLE shop_orders ADD COLUMN custom_status TEXT NOT NULL DEFAULT '';
-- The notes kept so far become the first note in each order's history.
INSERT INTO shop_order_events (order_id, at, kind, text)
  SELECT id, updated_at, 'note', notes FROM shop_orders WHERE trim(notes) <> '';
