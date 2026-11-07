-- The shop's orders (src/lib/shop/orders.ts): a checkout from the cart, held against stock until it is
-- paid or its hold expires. Each order keeps a copy of its lines (`lines`: product, variant, title, label,
-- SKU, unit price, quantity, total, discount and tax shares, whether its stock is counted, how many went
-- back to stock), so what was bought stays as it was. Stock is taken off on_hand when an order is paid
-- (`stock_taken`); until then a pending order's lines are held.
CREATE TABLE shop_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL,
  provider_ref TEXT,
  provider_order TEXT,
  provider_payment TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address JSON_TEXT,
  fulfilment TEXT NOT NULL DEFAULT 'none',
  shipping JSON_TEXT,
  lines JSON_TEXT NOT NULL DEFAULT '[]',
  quantity INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping_total INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  tax_by TEXT NOT NULL DEFAULT 'site',
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  stock_taken BOOLEAN NOT NULL DEFAULT 0,
  fulfilled TEXT NOT NULL DEFAULT '',
  fulfilled_at TIMESTAMPTZ,
  tracking TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  member_id UUID,
  ip TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (code),
  UNIQUE (token),
  FOREIGN KEY (member_id) REFERENCES users (id) ON DELETE SET NULL,
  CHECK ((total >= 0)),
  CHECK ((quantity > 0)),
  CHECK ((provider IN ('free', 'stripe', 'square'))),
  CHECK ((status IN ('pending', 'paid', 'cancelled', 'expired', 'refunded'))),
  CHECK ((fulfilment IN ('none', 'ship', 'pickup'))),
  CHECK ((fulfilled IN ('', 'shipped', 'picked_up'))),
  CHECK ((tax_by IN ('site', 'stripe')))
);
CREATE INDEX shop_orders_status ON shop_orders (status, expires_at);
CREATE INDEX shop_orders_ref ON shop_orders (provider_ref);
CREATE INDEX shop_orders_payment ON shop_orders (provider_payment);
CREATE INDEX shop_orders_created ON shop_orders (created_at);
CREATE TRIGGER shop_orders_touch AFTER UPDATE ON shop_orders FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE shop_orders SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
