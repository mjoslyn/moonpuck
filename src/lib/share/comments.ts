// Comments on a page's or newsletter draft's blocks (table share_comments): left by a guest with a share
// link that views it (a password or anyone link; they give a name) or by a signed-in editor or admin, from a
// page's preview (public/assets/js/share-comments.js), a newsletter's share page, the page editor's Comments
// panel or the campaign screen. A comment names one block (its id) or none (the whole page or email), with
// the block's type and a few words of it to show where it was. Editors read them, resolve, reopen and delete
// them (/api/admin/share-comments). Written as the server; the text is plain and shown escaped.
import { siteDb } from '../db/site';
import type { ShareLink, ShareSubject } from './links';
import { blocksOf } from './blocks';

export { blockIdsOf, blocksOf, plain, QUOTE_MAX } from './blocks';

/** The longest comment, name and quote kept. */
export const COMMENT_MAX = 2000;
export const NAME_MAX = 80;
/** Comments a guest's link may leave in an hour (all its guests together). */
export const GUEST_COMMENTS_PER_HOUR = 30;

/** Why a comment wasn't taken, as a code (a form post's return address carries the code, never the words,
 * so a link can't put text on the share page) and in words. */
export const COMMENT_ERRORS = {
  empty: 'Write a comment first.',
  long: `A comment can be at most ${COMMENT_MAX} characters.`,
  missing: 'Not found',
  block: 'That block isn’t in the saved version. Save the page, then comment.',
  name: 'Add your name, so the editors know who wrote it.',
  limit: 'Too many comments for now. Please wait a while and try again.',
  link: 'This link can’t be used to comment. Open it again.',
  which: 'Which page or newsletter?',
  failed: 'Your comment couldn’t be saved. Try again.',
} as const;
export type CommentError = keyof typeof COMMENT_ERRORS;
/** The words for a code from a return address, or none for anything else. */
export const commentErrorText = (code: string | null | undefined): string => (code && Object.hasOwn(COMMENT_ERRORS, code) ? COMMENT_ERRORS[code as CommentError] : '');

