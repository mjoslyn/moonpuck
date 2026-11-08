// The buyer back from the payment provider: GET /api/shop/return?order=<token>[&cancel=1]. The payment is
// checked with the provider (the webhook may not have come yet), then the cart page shows the order
// (/cart/?order=<token>), or the cart again after Cancel.
import type { APIRoute } from 'astro';
import { returnFromShopCheckout } from '../../../lib/shop/orders';

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('order') ?? '';
  const next = token.length >= 24 ? await returnFromShopCheckout(token, url.searchParams.has('cancel'), url.origin) : null;
  if (!next) return new Response('Order not found', { status: 404 });
  return new Response(null, { status: 303, headers: { Location: new URL(next, url).toString(), 'Cache-Control': 'no-store' } });
};
