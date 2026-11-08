// The Orders screen's actions (/admin/shop/<id>/): POST { action, id, ... }
//   fulfil { kind: 'shipped' | 'picked_up' | '', tracking }   shipped emails the buyer, with the tracking
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
import { cancelShopOrder, fulfilOrder, refundShopOrder, resendShopConfirmation, restockOrder, saveNotes, type Restock } from '../../../../lib/shop/orders';

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
        await fulfilOrder(db, id, kind, String(body.tracking ?? ''), url.origin);
        return Response.json({ ok: true });
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
        return Response.json({ ok: true, ...(await refundShopOrder(db, id, Math.round(Number(body.amount) || 0), restockOf(body.restock))) });
      }
      case 'restock':
        return Response.json({ ok: true, restocked: await restockOrder(db, id, restockOf(body.restock)) });
    }
    return new Response('Unknown action', { status: 400 });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
};
