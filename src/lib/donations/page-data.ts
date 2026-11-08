// The Donate block's donor views (server only; registered with the page renderer's hooks when the
// middleware loads this module): the gift a donor just made (?donation=<token>, its thank-you) and a
// monthly gift to change or cancel (?plan=<token>; src/render/c/donations.ts). Such pages are never cached.
import { renderHooks } from '../../render/hooks';
import { DONATION_KEY, PLAN_KEY } from '../../render/c/donations';
import { serviceClient } from '../db/site';
import { donationByToken, planByToken } from './donations';

renderHooks.donation = async (ctx) => {
  const q = ctx.queried.url.searchParams;
  ctx.personal = true;
  if (q.has('donation') && !ctx.data.has(DONATION_KEY)) {
    const d = await donationByToken(serviceClient(), q.get('donation') ?? '');
    if (d) ctx.data.set(DONATION_KEY, d);
  }
  if (q.has('plan') && !ctx.data.has(PLAN_KEY)) {
    const p = await planByToken(serviceClient(), q.get('plan') ?? '');
    if (p) ctx.data.set(PLAN_KEY, p);
  }
};
