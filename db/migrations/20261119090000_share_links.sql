-- Share links (src/lib/share/): private addresses for one entry, to view it or to edit it as a draft.
-- `access`: login (editors and admins signed in), password (anyone with the link and the password,
-- `password_hash` scrypt) or anyone (anyone with the link). `mode`: view or edit. The token is the
-- link's secret; only the server reads this table. Not synced or backed up.
CREATE TABLE share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  entry_id INTEGER NOT NULL,
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
  FOREIGN KEY (entry_id) REFERENCES entries (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX share_links_entry_idx ON share_links (entry_id);

CREATE TRIGGER share_links_touch AFTER UPDATE ON share_links FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE share_links SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
