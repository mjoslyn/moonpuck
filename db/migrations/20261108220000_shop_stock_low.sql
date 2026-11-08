-- Low-stock alerts (src/lib/shop/low-stock.ts): when the shop was told a variant ran low. A sale that
-- takes a variant to its low-stock mark emails the shop once; raising the count (a restock, or a count
-- set by hand) clears this, so the next time it runs low the shop is told again.
ALTER TABLE shop_stock ADD COLUMN low_alerted_at TIMESTAMPTZ;
CREATE TRIGGER shop_stock_low_rearm AFTER UPDATE OF on_hand ON shop_stock FOR EACH ROW WHEN NEW.on_hand > OLD.on_hand AND NEW.low_alerted_at IS NOT NULL
BEGIN
  UPDATE shop_stock SET low_alerted_at = NULL WHERE rowid = NEW.rowid;
END;
