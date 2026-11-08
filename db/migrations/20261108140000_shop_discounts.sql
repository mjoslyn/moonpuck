-- The shop's discounts (src/lib/shop/discounts.ts): a code a buyer types (`code`, matched without regard
-- to case) or, without one, automatic; percent off, an amount off or free shipping; on the whole order or
-- some products or product categories; with a minimum subtotal, dates, a total number of uses, once per
-- email, and members only (of some levels). An order keeps the discount it took (`discount_id`,
-- `discount_code`); uses are its paid orders and unexpired holds, counted when an order is made.
CREATE TABLE shop_discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'percent',
  value REAL NOT NULL DEFAULT 0,
  applies TEXT NOT NULL DEFAULT 'all',
  products JSON_TEXT NOT NULL DEFAULT '[]',
  categories JSON_TEXT NOT NULL DEFAULT '[]',
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_uses INTEGER,
  once_per_email BOOLEAN NOT NULL DEFAULT 0,
  members_only BOOLEAN NOT NULL DEFAULT 0,
  levels JSON_TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((kind IN ('percent', 'amount', 'free_shipping'))),
  CHECK ((applies IN ('all', 'products', 'categories'))),
  CHECK ((value >= 0))
);
CREATE UNIQUE INDEX shop_discounts_code ON shop_discounts (lower(code)) WHERE code IS NOT NULL;
CREATE TRIGGER shop_discounts_touch AFTER UPDATE ON shop_discounts FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE shop_discounts SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;

ALTER TABLE shop_orders ADD COLUMN discount_id INTEGER REFERENCES shop_discounts (id) ON DELETE SET NULL;
ALTER TABLE shop_orders ADD COLUMN discount_code TEXT NOT NULL DEFAULT '';
CREATE INDEX shop_orders_discount ON shop_orders (discount_id);
