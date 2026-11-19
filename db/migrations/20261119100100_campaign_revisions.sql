-- A campaign's saved versions (src/lib/mailing/revisions.ts): each save of its name, subject, email and
-- plain text, by an editor (author_id) or through a share link (no author, a note). Editors read; the
-- server writes. Not synced or backed up, as campaigns aren't.
CREATE TABLE campaign_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  design JSON_TEXT,
  text TEXT NOT NULL DEFAULT '',
  author_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX campaign_revisions_campaign_idx ON campaign_revisions (campaign_id, id);
