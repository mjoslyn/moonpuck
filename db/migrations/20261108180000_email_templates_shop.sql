-- Email templates of the shop's order emails (kit `shop`, defaults `shop:<kind>`; src/lib/shop/email.ts).
-- SQLite can't change a CHECK in place, so the table is made again with its rows and ids.
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
  CHECK ((kit IN ('mailing', 'form', 'ticket', 'shop')))
);
INSERT INTO email_templates_new (id, kit, name, design, text, default_for, created_at, updated_at)
  SELECT id, kit, name, design, text, default_for, created_at, updated_at FROM email_templates;
DROP TABLE email_templates;
ALTER TABLE email_templates_new RENAME TO email_templates;
CREATE TRIGGER email_templates_touch AFTER UPDATE ON email_templates FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE email_templates SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
