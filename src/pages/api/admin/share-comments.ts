// A page's or newsletter's comments (src/lib/share/comments.ts), for editors: the page editor's Comments
// panel and the campaign screen. GET ?entry=<id> or ?campaign=<id>: its comments, open first, with who
// resolved each; GET ?people: the editors and admins to @mention (src/lib/share/mentions.ts), whom an
// added comment emails. GET ?all&status=open|resolved|all&q=&page=: every page's and newsletter's comments,
// for the Comments screen (listComments); GET ?pages=<words>: pages to comment on from there. POST { action: 'add', entry or campaign, block?, body } (as the editor), or
// { action: 'resolve' | 'reopen' | 'delete', id }. Only for what this editor can read; doesn't clear the
// page cache.
import type { APIRoute } from 'astro';
import { siteDb } from '../../../lib/db/site';
import type { ShareSubject } from '../../../lib/share/links';
import { afterAnswer } from '../../../lib/platform';
import { mailOrigin } from '../../../lib/mailing/contacts';
import { mentionablePeople, notifyMentions } from '../../../lib/share/mentions';
import { addComment, commentsOf, deleteComment, listComments, pagesToComment, setCommentStatus, subjectOfComment } from '../../../lib/share/comments';
import { COMPOSABLE_TYPES } from '../../../lib/site';
import { featuresOf, showsType } from '../../../lib/features';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function subjectFrom(v: { entry?: unknown; campaign?: unknown }): ShareSubject | null {
  const campaign = Number(v.campaign);
  if (Number.isInteger(campaign) && campaign > 0) return { kind: 'campaign', id: campaign };
  const entry = Number(v.entry);
  return Number.isInteger(entry) && entry > 0 ? { kind: 'entry', id: entry } : null;
}

const readable = async (db: App.Locals['db'], s: ShareSubject) => !!(await db.from(s.kind === 'campaign' ? 'campaigns' : 'entries').select('id').eq('id', s.id).maybeSingle()).data;

export const GET: APIRoute = async ({ url, locals }) => {
  // The editors and admins a comment can @mention (no addresses).
  if (url.searchParams.has('people')) return Response.json((await mentionablePeople()).map(({ id, name, handle }) => ({ id, name, handle })), { headers: NO_STORE });
  if (url.searchParams.has('all')) {
    const p = url.searchParams;
    return Response.json(await listComments(locals.db, { status: p.get('status') ?? 'open', q: p.get('q') ?? '', page: Number(p.get('page')) || 1 }), { headers: NO_STORE });
  }
  if (url.searchParams.has('pages')) {
    // Types with a page of their own, those the admin shows (an optional feature's only while it is on).
    const site = (await locals.db.from('settings').select('value').eq('key', 'site').maybeSingle()).data?.value as Record<string, any> | undefined;
    const types = COMPOSABLE_TYPES.filter((t) => showsType(t.type, featuresOf(site)));
    const label = new Map(types.map((t) => [t.type, t.singular]));
    const pages = await pagesToComment(locals.db, url.searchParams.get('pages') ?? '', [...label.keys()]);
    return Response.json(pages.map((e) => ({ ...e, type_label: label.get(e.type) ?? e.type })), { headers: NO_STORE });
  }
  const subject = subjectFrom({ entry: url.searchParams.get('entry'), campaign: url.searchParams.get('campaign') });
  if (!subject) return new Response('Which page or newsletter?', { status: 400 });
  if (!(await readable(locals.db, subject))) return new Response('Not found', { status: 404 });
  const comments = await commentsOf(subject);
  const ids = [...new Set(comments.map((c) => c.resolved_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await siteDb().from('profiles').select('id, display_name').in('id', ids) : { data: [] };
  const names = new Map((people ?? []).map((p: any) => [p.id, p.display_name ?? '']));
  return Response.json(comments.map((c) => ({ ...c, resolved_by_name: c.resolved_by ? (names.get(c.resolved_by) ?? '') : '', guest: !!c.link_id })), { headers: NO_STORE });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  if (body.action === 'add') {
    const subject = subjectFrom(body);
    if (!subject || !(await readable(locals.db, subject))) return new Response('Not found', { status: 404 });
    const r = await addComment({ subject, block: String(body.block ?? ''), body: String(body.body ?? '') }, { editor: { id: locals.user.id, name: locals.user.name || locals.user.email } });
    if (!r.ok) return new Response(r.error, { status: r.status });
    afterAnswer(notifyMentions(r.comment, mailOrigin(new URL(request.url).origin)).catch((e) => console.error('comment mentions', e)));
    return Response.json(r.comment, { headers: NO_STORE });
  }
  if (['resolve', 'reopen', 'delete'].includes(body.action)) {
    const id = Number(body.id);
    const { data: c } = await siteDb().from('share_comments').select('entry_id, campaign_id').eq('id', id).maybeSingle();
    if (!c || !(await readable(locals.db, subjectOfComment(c)))) return new Response('Not found', { status: 404 });
    if (body.action === 'delete') await deleteComment(id);
    else await setCommentStatus(id, body.action === 'resolve' ? 'resolved' : 'open', locals.user.id);
    return Response.json({ ok: true }, { headers: NO_STORE });
  }
  return new Response('Unknown action', { status: 400 });
};
