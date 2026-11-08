// The donor back from the payment provider: GET /api/donations/return?d=<token>[&cancel=1]. The payment is
// checked with the provider (the webhook may not have come yet), then the page the gift was made on shows
// its thank-you (?donation=<token>), or the form again after Cancel.
import type { APIRoute } from 'astro';
import { returnFromDonation } from '../../../lib/donations/donations';

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('d') ?? '';
  const next = token.length >= 24 ? await returnFromDonation(token, url.searchParams.has('cancel'), url.origin) : null;
  if (!next) return new Response('Gift not found', { status: 404 });
  return new Response(null, { status: 303, headers: { Location: new URL(next, url).toString(), 'Cache-Control': 'no-store' } });
};
