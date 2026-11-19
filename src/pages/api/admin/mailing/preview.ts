// The email builder's previews for mailing emails. POST { query, since? }: an Entries block's entries as
// they are now (the canvas). POST { design, text, subject, since? }: the whole email as it would be sent
// to a sample subscriber (the Preview tab), rendered by the code that sends it. Read-only.
import type { APIRoute } from 'astro';
import { emailEntries } from '../../../../lib/mailing/entries';
import { mailOrigin } from '../../../../lib/mailing/contacts';
import { previewCampaign } from '../../../../lib/mailing/preview';

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const db = locals.db;
  const origin = mailOrigin(new URL(request.url).origin);
  const since = typeof body.since === 'string' ? body.since : new Date(Date.now() - 7 * 86_400_000).toISOString();
  try {
    if (body.query) {
      const out = await emailEntries(db, { root: { props: {} }, content: [{ type: 'Entries', props: { id: 'q', query: body.query } }] }, origin, since);
      return Response.json(out.q ?? []);
    }
    return Response.json(await previewCampaign(db, { id: Number(body.id) || 0, design: body.design, text: String(body.text ?? ''), subject: String(body.subject ?? ''), since }, origin));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
};
