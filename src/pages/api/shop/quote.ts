// The cart priced now, for the cart's script (public/assets/js/cart.js): POST { lines: [{ product,
// variant, quantity }], destination?: { country, state }, option?, code? } -> { lines, count, subtotal,
// currency, shipping, chosen, totals, discount, discountProblem? } (src/lib/shop/cart.ts, src/lib/shop/totals.ts). As the visitor sees the
// site: members-only products for their members, members' prices. Not found while the shop is off.
import type { APIRoute } from 'astro';
import { siteDb } from '../../../lib/db/site';
import { siteViewer } from '../../../lib/members/viewer';
import { featuresOf, offTypes } from '../../../lib/features';
import { shopOn } from '../../../lib/shop/config';
import { quoteCart } from '../../../lib/shop/cart';
import { checkoutSettings, taxInForce } from '../../../lib/shop/checkout-settings';
import { pickProvider } from '../../../lib/payments';
import { cleanPlace } from '../../../lib/shop/places';
import { cartTotals } from '../../../lib/shop/totals';
import { discountCandidates } from '../../../lib/shop/discount-lookup';

export const POST: APIRoute = async ({ request }) => {
  const db = siteDb();
  const { data: siteRow } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  if (!shopOn(siteRow?.value)) return new Response('Not found', { status: 404 });
  const body = await request.json().catch(() => ({}));
  const viewer = await siteViewer(request);
  const quote = await quoteCart(db, body?.lines, { published: true, viewer, off: offTypes(featuresOf(siteRow?.value)) }, siteRow?.value);
  const raw = String(body?.destination?.country ?? '');
  const country = /^[A-Za-z]{2}$/.test(raw) ? cleanPlace(raw) : null;
  const state = String(body?.destination?.state ?? '').toUpperCase();
  const destination = country && country !== '*' ? { country, state: country === 'US' && cleanPlace(`US-${state}`) ? state : undefined } : null;
  const option = typeof body?.option === 'string' ? body.option.slice(0, 120) : null;
  const settings = checkoutSettings(siteRow?.value?.shop);
  // The code typed, else the automatic discounts this visitor may take.
  const found = await discountCandidates(db, { code: typeof body?.code === 'string' ? body.code : null, member: viewer?.member });
  const totals = await cartTotals(quote, { ...settings, tax: taxInForce(settings.tax, pickProvider(settings.provider)) }, { destination, option, discounts: found.discounts, code: found.code, codeProblem: found.problem });
  return Response.json({ ...quote, ...totals }, { headers: { 'Cache-Control': 'private, no-store' } });
};
