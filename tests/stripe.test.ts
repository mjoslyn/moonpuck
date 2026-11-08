// Stripe's answers as its API gives them (shapes from a test account on API version 2015-07-13, the
// account default the site's calls and webhooks use).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provider, taxReadiness } from '../src/lib/payments/stripe';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Stripe Tax readiness', () => {
  it('is not ready while Stripe Tax is pending, naming what it lacks', () => {
    const pending = { object: 'tax.settings', defaults: { provider: 'stripe', tax_behavior: null, tax_code: null }, livemode: false, status: 'pending', status_details: { pending: { missing_fields: ['head_office'] } } };
    expect(taxReadiness(pending)).toEqual({ ready: false, missing: ['head_office'] });
  });
  it('is ready once active', () => {
    expect(taxReadiness({ object: 'tax.settings', status: 'active', status_details: { active: {} } })).toEqual({ ready: true, missing: [] });
  });
});

describe('Stripe answers and events', () => {
  const stub = (answers: Record<string, unknown>) => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    vi.stubGlobal('fetch', async (url: string) => {
      const key = Object.keys(answers).find((k) => url.includes(k));
      return new Response(JSON.stringify(key ? answers[key] : {}), { status: key ? 200 : 404 });
    });
  };

  it('reads a completed session as paid, with its payment, total, refunds and tax', async () => {
    stub({ '/checkout/sessions/cs_1': { object: 'checkout.session', id: 'cs_1', status: 'complete', payment_status: 'paid', amount_total: 3000, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 }, payment_intent: { id: 'pi_1', object: 'payment_intent', latest_charge: { id: 'ch_1', object: 'charge', amount_refunded: 1000 } } } });
    expect(await provider.check({ ref: 'cs_1' })).toEqual({ status: 'paid', paymentId: 'pi_1', amount: 3000, refunded: 1000, tax: 0 });
  });

  it('reads an expired session as cancelled', async () => {
    stub({ '/checkout/sessions/cs_2': { object: 'checkout.session', id: 'cs_2', status: 'expired', payment_status: 'unpaid', payment_intent: null } });
    expect(await provider.check({ ref: 'cs_2' })).toEqual({ status: 'cancelled' });
  });

  it('turns checkout and refund events into what the features read', async () => {
    stub({ '/payment_intents/pi_1': { object: 'payment_intent', id: 'pi_1', latest_charge: { object: 'charge', amount_refunded: 3000 } } });
    expect(await provider.parseEvent({ type: 'checkout.session.completed', data: { object: { object: 'checkout.session', id: 'cs_1', payment_intent: 'pi_1' } } })).toEqual({ kind: 'checkout', ref: 'cs_1', failed: false, expired: false });
    expect(await provider.parseEvent({ type: 'checkout.session.expired', data: { object: { object: 'checkout.session', id: 'cs_2', payment_intent: null } } })).toEqual({ kind: 'checkout', ref: 'cs_2', failed: false, expired: true });
    expect(await provider.parseEvent({ type: 'charge.refunded', data: { object: { object: 'charge', payment_intent: 'pi_1', amount_refunded: 3000 } } })).toEqual({ kind: 'refund', payment: 'pi_1', refunded: 3000 });
    // A refund's own events carry the payment intent on the refund.
    expect(await provider.parseEvent({ type: 'refund.updated', data: { object: { object: 'refund', payment_intent: 'pi_1', status: 'succeeded' } } })).toEqual({ kind: 'refund', payment: 'pi_1', refunded: 3000 });
    expect(await provider.parseEvent({ type: 'charge.refund.updated', data: { object: { object: 'refund', payment_intent: 'pi_1', status: 'succeeded' } } })).toEqual({ kind: 'refund', payment: 'pi_1', refunded: 3000 });
  });
});
