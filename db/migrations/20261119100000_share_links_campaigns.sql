-- Share links for newsletter drafts too (src/lib/share/): a link is for an entry or a campaign, one of
-- the two. SQLite can't loosen a NOT NULL column in place, so the table is made again with its rows.
DROP TRIGGER share_links_touch;
CREATE TABLE share_links_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  entry_id INTEGER,
  campaign_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'view',
  access TEXT NOT NULL DEFAULT 'login',
  password_hash TEXT,
  label TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  uses INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (token),
  CHECK ((mode IN ('view', 'edit'))),
  CHECK ((access IN ('login', 'password', 'anyone'))),
  CHECK ((access <> 'password' OR password_hash IS NOT NULL)),
  CHECK (((entry_id IS NULL) <> (campaign_id IS NULL))),
  FOREIGN KEY (entry_id) REFERENCES entries (id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);
INSERT INTO share_links_new (id, token, entry_id, mode, access, password_hash, label, expires_at, revoked_at, uses, last_used_at, created_by, created_at, updated_at)
  SELECT id, token, entry_id, mode, access, password_hash, label, expires_at, revoked_at, uses, last_used_at, created_by, created_at, updated_at FROM share_links;
DROP TABLE share_links;
ALTER TABLE share_links_new RENAME TO share_links;
CREATE INDEX share_links_entry_idx ON share_links (entry_id);
CREATE INDEX share_links_campaign_idx ON share_links (campaign_id);
CREATE TRIGGER share_links_touch AFTER UPDATE ON share_links FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE share_links SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
