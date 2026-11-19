-- Comments left through a share link that views (src/lib/share/comments.ts): on one block or section of a
-- page (entry_id; block the block's id) or of a newsletter draft (campaign_id), by a guest who gave a name
-- (link_id) or a signed-in editor (author_id).
-- Editors read them and resolve or delete them through the API; the server writes. Not synced or backed up.
CREATE TABLE share_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER,
  entry_id INTEGER,
  campaign_id INTEGER,
  block TEXT NOT NULL DEFAULT '',
  block_type TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  author_id UUID,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((status IN ('open', 'resolved'))),
  CHECK (((entry_id IS NULL) <> (campaign_id IS NULL))),
  FOREIGN KEY (link_id) REFERENCES share_links (id) ON DELETE SET NULL,
  FOREIGN KEY (entry_id) REFERENCES entries (id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX share_comments_entry_idx ON share_comments (entry_id, id);
CREATE INDEX share_comments_campaign_idx ON share_comments (campaign_id, id);
CREATE INDEX share_comments_link_idx ON share_comments (link_id, created_at);

CREATE TRIGGER share_comments_touch AFTER UPDATE ON share_comments FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE share_comments SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