export interface ShareComment {
  id: number;
  link_id: number | null;
  entry_id: number | null;
  campaign_id: number | null;
  block: string;
  block_type: string;
  quote: string;
  body: string;
  author: string;
  author_id: string | null;
  status: 'open' | 'resolved';
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

const COLUMNS = 'id, link_id, entry_id, campaign_id, block, block_type, quote, body, author, author_id, status, resolved_at, resolved_by, created_at';

/** The blocks of what is shared, as stored: a page's content and its unpublished changes; a newsletter's design. */
async function sharedBlocks(subject: ShareSubject, link?: ShareLink): Promise<Map<string, { type: string; words: string }> | null> {
  const db = siteDb();
  // A link to a saved version: its blocks count too (they may since have gone from the page).
  const snap = link?.version === 'revision' ? (link.snapshot as Record<string, unknown> | null) : null;
  if (subject.kind === 'campaign') {
    const { data } = await db.from('campaigns').select('design').eq('id', subject.id).maybeSingle();
    if (!data) return null;
    const blocks = blocksOf(data.design);
    for (const [k, v] of blocksOf(snap?.design)) blocks.set(k, v);
    return blocks;
  }
  const [{ data: e }, { data: d }] = await Promise.all([
    db.from('entries').select('content, status').eq('id', subject.id).maybeSingle(),
    db.from('entry_drafts').select('draft').eq('entry_id', subject.id).maybeSingle(),
  ]);
  if (!e || e.status === 'trash') return null;
  const blocks = blocksOf(e.content);
  for (const [k, v] of blocksOf(d?.draft?.content)) blocks.set(k, v);
  for (const [k, v] of blocksOf(snap?.content)) blocks.set(k, v);
  return blocks;
}

export interface NewComment {
  subject: ShareSubject;
  /** A block's id, or empty for the whole page or email. */
  block?: string;
  body: string;
  /** A guest's name (an editor's comes from their account). */
  name?: string;
}

/** Who leaves a comment: a guest through a link, or a signed-in editor or admin. */
export type Commenter = { link: ShareLink; name?: string } | { editor: { id: string; name: string } };

/** Leave a comment: checked (the block is one of what is shared, the text not too long, a guest's link
 * under its hourly limit) and kept. The answer is the comment, or why not. */
export async function addComment(c: NewComment, by: Commenter): Promise<{ ok: true; comment: ShareComment } | { ok: false; code: CommentError; error: string; status: number }> {
  const no = (code: CommentError, status: number) => ({ ok: false as const, code, error: COMMENT_ERRORS[code], status });
  const body = String(c.body ?? '').trim();
  if (!body) return no('empty', 400);
  if (body.length > COMMENT_MAX) return no('long', 400);
  const blocks = await sharedBlocks(c.subject, 'link' in by ? by.link : undefined);
  if (!blocks) return no('missing', 404);
  const block = String(c.block ?? '');
  const found = block ? blocks.get(block) : undefined;
  if (block && !found) return no('block', 400);
  const db = siteDb();
  let author: string;
  if ('link' in by) {
    author = String(by.name ?? c.name ?? '').trim().slice(0, NAME_MAX);
    if (!author) return no('name', 400);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from('share_comments').select('id', { count: 'exact', head: true }).eq('link_id', by.link.id).gt('created_at', since);
    if ((count ?? 0) >= GUEST_COMMENTS_PER_HOUR) return no('limit', 429);
  } else author = by.editor.name;
  const row = {
    link_id: 'link' in by ? by.link.id : null,
    author_id: 'editor' in by ? by.editor.id || null : null,
    entry_id: c.subject.kind === 'entry' ? c.subject.id : null,
    campaign_id: c.subject.kind === 'campaign' ? c.subject.id : null,
    block,
    block_type: found?.type ?? '',
    quote: found?.words ?? '',
    body,
    author,
  };
  const { data, error } = await db.from('share_comments').insert(row).select(COLUMNS).single();
  if (error || !data) return no('failed', 400);
  if ('link' in by) {
    // The count above and the insert are two statements, so comments sent at once could all pass it: the
    // link's comments of the hour up to this one decide, and one past the limit is taken out again.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from('share_comments').select('id', { count: 'exact', head: true }).eq('link_id', by.link.id).gt('created_at', since).lte('id', data.id);
    if ((count ?? 0) > GUEST_COMMENTS_PER_HOUR) {
      await db.from('share_comments').delete().eq('id', data.id);
      return no('limit', 429);
    }
  }
  return { ok: true, comment: data as ShareComment };
}

/** A page's or newsletter's comments, open ones first, then newest first. */
export async function commentsOf(subject: ShareSubject): Promise<ShareComment[]> {
  const { data, error } = await siteDb().from('share_comments').select(COLUMNS).eq(subject.kind === 'campaign' ? 'campaign_id' : 'entry_id', subject.id).order('id', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ShareComment[];
  return [...rows.filter((r) => r.status === 'open'), ...rows.filter((r) => r.status !== 'open')];
}

/** Resolve or reopen a comment. */
export async function setCommentStatus(id: number, status: 'open' | 'resolved', by: string): Promise<void> {
  const patch = status === 'resolved' ? { status, resolved_at: new Date().toISOString(), resolved_by: by || null } : { status, resolved_at: null, resolved_by: null };
  const { error } = await siteDb().from('share_comments').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Delete a comment. */
export async function deleteComment(id: number): Promise<void> {
  const { error } = await siteDb().from('share_comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** What a comment is on, from its row. */
export const subjectOfComment = (c: Pick<ShareComment, 'entry_id' | 'campaign_id'>): ShareSubject => (c.campaign_id ? { kind: 'campaign', id: c.campaign_id } : { kind: 'entry', id: c.entry_id ?? 0 });
