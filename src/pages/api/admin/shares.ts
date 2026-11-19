// An entry's share links (src/lib/share/links.ts), for editors: the editor's Share dialog.
// GET ?entry=<id>: its links. POST { action: 'create', entry, mode, access, password?, label?, expires? }
// makes one; { action: 'revoke', id } turns one off. The links' address uses SITE_URL, else the request's.
import type { APIRoute } from 'astro';
import { PAGELESS_TYPES } from '../../../lib/site';
import { siteDb } from '../../../lib/db/site';
import { env } from '../../../lib/env';
import { createShare, revokeShare, sharePath, sharesOf } from '../../../lib/share/links';

const origin = (url: URL) => {
  try {
    return new URL(env('SITE_URL') ?? url.origin).origin;
  } catch {
    return url.origin;
  }
};

/** The entry a link may be made for: one with a page, not in the trash, that this editor can read. */
async function shareable(db: App.Locals['db'], id: number): Promise<string | null> {
  const { data } = await db.from('entries').select('type, status').eq('id', id).maybeSingle();
  if (!data) return 'Not found';
  if (PAGELESS_TYPES.has(data.type)) return 'Only pages can be shared.';
  if (data.status === 'trash') return 'Restore it from the trash first.';
  return null;
}

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const GET: APIRoute = async ({ url, locals }) => {
  const entry = Number(url.searchParams.get('entry'));
  if (!entry) return new Response('Which entry?', { status: 400 });
  if (!(await locals.db.from('entries').select('id').eq('id', entry).maybeSingle()).data) return new Response('Not found', { status: 404 });
  const links = await sharesOf(entry);
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
      const entry = Number(body.entry);
      const why = await shareable(locals.db, entry);
      if (why) return new Response(why, { status: why === 'Not found' ? 404 : 400 });
      const link = await createShare({ entry, mode: body.mode, access: body.access, password: String(body.password ?? ''), label: body.label, expires: body.expires || null }, locals.user.id);
      return Response.json({ id: link.id, url: origin(url) + sharePath(link.token) }, { headers: NO_STORE });
    }
    if (body.action === 'revoke') {
      const id = Number(body.id);
      const { data: link } = await siteDb().from('share_links').select('entry_id').eq('id', id).maybeSingle();
      // Only a link of an entry this editor can read.
      if (!link || !(await locals.db.from('entries').select('id').eq('id', link.entry_id).maybeSingle()).data) return new Response('Not found', { status: 404 });
      await revokeShare(id);
      return Response.json({ ok: true }, { headers: NO_STORE });
    }
  } catch (e: any) {
    return new Response(e.message ?? String(e), { status: 400 });
  }
  return new Response('Unknown action', { status: 400 });
};
