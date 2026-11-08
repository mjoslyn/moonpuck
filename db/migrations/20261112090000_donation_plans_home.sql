-- The copy of the site a monthly gift started on (its address, SITE_URL as it was then): only that copy
-- records the gift's monthly payments, emails its donor and changes it at Stripe, so a copy that has
-- the plan through a sync, and its own webhook on the same Stripe account, leaves it alone. '' (plans
-- from before this) lets any copy act, as before.
ALTER TABLE donation_plans ADD COLUMN home TEXT NOT NULL DEFAULT '';
