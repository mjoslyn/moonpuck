// Leave a comment on a shared page's or newsletter's block (src/lib/share/comments.ts). POST JSON
// { kind: 'entry' | 'campaign', id, block?, body, name? } (a page's preview) or a form post with the same
// fields and `back`, a /share/ address to return to (a newsletter's share page). Who may: a signed-in editor
// or admin (as themselves), or a guest whose cookie for that page or newsletter fits a live view link (with
// the name they give). Not cached; JSON answers { ok, comment } or the reason.
import type { APIRoute } from 'astro';
import { sessionUser } from '../../../lib/auth';
import { sessionDb, siteDb } from '../../../lib/db/site';
import { cookieFits, cookieToken, liveLink, subjectOf, type ShareSubject } from '../../../lib/share/links';
import { addComment, type Commenter } from '../../../lib/share/comments';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

/** Who is commenting on `subject`, or null: an editor who can read it, or a guest whose cookie fits a live view link to it. */
async function commenter(request: Request, subject: ShareSubject): Promise<Commenter | null> {
  const user = await sessionUser(request);
  if (user) {
    const { data: profile } = await siteDb().from('profiles').select('role, display_name').eq('id', user.id).maybeSingle();
    if (profile && ['editor', 'admin'].includes(profile.role)) {
      const db = sessionDb({ role: profile.role, uid: user.id });
      const { data } = await db.from(subject.kind === 'campaign' ? 'campaigns' : 'entries').select('id').eq('id', subject.id).maybeSingle();
      return data ? { editor: { id: user.id, name: profile.display_name || user.email } } : null;
    }
  }
  const c = cookieToken(request, subject);
  if (!c) return null;
  const link = await liveLink(c.token);
  if (!link || link.mode !== 'view' || link.access === 'login' || !cookieFits(link, c.sig)) return null;
  const s = subjectOf(link);
  return s.kind === subject.kind && s.id === subject.id ? { link } : null;
}

export const POST: APIRoute = async ({ request }) => {
  const isForm = /form/.test(request.headers.get('content-type') ?? '');
  const body: Record<string, any> = isForm ? Object.fromEntries((await request.formData()).entries()) : await request.json().catch(() => ({}));
  const back = isForm && /^\/share\/[A-Za-z0-9_-]+\/$/.test(String(body.back ?? '')) ? String(body.back) : null;
  const answer = (status: number, out: Record<string, unknown>) =>
    back ? new Response(null, { status: 303, headers: { ...NO_STORE, Location: `${back}?${out.ok ? 'commented=1' : `comment_error=${encodeURIComponent(String(out.error ?? 'Not sent'))}`}#comments` } }) : Response.json(out, { status, headers: NO_STORE });
  const kind = body.kind === 'campaign' ? 'campaign' : body.kind === 'entry' ? 'entry' : null;
  const id = Number(body.id);
  if (!kind || !Number.isInteger(id) || id <= 0) return answer(400, { ok: false, error: 'Which page or newsletter?' });
  const subject: ShareSubject = { kind, id };
  const who = await commenter(request, subject);
  if (!who) return answer(403, { ok: false, error: 'This link can’t be used to comment. Open it again.' });
  const r = await addComment({ subject, block: String(body.block ?? ''), body: String(body.body ?? ''), name: String(body.name ?? '') }, who);
  return r.ok ? answer(200, { ok: true, comment: r.comment }) : answer(r.status, { ok: false, error: r.error });
};
