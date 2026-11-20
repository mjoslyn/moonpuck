// Comments on a page's or newsletter draft's blocks (table share_comments): left by a guest with a share
// link that views it (a password or anyone link; they give a name) or by a signed-in editor or admin, from a
// page's preview (public/assets/js/share-comments.js), a newsletter's share page, the page editor's Comments
// panel or the campaign screen. A comment names one block (its id) or none (the whole page or email), with
// the block's type and a few words of it to show where it was. Editors read them, resolve, reopen and delete
// them (/api/admin/share-comments). Written as the server; the text is plain and shown escaped.
import { siteDb } from '../db/site';
import type { Db } from '../db/query';
import type { ShareLink, ShareSubject } from './links';

/** The longest comment, name and quote kept. */
export const COMMENT_MAX = 2000;
export const NAME_MAX = 80;
export const QUOTE_MAX = 200;
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

type Item = { type: string; props?: Record<string, any> };

/** Every block of a page's content (its blocks, those inside them and in its root's slots) or an email
 * design (its blocks and those in Sections and Columns), by id with its type and a few words of it. */
export function blocksOf(doc: any): Map<string, { type: string; words: string }> {
  const out = new Map<string, { type: string; words: string }>();
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items as Item[]) {
      if (!item || typeof item !== 'object' || !item.props) continue;
      const id = item.props.id;
      if (id != null && id !== '') out.set(String(id), { type: String(item.type ?? ''), words: wordsOf(item) });
      walk(item.props.children);
      for (const v of Object.values(item.props.attrs ?? {})) walk(v);
      // Email blocks keep their settings, and their inner blocks, on props itself.
      for (const v of Object.values(item.props)) walk(v);
    }
  };
  walk(doc?.content);
  for (const v of Object.values(doc?.root?.props ?? {})) walk(v);
  return out;
}

/** The ids of a page's blocks: those a preview marks for comments. */
export const blockIdsOf = (doc: any): Set<string> => new Set(blocksOf(doc).keys());

/** A few words of a block's own text, for showing which block a comment is on. */
function wordsOf(item: Item): string {
  const p = item.props ?? {};
  const a = p.attrs ?? {};
  const raw = [a.content, a.text, a.title, a.heading, a.label, a.caption, p.text, p.html, p.label, p.heading].find((v) => typeof v === 'string' && v.trim()) ?? '';
  return plain(String(raw)).slice(0, QUOTE_MAX);
}

/** Text with its markup and runs of spaces taken out. */
export const plain = (s: string) => s.replace(/<[^>]*>?/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

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

/** Comments shown a page at a time on the Comments screen. */
export const COMMENTS_PER_PAGE = 50;

/** A comment as the Comments screen lists it: what it is on (its title, its editor and, for a page, its preview). */
export interface ListedComment extends ShareComment {
  guest: boolean;
  resolved_by_name: string;
  on: { kind: 'entry' | 'campaign'; id: number; title: string; type: string; editor: string; preview: string | null; trashed: boolean };
}

/**
 * Every page's and newsletter's comments, for the Comments screen (the admin bar's Comments): `status` open,
 * resolved or all, newest first, `q` in the comment, its author or the words of its block, a page of
 * `COMMENTS_PER_PAGE`, read as `db` (editors read them all). With the total and how many are open.
 */
export async function listComments(db: Db, o: { status?: string; q?: string; page?: number } = {}): Promise<{ comments: ListedComment[]; total: number; open: number }> {
  const status = o.status === 'resolved' || o.status === 'all' ? o.status : 'open';
  // Characters the filter syntax gives meaning to are left out of a search.
  const q = String(o.q ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 100);
  const page = Math.max(1, Math.min(9999, Math.floor(Number(o.page) || 1)));
  let query = db.from('share_comments').select(COLUMNS, { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  if (q) query = query.or(`body.ilike.%${q}%,author.ilike.%${q}%,quote.ilike.%${q}%`);
  const [{ data, count, error }, { count: open }] = await Promise.all([
    query.order('id', { ascending: false }).range((page - 1) * COMMENTS_PER_PAGE, page * COMMENTS_PER_PAGE - 1),
    db.from('share_comments').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ShareComment[];
  const ids = (k: 'entry_id' | 'campaign_id') => [...new Set(rows.map((r) => r[k]).filter((v): v is number => !!v))];
  const people = [...new Set(rows.map((r) => r.resolved_by).filter(Boolean))] as string[];
  const [entries, campaigns, names] = await Promise.all([
    ids('entry_id').length ? db.from('entries').select('id, title, type, status').in('id', ids('entry_id')) : { data: [] },
    ids('campaign_id').length ? db.from('campaigns').select('id, name').in('id', ids('campaign_id')) : { data: [] },
    people.length ? db.from('profiles').select('id, display_name').in('id', people) : { data: [] },
  ]);
  const entry = new Map(((entries.data ?? []) as { id: number; title: string; type: string; status: string }[]).map((e) => [e.id, e]));
  const campaign = new Map(((campaigns.data ?? []) as { id: number; name: string }[]).map((c) => [c.id, c]));
  const name = new Map(((names.data ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name ?? '']));
  const comments = rows.map((r): ListedComment => {
    const subject = subjectOfComment(r);
    const on: ListedComment['on'] =
      subject.kind === 'campaign'
        ? { kind: 'campaign', id: subject.id, title: campaign.get(subject.id)?.name || 'A newsletter', type: 'Newsletter', editor: `/admin/mailing-lists/campaigns/${subject.id}/`, preview: null, trashed: false }
        : { kind: 'entry', id: subject.id, title: entry.get(subject.id)?.title || '(untitled)', type: entry.get(subject.id)?.type ?? '', editor: `/admin/edit/${subject.id}/`, preview: `/admin/preview/${subject.id}/`, trashed: entry.get(subject.id)?.status === 'trash' };
    return { ...r, guest: !!r.link_id, resolved_by_name: r.resolved_by ? (name.get(r.resolved_by) ?? '') : '', on };
  });
  return { comments, total: count ?? 0, open: open ?? 0 };
}

/** Pages to comment on from the Comments screen: entries of the types given (those with a page) whose title
 * has what was typed, not in the trash, latest edited first. */
export async function pagesToComment(db: Db, query: string, types: string[], limit = 8): Promise<{ id: number; title: string; type: string; status: string }[]> {
  const term = query.replace(/[%\\]/g, ' ').trim().slice(0, 100);
  if (!types.length) return [];
  let q = db.from('entries').select('id, title, type, status').in('type', types).neq('status', 'trash');
  if (term) q = q.ilike('title', `%${term}%`);
  const { data } = await q.order('updated_at', { ascending: false }).limit(limit);
  return (data ?? []) as { id: number; title: string; type: string; status: string }[];
}
