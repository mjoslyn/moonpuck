// An entry's share links (src/lib/share/links.ts), for editors: the editor's Share dialog.
// GET ?entry=<id> or ?campaign=<id>: its links. POST { action: 'create', entry or campaign, mode, access,
// password?, label?, expires? }
// makes one; { action: 'revoke', id } turns one off. The links' address is this copy's (the request's).
import type { APIRoute } from 'astro';
import { PAGELESS_TYPES } from '../../../lib/site';
import { siteDb } from '../../../lib/db/site';
import { createShare, revokeShare, sharePath, sharesOf, subjectOf, type ShareSubject } from '../../../lib/share/links';

// The address of the copy answering: links are this copy's own (share_links isn't synced), so SITE_URL,
// which may name another copy, would lead nowhere.
const origin = (url: URL) => url.origin;

/** What a request names: ?entry= or ?campaign= (a query), or { entry } or { campaign } (a body). */
function subjectFrom(v: { entry?: unknown; campaign?: unknown }): ShareSubject | null {
  const campaign = Number(v.campaign);
  if (Number.isInteger(campaign) && campaign > 0) return { kind: 'campaign', id: campaign };
  const entry = Number(v.entry);
  return Number.isInteger(entry) && entry > 0 ? { kind: 'entry', id: entry } : null;
}

/** Whether this editor can read what a link is for. */
async function readable(db: App.Locals['db'], s: ShareSubject): Promise<boolean> {
  return !!(await db.from(s.kind === 'campaign' ? 'campaigns' : 'entries').select('id').eq('id', s.id).maybeSingle()).data;
}

/** Why a link can't be made for it, or null: an entry with a page, not in the trash; a newsletter draft. */
async function notShareable(db: App.Locals['db'], s: ShareSubject): Promise<string | null> {
  if (s.kind === 'campaign') {
    const { data } = await db.from('campaigns').select('status').eq('id', s.id).maybeSingle();
    if (!data) return 'Not found';
    return data.status === 'draft' ? null : 'Only newsletter drafts can be shared.';
  }
  const { data } = await db.from('entries').select('type, status').eq('id', s.id).maybeSingle();
  if (!data) return 'Not found';
  if (PAGELESS_TYPES.has(data.type)) return 'Only pages can be shared.';
  if (data.status === 'trash') return 'Restore it from the trash first.';
  return null;
}

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const GET: APIRoute = async ({ url, locals }) => {
  const subject = subjectFrom({ entry: url.searchParams.get('entry'), campaign: url.searchParams.get('campaign') });
  if (!subject) return new Response('Which page or newsletter?', { status: 400 });
  if (!(await readable(locals.db, subject))) return new Response('Not found', { status: 404 });
  const links = await sharesOf(subject);
  const ids = [...new Set(links.map((l) => l.created_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await siteDb().from('profiles').select('id, display_name').in('id', ids) : { data: [] };
  const names = new Map((people ?? []).map((p: any) => [p.id, p.display_name ?? '']));
  return Response.json(
    links.map(({ token, ...l }) => ({ ...l, url: origin(url) + sharePath(token), created_by_name: l.created_by ? (names.get(l.created_by) ?? '') : '' })),
    { headers: NO_STORE },
  );
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === 'create') {
      const subject = subjectFrom(body);
      if (!subject) return new Response('Which page or newsletter?', { status: 400 });
      const why = await notShareable(locals.db, subject);
      if (why) return new Response(why, { status: why === 'Not found' ? 404 : 400 });
      const link = await createShare({ [subject.kind]: subject.id, mode: body.mode, access: body.access, password: String(body.password ?? ''), label: body.label, expires: body.expires || null }, locals.user.id);
      return Response.json({ id: link.id, url: origin(url) + sharePath(link.token) }, { headers: NO_STORE });
    }
    if (body.action === 'revoke') {
      const id = Number(body.id);
      const { data: link } = await siteDb().from('share_links').select('entry_id, campaign_id').eq('id', id).maybeSingle();
      // Only a link of something this editor can read.
      if (!link || !(await readable(locals.db, subjectOf(link)))) return new Response('Not found', { status: 404 });
      await revokeShare(id);
      return Response.json({ ok: true }, { headers: NO_STORE });
    }
  } catch (e: any) {
    return new Response(e.message ?? String(e), { status: 400 });
  }
  return new Response('Unknown action', { status: 400 });
};
