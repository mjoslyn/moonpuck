// The Donate block's form (src/render/c/donations.ts): POST (form fields) -> 303 to the payment provider's
// checkout, or back to the page with ?donate_error=<code> (the block says what it means) (src/lib/donations/donations.ts startDonation).
// Not found while donations are off.
import type { APIRoute } from 'astro';
import { clientIp } from '../../../lib/mailing/request';
import { startDonation } from '../../../lib/donations/donations';
import { DONATE_PATH } from '../../../lib/donations/config';

export const POST: APIRoute = async ({ request, url }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return new Response('Bad request', { status: 400 });
  const body = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  const result = await startDonation(body, url.origin, clientIp(request));
  if ('error' in result && result.error === 'closed') return new Response('Not found', { status: 404 });
  const page = /^\/[\w\-/.%]*$/.test(body.page ?? '') && !String(body.page).startsWith('//') ? body.page : DONATE_PATH;
  const to = 'redirect' in result ? result.redirect : `${page}?donate_error=${result.error}#donate`;
  return new Response(null, { status: 303, headers: { Location: new URL(to, url).toString(), 'Cache-Control': 'no-store' } });
};
