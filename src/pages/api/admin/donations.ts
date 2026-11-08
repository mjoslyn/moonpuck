// The Donations screen's actions: POST { action, id | plan, ... }
//   resend                 send a paid gift's receipt again
//   refund { amount }      refund (part of) a gift at Stripe or Square (admins), emailing the donor
//   cancel-plan            end a monthly gift at Stripe (admins), emailing the donor
//   refresh-plan           read a monthly gift's status again from Stripe
// Its writes don't clear the page cache (a goal's total refreshes within the minute).
import type { APIRoute } from 'astro';
import { serviceClient } from '../../../lib/db/site';
import { cancelPlan, refreshPlan, refundDonation, resendReceipt, type DonationPlan } from '../../../lib/donations/donations';

export const POST: APIRoute = async ({ request, locals, url }) => {
  const body = await request.json().catch(() => ({}));
  const db = serviceClient();
  const admin = locals.user?.role === 'admin';
  const plan = async () => {
    const { data } = await db.from('donation_plans').select('*').eq('id', Number(body.plan) || 0).maybeSingle<DonationPlan>();
    if (!data) throw new Error('No such monthly gift.');
    return data;
  };
  try {
    switch (body.action) {
      case 'resend':
        await resendReceipt(db, Number(body.id) || 0, url.origin);
        return Response.json({ ok: true });
      case 'refund':
        // Money goes back: admins only.
        if (!admin) return new Response('Only admins can refund gifts.', { status: 403 });
        return Response.json({ ok: true, ...(await refundDonation(db, Number(body.id) || 0, Math.round(Number(body.amount) || 0), url.origin)) });
      case 'cancel-plan':
        if (!admin) return new Response('Only admins can cancel monthly gifts.', { status: 403 });
        await cancelPlan(db, await plan(), url.origin);
        return Response.json({ ok: true });
      case 'refresh-plan':
        return Response.json({ ok: true, status: await refreshPlan(db, await plan(), url.origin) });
    }
    return new Response('Unknown action', { status: 400 });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
};
