// The Orders screen's actions (/admin/shop/<id>/): POST { action, id, ... }
//   fulfil { kind: 'shipped' | 'picked_up' | '', tracking, carrier }   shipped emails the buyer, with the
//                                       tracking (followed through the carrier service for a known carrier)
//   label-rates                         the carrier service's rates for the order's label
//   label-buy { rate }                  buy a label at one of them: marks it shipped, emails the buyer
//   track                               read the parcel's tracking again
//   notes { notes }                     the shop's own notes
//   resend                              send a paid order's confirmation again
//   cancel { restock }                  cancel an unpaid order (its hold goes), or a free or fully
//                                       refunded one, its lines back in stock as `restock` says
//                                       ({ <line index>: quantity }); an unpaid one paid at its provider
//                                       after all is marked paid instead: { message }
//   refund { amount, restock }          refund (part of) a paid order at Stripe or Square (admins), and
//                                       put lines back in stock
//   restock { restock }                 put lines back in stock
// The order's writes don't clear the page cache (what's left is asked live).
import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/db/site';
import { cancelShopOrder, fulfilOrder, refundShopOrder, resendShopConfirmation, restockOrder, saveNotes, type Restock, type ShopOrder } from '../../../../lib/shop/orders';
import { buyLabel, labelRates, refreshTracking } from '../../../../lib/shop/fulfilment';

const restockOf = (v: unknown): Restock =>
  Object.fromEntries(Object.entries(v && typeof v === 'object' ? (v as Record<string, unknown>) : {}).map(([k, n]) => [k, Math.max(0, Math.trunc(Number(n)) || 0)]).filter(([, n]) => (n as number) > 0));

export const POST: APIRoute = async ({ request, locals, url }) => {
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  const db = serviceClient();
  try {
    switch (body.action) {
      case 'fulfil': {
        const kind = body.kind === 'shipped' || body.kind === 'picked_up' ? body.kind : '';
        await fulfilOrder(db, id, kind, String(body.tracking ?? ''), url.origin, String(body.carrier ?? ''));
        return Response.json({ ok: true });
      }
      case 'label-rates':
        return Response.json({ ok: true, ...(await labelRates(db, id)) });
      case 'label-buy': {
        const r = body.rate ?? {};
        const o = await buyLabel(db, id, { rateId: String(r.rateId ?? ''), carrier: String(r.carrier ?? ''), carrierName: String(r.carrierName ?? ''), service: String(r.service ?? ''), serviceName: String(r.serviceName ?? ''), amount: Number(r.amount) || 0, currency: String(r.currency ?? '') }, url.origin);
        return Response.json({ ok: true, label: o.label, tracking: o.tracking });
      }
      case 'track': {
        const { data: o } = await db.from('shop_orders').select('*').eq('id', id).maybeSingle();
        const t = o ? await refreshTracking(db, o as ShopOrder, url.origin) : null;
        return t ? Response.json({ ok: true, status: t }) : new Response('This order has no carrier tracking to read (connect Shippo, and mark it shipped with a carrier and number).', { status: 400 });
      }
      case 'notes':
        await saveNotes(db, id, String(body.notes ?? ''));
        return Response.json({ ok: true });
      case 'resend':
        await resendShopConfirmation(db, id, url.origin);
        return Response.json({ ok: true });
      case 'cancel': {
        const r = await cancelShopOrder(db, id, restockOf(body.restock), url.origin);
        if (r.paid) return Response.json({ ok: true, message: 'This order was paid after all, so it is marked paid and was not cancelled. Refund it to cancel it.' });
        return Response.json({ ok: true, restocked: r.restocked });
      }
      case 'refund': {
        // Money goes back: admins only.
        if (locals.user?.role !== 'admin') return new Response('Only admins can refund orders.', { status: 403 });
        return Response.json({ ok: true, ...(await refundShopOrder(db, id, Math.round(Number(body.amount) || 0), restockOf(body.restock), url.origin)) });
      }
      case 'restock':
        return Response.json({ ok: true, restocked: await restockOrder(db, id, restockOf(body.restock)) });
    }
    return new Response('Unknown action', { status: 400 });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
};
