-- The copy of the site a one-time gift or a shop order was made on (its address, SITE_URL as it was
-- then), as monthly donors keep theirs: only that copy acts on its payment (marks it paid from the
-- provider's webhook, sends its emails, closes or refunds it at the provider), so a copy that has it
-- through a sync, with a webhook of its own on the same account, leaves it alone. '' (rows from before
-- this) lets any copy act, as before.
ALTER TABLE donations ADD COLUMN home TEXT NOT NULL DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN home TEXT NOT NULL DEFAULT '';
