-- Which version a share link shows (src/lib/share/links.ts): 'latest' (the saved version, unpublished changes
-- included, as it is when opened), 'live' (a page's published version) or 'revision' (one saved version,
-- frozen: its copy in `snapshot`, from revisions or campaign_revisions row `revision_id`, saved `version_at`).
ALTER TABLE share_links ADD COLUMN version TEXT NOT NULL DEFAULT 'latest';
ALTER TABLE share_links ADD COLUMN revision_id INTEGER;
ALTER TABLE share_links ADD COLUMN version_at TIMESTAMPTZ;
ALTER TABLE share_links ADD COLUMN snapshot JSON_TEXT;
