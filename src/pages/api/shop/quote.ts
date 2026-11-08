// The cart priced now, for the cart's script (public/assets/js/cart.js): POST { lines: [{ product,
// variant, quantity }], destination?: { country, state }, option?, code? } -> { lines, count, subtotal,
// currency, shipping, chosen, totals, discount, discountProblem? } (src/lib/shop/cart.ts, src/lib/shop/totals.ts). As the visitor sees the
// site: members-only products for their members, members' prices. Not found while the shop is off.
import type { APIRoute } from 'astro';
import { siteDb } from '../../../lib/db/site';
import { siteViewer } from '../../../lib/members/viewer';
import { featuresOf, offTypes } from '../../../lib/features';
import { shopOn, shopSettings } from '../../../lib/shop/config';
import { shippingSources } from '../../../lib/shop/carrier';
import { clientIp } from '../../../lib/mailing/request';
import { buyerAddress } from '../../../lib/tickets/orders';
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
  // The rest of the address, once typed: a carrier's live rates need its ZIP code.
  const part = (k: string, max: number) => String(body?.destination?.[k] ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
  const destination = country && country !== '*' ? { country, state: country === 'US' && cleanPlace(`US-${state}`) ? state : (country === 'US' ? undefined : part('state', 60)), zip: part('zip', 20), city: part('city', 80), line1: part('line1', 120), line2: part('line2', 120) } : null;
  const option = typeof body?.option === 'string' ? body.option.slice(0, 120) : null;
  const settings = checkoutSettings(siteRow?.value?.shop);
  // The code typed, else the automatic discounts this visitor may take.
  const found = await discountCandidates(db, { code: typeof body?.code === 'string' ? body.code : null, member: viewer?.member });
  const totals = await cartTotals(quote, { ...settings, tax: taxInForce(settings.tax, pickProvider(settings.provider)) }, { destination, option, discounts: found.discounts, code: found.code, codeProblem: found.problem, sources: shippingSources(settings, shopSettings(siteRow?.value).weightUnit, quote.currency, buyerAddress(clientIp(request))) });
  return Response.json({ ...quote, ...totals }, { headers: { 'Cache-Control': 'private, no-store' } });
};
