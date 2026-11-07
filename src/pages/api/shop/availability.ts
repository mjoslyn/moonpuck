// What's left of some products' variants, for the shop's script (public/assets/js/cart.js), since a
// cached page can be a minute old: GET /api/shop/availability?ids=<id>,<id>
//   -> { <product id>: { left: { <variant id>: n }, buyable } } (left: the most one order can take now,
//   what's left within the product's Most per order, a variant not sold left out; buyable: false for a
//   members-only product this visitor may not buy)
// As the visitor sees the site. Not found while the shop is off.
import type { APIRoute } from 'astro';
import { siteDb } from '../../../lib/db/site';
import { visibleTo } from '../../../lib/data';
import { siteViewer } from '../../../lib/members/viewer';
import { mayBuyProduct, maxQuantity, productOf, sellable, shopOn } from '../../../lib/shop/config';
import { leftOf, loadStock } from '../../../lib/shop/stock';

export const GET: APIRoute = async ({ url, request }) => {
  const db = siteDb();
  const { data: siteRow } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  if (!shopOn(siteRow?.value)) return new Response('Not found', { status: 404 });
  const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').map((s) => Math.floor(Number(s))).filter((n) => n > 0))].slice(0, 50);
  if (!ids.length) return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
  const who = await siteViewer(request);
  const { data } = await visibleTo(db.from('entries').select('id, fields').in('id', ids).eq('type', 'product'), { published: true, viewer: who });
  const stock = await loadStock(db, (data ?? []).map((e) => e.id));
  const out: Record<number, { left: Record<string, number>; buyable: boolean }> = {};
  for (const e of data ?? []) {
    const p = productOf(e.fields);
    if (p) out[e.id] = { left: Object.fromEntries(sellable(p).map((v) => [v.id, maxQuantity(p, leftOf(p, stock.get(e.id), v.id))])), buyable: mayBuyProduct(p, who?.member) };
  }
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
};
