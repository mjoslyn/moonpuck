// Shop > Discounts' saves: POST { action: 'save', id?, discount } (cleaned by cleanDiscount; a code
// another discount has is refused) or { action: 'delete', id } (orders that took it keep its code).
// Editors. Discounts don't clear the page cache (they show only in the cart, priced live).
import type { APIRoute } from 'astro';
import { cleanDiscount } from '../../../../lib/shop/discounts';

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  const db = locals.db;
  if (body.action === 'delete') {
    const { error } = await db.from('shop_discounts').delete().eq('id', id);
    return error ? new Response(error.message, { status: 400 }) : Response.json({ ok: true });
  }
  if (body.action !== 'save') return new Response('Unknown action', { status: 400 });
  const d = cleanDiscount(body.discount);
  if (typeof d === 'string') return new Response(d, { status: 400 });
  if (d.code) {
    const { data: taken } = await db.from('shop_discounts').select('id').ilike('code', d.code).neq('id', id).maybeSingle();
    if (taken) return new Response(`Another discount has the code ${d.code}.`, { status: 409 });
  }
  const { data, error } = id ? await db.from('shop_discounts').update(d).eq('id', id).select('id').single() : await db.from('shop_discounts').insert(d).select('id').single();
  if (error) return new Response(error.message, { status: 400 });
  return Response.json({ ok: true, id: data.id });
};
