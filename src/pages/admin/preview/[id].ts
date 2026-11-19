// Preview a page as it will look, for signed-in editors (the /admin middleware applies), and for guests
// with a share link that views the page (src/lib/share), who see it as visitors would (GET only). Both can
// comment on its blocks (src/lib/share/comments.ts).
// GET: the saved version (unpublished changes of a live page included); ?revision=<id>: that revision.
// POST (form field `payload`: { content, entry, template? }): the editor's current, unsaved state.
import type { APIRoute } from 'astro';
import { SITE_TZ } from '../../../lib/site';
import { renderPreview, type PreviewOptions } from '../../../lib/admin/preview';
import type { PuckItem } from '../../../lib/puck/types';

/** A guest's preview (a share link) shows the page as visitors would, without the editor's extras. */
const optionsFor = (locals: App.Locals): PreviewOptions => (locals.user.role === 'guest' ? { guest: true, label: locals.share?.label ?? '' } : {});
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: SITE_TZ, dateStyle: 'medium', timeStyle: 'short' });

/** A guest's preview of the version their link shows: the latest saved, the live page, or a saved version. */
function guestPreview(locals: App.Locals, id: number, origin: string): Promise<Response> {
  const link = locals.share!;
  const label = link.label ? ` (${link.label})` : '';
  if (link.version === 'live') return renderPreview(locals.db, id, origin, undefined, undefined, { guest: true, live: true, note: `Shared preview of the live page${label}: only people with this link can see it` });
  const snap = link.version === 'revision' ? (link.snapshot as { content?: unknown; entry?: any; template?: PuckItem[] } | null) : null;
  if (snap && 'content' in snap)
    return renderPreview(locals.db, id, origin, { content: snap.content, entry: snap.entry ?? undefined, template: snap.template }, undefined, {
      guest: true,
      note: `Shared preview of the version saved ${link.version_at ? when(link.version_at) : 'earlier'}${label}: only people with this link can see it`,
    });
  return renderPreview(locals.db, id, origin, undefined, undefined, optionsFor(locals));
}

export const GET: APIRoute = async ({ params, locals, url }) => {
  if (locals.user.role === 'guest') return guestPreview(locals, Number(params.id), url.origin);
  const revisionId = Number(url.searchParams.get('revision')) || 0;
  if (!revisionId) return renderPreview(locals.db, Number(params.id), url.origin, undefined, undefined, optionsFor(locals));
  const { data: rev } = await locals.db.from('revisions').select('entry_id, title, content, fields, entry, template, created_at, saved_at').eq('id', revisionId).single();
  if (!rev || rev.entry_id !== Number(params.id)) return new Response('Revision not found', { status: 404 });
  const entry = rev.entry ?? { title: rev.title, fields: rev.fields };
  // A version saved in layout mode shows its template as it was then.
  const template = Array.isArray(rev.template?.content?.content) ? (rev.template.content.content as PuckItem[]) : undefined;
  return renderPreview(locals.db, Number(params.id), url.origin, { content: rev.content, entry, template }, `the version saved ${when(rev.saved_at ?? rev.created_at)}`, optionsFor(locals));
};

export const POST: APIRoute = async ({ params, locals, request, url }) => {
  const form = await request.formData();
  let payload: any = {};
  try {
    payload = JSON.parse(String(form.get('payload') ?? '{}'));
  } catch {
    return new Response('Bad preview data', { status: 400 });
  }
  return renderPreview(locals.db, Number(params.id), url.origin, { content: payload.content, entry: payload.entry, template: Array.isArray(payload.template) ? payload.template : undefined });
};

