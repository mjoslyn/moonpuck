-- An editor's or admin's @handle for comment mentions (src/lib/share/mentions.ts), set on their profile
-- (/admin/profile/); without one, the part of their email before the @ is used.
ALTER TABLE profiles ADD COLUMN handle TEXT;
CREATE UNIQUE INDEX profiles_handle ON profiles (handle) WHERE handle IS NOT NULL;
