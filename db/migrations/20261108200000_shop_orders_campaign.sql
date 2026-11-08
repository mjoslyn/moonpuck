-- The campaign a shop order's visit came from (`campaign|source|medium`, from the address's utm_ values,
-- as the site's stats keep them; '' for none): Shop > Stats lists sales by campaign.
ALTER TABLE shop_orders ADD COLUMN campaign TEXT NOT NULL DEFAULT '';
