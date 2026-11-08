-- Donations (src/lib/donations/): gifts made with the Donate block, one row per payment, and monthly
-- gifts (donation_plans), Stripe subscriptions that make a donation row each month they are paid.
-- Amounts are in minor units: `amount` the gift, `fee` what the donor added to cover the fees, `total`
-- what was charged. Not synced or backed up: they stay on the copy where they were made.
CREATE TABLE donation_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'incomplete',
  provider TEXT NOT NULL DEFAULT 'stripe',
  customer TEXT,
  subscription TEXT,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  anonymous BOOLEAN NOT NULL DEFAULT 0,
  dedication TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (token),
  CHECK ((total > 0)),
  CHECK ((provider IN ('stripe'))),
  CHECK ((status IN ('incomplete', 'active', 'past_due', 'cancelled')))
);
CREATE INDEX donation_plans_subscription ON donation_plans (subscription);
CREATE TRIGGER donation_plans_touch AFTER UPDATE ON donation_plans FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE donation_plans SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;

CREATE TABLE donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  kind TEXT NOT NULL DEFAULT 'once',
  plan_id INTEGER,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  provider_order TEXT,
  provider_payment TEXT,
  invoice TEXT,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  refund_attempt JSON_TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  anonymous BOOLEAN NOT NULL DEFAULT 0,
  dedication TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (token),
  UNIQUE (code),
  UNIQUE (invoice),
  FOREIGN KEY (plan_id) REFERENCES donation_plans (id) ON DELETE SET NULL,
  CHECK ((total > 0)),
  CHECK ((provider IN ('stripe', 'square'))),
  CHECK ((kind IN ('once', 'monthly'))),
  CHECK ((status IN ('pending', 'paid', 'cancelled', 'expired', 'refunded')))
);
CREATE INDEX donations_status ON donations (status, created_at);
CREATE INDEX donations_ref ON donations (provider_ref);
CREATE INDEX donations_payment ON donations (provider_payment);
CREATE INDEX donations_paid ON donations (paid_at);
CREATE INDEX donations_goal ON donations (goal, status);
CREATE TRIGGER donations_touch AFTER UPDATE ON donations FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE donations SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;

-- Email templates of the donation emails (kit `donation`, defaults `donation:<kind>`; src/lib/donations/email.ts).
CREATE TABLE email_templates_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kit TEXT NOT NULL,
  name TEXT NOT NULL,
  design JSON_TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  default_for TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (default_for),
  CHECK ((kit IN ('mailing', 'form', 'ticket', 'shop', 'donation')))
);
INSERT INTO email_templates_new (id, kit, name, design, text, default_for, created_at, updated_at)
  SELECT id, kit, name, design, text, default_for, created_at, updated_at FROM email_templates;
DROP TABLE email_templates;
ALTER TABLE email_templates_new RENAME TO email_templates;
CREATE TRIGGER email_templates_touch AFTER UPDATE ON email_templates FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE email_templates SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
