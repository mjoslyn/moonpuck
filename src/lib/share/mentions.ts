// @mentions in comments (src/lib/share/comments.ts): an editor's or admin's comment that names another
// editor or admin as @handle emails them (once per comment, never the author), with the comment and a link
// to the page's editor or the campaign screen. A handle is the one set on the person's profile
// (profiles.handle, /admin/profile/), else the part of their email before the @, in lower case, with only
// letters, digits, dots, dashes and underscores; a made one that is taken takes 2, 3... (in order of
// address). Guests' comments notify nobody. Written as the server.
import { siteDb } from '../db/site';
import { sendMail } from '../forms/mail';
import { esc } from '../../render/html';
import { site } from '../site';
import type { ShareComment } from './comments';

export interface Person {
  id: string;
  name: string;
  email: string;
  handle: string;
}

/** A handle from an email address's local part. */
const baseHandle = (email: string) =>
  email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '') || 'editor';

/** The longest handle. */
export const HANDLE_MAX = 30;

/** A handle as typed, cleaned (lower case, no leading @), or why it can't be one. */
export function cleanHandle(raw: string): { handle: string } | { error: string } {
  const handle = String(raw ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!handle) return { handle: '' };
  if (handle.length < 2 || handle.length > HANDLE_MAX) return { error: `A handle has 2 to ${HANDLE_MAX} characters.` };
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(handle)) return { error: 'A handle has only letters, digits, dots, dashes and underscores, and starts and ends with a letter or digit.' };
  return { handle };
}

/** Handles for people, unique, the same each time for the same people: their own, else one made from
 * their address (ordered by address), with a number when taken. */
export function withHandles(people: { id: string; name: string; email: string; handle?: string | null }[]): Person[] {
  const taken = new Set(people.map((p) => p.handle).filter(Boolean) as string[]);
  return [...people]
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((p) => {
      if (p.handle) return { id: p.id, name: p.name, email: p.email, handle: p.handle };
      const base = baseHandle(p.email);
      let handle = base;
      for (let n = 2; taken.has(handle); n++) handle = `${base}${n}`;
      taken.add(handle);
      return { id: p.id, name: p.name, email: p.email, handle };
    });
}

/** The editors and admins who can be mentioned, with their handles. */
export async function mentionablePeople(): Promise<Person[]> {
  const { data } = await siteDb().from('profiles').select('id, display_name, handle, role, users(email)').in('role', ['editor', 'admin']);
  const rows = (data ?? []) as { id: string; display_name: string | null; handle: string | null; users: { email: string } | null }[];
  return withHandles(rows.filter((r) => r.users?.email).map((r) => ({ id: r.id, name: r.display_name || r.users!.email, email: r.users!.email, handle: r.handle })));
}

/** Change a person's own name and handle (their profile). An empty handle goes back to the one made from
 * their address. Refused: a handle someone else has now, made or chosen. */
export async function saveProfile(id: string, input: { name?: unknown; handle?: unknown }): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (!name) return { ok: false, error: 'Add your name.' };
  const h = cleanHandle(String(input.handle ?? ''));
  if ('error' in h) return { ok: false, error: h.error };
  if (h.handle && (await mentionablePeople()).some((p) => p.id !== id && p.handle === h.handle)) return { ok: false, error: `@${h.handle} is someone else’s. Choose another.` };
  const { error } = await siteDb().from('profiles').update({ display_name: name, handle: h.handle || null }).eq('id', id);
  if (error) return { ok: false, error: /unique/i.test(error.message) ? `@${h.handle} is someone else’s. Choose another.` : error.message };
  return { ok: true };
}

/** The @handles in a comment's text (not inside an email address), lower case, each once. */
export function handlesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|[^\w@.])@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/gi)) out.add(m[2].toLowerCase());
  return [...out];
}

/** The people a comment's text mentions. */
export const mentionedIn = (text: string, people: Person[]): Person[] => {
  const handles = new Set(handlesIn(text));
  return people.filter((p) => handles.has(p.handle));
};

/** Email the editors and admins an editor's comment mentions (not its author). The addresses it emails
 * (sendMail logs a failure; one email failing doesn't stop the others). */
export async function notifyMentions(comment: ShareComment, origin: string, people?: Person[]): Promise<string[]> {
  if (!comment.author_id) return [];
  const to = mentionedIn(comment.body, people ?? (await mentionablePeople())).filter((p) => p.id !== comment.author_id);
  if (!to.length) return [];
  const db = siteDb();
  const { title, path } = comment.campaign_id
    ? { title: (await db.from('campaigns').select('name').eq('id', comment.campaign_id).maybeSingle()).data?.name ?? 'a newsletter', path: `/admin/mailing-lists/campaigns/${comment.campaign_id}/` }
    : { title: (await db.from('entries').select('title').eq('id', comment.entry_id ?? 0).maybeSingle()).data?.title || 'a page', path: `/admin/edit/${comment.entry_id}/` };
  const link = `${origin.replace(/\/$/, '')}${path}`;
  const where = comment.block_type ? `${comment.block_type}${comment.quote ? `: ${comment.quote.slice(0, 120)}` : ''}` : 'the whole of it';
  const subject = `${comment.author} mentioned you in a comment on “${title}”`;
  const html =
    `<p>${esc(comment.author)} mentioned you in a comment on <strong>${esc(title)}</strong> (${esc(site.name)}).</p>` +
    `<p style="color:#555">On ${esc(where)}</p>` +
    `<blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #b87333;white-space:pre-wrap">${esc(comment.body)}</blockquote>` +
    `<p><a href="${esc(link)}">Open it to reply or resolve</a></p>`;
  const text = `${comment.author} mentioned you in a comment on "${title}" (${site.name}).\nOn ${where}\n\n${comment.body}\n\nOpen it: ${link}\n`;
  for (const p of to) await sendMail({ to: [p.email], subject, html, text, kind: 'admin' }).catch(() => false);
  return to.map((p) => p.email);
}
