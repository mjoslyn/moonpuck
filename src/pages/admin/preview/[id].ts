// Preview a page as it will look, for signed-in editors (the /admin middleware applies), and for guests
// with a share link to the page (src/lib/share), who see it as visitors would.
// GET: the saved version (unpublished changes of a live page included); ?revision=<id>: that revision.
// POST (form field `payload`: { content, entry, template? }): the editor's current, unsaved state.
import type { APIRoute } from 'astro';
import { SITE_TZ } from '../../../lib/site';
import { renderPreview, type PreviewOptions } from '../../../lib/admin/preview';
import { guestContent, guestEntry } from '../../../lib/share/guest-content';
import type { PuckItem } from '../../../lib/puck/types';

/** A guest's preview (a share link) shows the page as visitors would, without the editor's extras. */
const optionsFor = (locals: App.Locals): PreviewOptions => (locals.user.role === 'guest' ? { guest: true, editLink: locals.share?.mode === 'edit' } : {});
export const GET: APIRoute = async ({ params, locals, url }) => {
  const revisionId = Number(url.searchParams.get('revision')) || 0;
  if (!revisionId) return renderPreview(locals.db, Number(params.id), url.origin, undefined, undefined, optionsFor(locals));
  const { data: rev } = await locals.db.from('revisions').select('entry_id, title, content, fields, entry, template, created_at, saved_at').eq('id', revisionId).single();
  if (!rev || rev.entry_id !== Number(params.id)) return new Response('Revision not found', { status: 404 });
  const entry = rev.entry ?? { title: rev.title, fields: rev.fields };
  // A version saved in layout mode shows its template as it was then.
  const template = Array.isArray(rev.template?.content?.content) ? (rev.template.content.content as PuckItem[]) : undefined;
  return renderPreview(locals.db, Number(params.id), url.origin, { content: rev.content, entry, template }, `the version saved ${new Date(rev.saved_at ?? rev.created_at).toLocaleString('en-US', { timeZone: SITE_TZ, dateStyle: 'medium', timeStyle: 'short' })}`, optionsFor(locals));
};

export const POST: APIRoute = async ({ params, locals, request, url }) => {
  const form = await request.formData();
  let payload: any = {};
  try {
    payload = JSON.parse(String(form.get('payload') ?? '{}'));
  } catch {
    return new Response('Bad preview data', { status: 400 });
  }
  if (locals.user.role === 'guest') {
    // A guest's unsaved state passes the same checks as their save (no raw markup), and never a layout of their own.
    const id = Number(params.id);
    const [{ data: current }, { data: kept }] = await Promise.all([
      locals.db.from('entries').select('slug, title, excerpt, content, fields').eq('id', id).maybeSingle(),
      locals.db.from('entry_drafts').select('draft').eq('entry_id', id).maybeSingle(),
    ]);
    if (!current) return new Response('Not found', { status: 404 });
    const checked = guestContent(payload.content, kept?.draft?.content ?? current.content);
    if (!checked.ok) return new Response(checked.error, { status: 400 });
    return renderPreview(locals.db, id, url.origin, { content: checked.content, entry: guestEntry(payload.entry, kept?.draft?.entry ?? null, current) }, undefined, optionsFor(locals));
  }
  return renderPreview(locals.db, Number(params.id), url.origin, { content: payload.content, entry: payload.entry, template: Array.isArray(payload.template) ? payload.template : undefined });
};

