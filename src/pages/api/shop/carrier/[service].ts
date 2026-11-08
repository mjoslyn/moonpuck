// A carrier service's tracking updates (src/lib/shop/fulfilment.ts): POST /api/shop/carrier/shippo?token=
// <SHIPPO_WEBHOOK_TOKEN>. Only the tracking number is taken from the body; each order with that number has
// its tracking read again from the carrier service. Works while the shop is off, for orders already sent.
import type { APIRoute } from 'astro';
import { trackingWebhook } from '../../../../lib/shop/fulfilment';

export const POST: APIRoute = async ({ params, request, url }) => {
  if (params.service !== 'shippo') return new Response('Not found', { status: 404 });
  const body = await request.json().catch(() => null);
  const n = await trackingWebhook(url.searchParams.get('token') ?? '', body, url.origin);
  return n < 0 ? new Response('Not found', { status: 404 }) : Response.json({ ok: true });
};
