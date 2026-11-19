// A newsletter draft's save through a share link that edits (src/lib/share): PUT { subject, design, text,
// base }. Only while the campaign is a draft; its lists, audience, sender and everything else stay as they
// are; the design passes guestEmail; saved as the server, with a version in its history noting the link.
import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/db/site';
import { guestEmail } from '../../../../lib/share/guest-content';
import { recordCampaignRevision } from '../../../../lib/mailing/revisions';
import { isStale, STALE } from '../../../../lib/admin/save';

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const id = Number(params.id);
  if (locals.user.role !== 'guest' || locals.share?.campaign_id !== id) return new Response('Forbidden', { status: 403 });
  const body = await request.json().catch(() => ({}));
  const db = serviceClient();
  const { data: c } = await db.from('campaigns').select('id, name, status, design, updated_at').eq('id', id).maybeSingle();
  if (!c || c.status !== 'draft') return new Response('This newsletter can’t be changed now.', { status: 409 });
  if (isStale(body.base, c.updated_at)) return new Response(STALE, { status: 409 });
  const checked = guestEmail(body.design, c.design);
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  const patch = { subject: text(body.subject, 300), design: checked.content, text: text(body.text, 100_000) };
  // Only while it is still a draft, in the statement that writes.
  const { data, error } = await db.from('campaigns').update(patch).eq('id', id).eq('status', 'draft').select('updated_at').maybeSingle();
  if (error) return new Response(error.message, { status: 400 });
  if (!data) return new Response('This newsletter can’t be changed now.', { status: 409 });
  const label = locals.share?.label ?? '';
  const { error: revErr } = await recordCampaignRevision(db, id, { name: c.name, ...patch }, { author: null, note: `Saved through a share link${label ? ` (${label.slice(0, 120)})` : ''}` });
  if (revErr) console.error(`campaign ${id}: version not kept: ${revErr.message}`);
  return Response.json({ ok: true, updated_at: data.updated_at });
};
