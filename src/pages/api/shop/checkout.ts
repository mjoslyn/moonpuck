// The cart's checkout (public/assets/js/cart.js): POST JSON { lines, name, email, phone, option, address }
// -> { redirect } (the provider's checkout, or the order's page when there is nothing to pay) or
// { error, message } (src/lib/shop/orders.ts startShopCheckout). As the visitor sees the site: a signed-in
// member pays their price and may buy members-only products. Not found while the shop is off.
import type { APIRoute } from 'astro';
import { siteViewer } from '../../../lib/members/viewer';
import { clientIp } from '../../../lib/mailing/request';
import { startShopCheckout } from '../../../lib/shop/orders';

export const POST: APIRoute = async ({ request, url }) => {
  if (!/application\/json/i.test(request.headers.get('content-type') ?? '')) return new Response('Not found', { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'invalid', message: 'Check your details.' }, { status: 400 });
  const result = await startShopCheckout(body, url.origin, await siteViewer(request), clientIp(request));
  if ('error' in result && result.error === 'closed') return new Response('Not found', { status: 404 });
  return Response.json(result, { status: 'error' in result ? 409 : 200, headers: { 'Cache-Control': 'no-store' } });
};
