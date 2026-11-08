// Whether Stripe Tax is ready to work out tax (Settings > Shop warns while it isn't, since checkouts
// asking for it are refused): { ready, missing } or { error }. Editors.
import type { APIRoute } from 'astro';
import { stripeTaxReadiness } from '../../../../lib/payments/stripe';

export const GET: APIRoute = async () => {
  try {
    return Response.json(await stripeTaxReadiness(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { headers: { 'Cache-Control': 'no-store' } });
  }
};
