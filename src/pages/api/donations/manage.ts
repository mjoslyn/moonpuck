// A monthly donor's own page (the Donate block with ?plan=<token>, linked from their receipts): POST
// plan=<token>&action=cancel stops the gift at Stripe; action=card opens Stripe's customer portal to update
// the card. Back to the page with ?plan_msg= to say how it went.
import type { APIRoute } from 'astro';
import { serviceClient } from '../../../lib/db/site';
import { cancelPlan, manageLink, planByToken, planCardUrl } from '../../../lib/donations/donations';
import { siteOrigin } from '../../../lib/tickets/orders';

export const POST: APIRoute = async ({ request, url }) => {
  const form = await request.formData().catch(() => null);
  const db = serviceClient();
  const plan = await planByToken(db, String(form?.get('plan') ?? ''));
  if (!plan) return new Response('Not found', { status: 404 });
  const origin = siteOrigin(url.origin);
  const back = (msg: string) => new Response(null, { status: 303, headers: { Location: manageLink(origin, plan).replace('#donate', `&plan_msg=${msg}#donate`), 'Cache-Control': 'no-store' } });
  const action = String(form?.get('action') ?? '');
  try {
    if (action === 'cancel') {
      await cancelPlan(db, plan, origin);
      return back('cancelled');
    }
    if (action === 'card') {
      const to = await planCardUrl(plan, manageLink(origin, plan), origin).catch((e) => (console.warn(`donations: card portal for plan ${plan.id}: ${(e as Error).message}`), null));
      return to ? new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } }) : back('no-card');
    }
  } catch (e) {
    console.error(`donations: ${action} for plan ${plan.id}: ${(e as Error).message}`);
    return back('error');
  }
  return new Response('Bad request', { status: 400 });
};
