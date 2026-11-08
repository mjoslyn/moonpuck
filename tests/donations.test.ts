// Donations: the settings, covering the fees, a one-time gift from checkout to receipt (once), refunds,
// monthly gifts (the first payment, later months, a failed month, the end), expiry, goals' totals and the
// Donate block's views.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { PROVIDERS } from '../src/lib/payments';
import { coverFee, donationSettings, donationSettingsFrom } from '../src/lib/donations/config';
import { askedAmount, cancelPlan, donationsWebhook, expireDonations, goalTotals, markDonationPaid, refundDonation, returnFromDonation, startDonation, type Donation, type DonationPlan } from '../src/lib/donations/donations';
import { renderRequest } from '../src/render/page';
import '../src/lib/donations/page-data';

const sent: { to: string[]; subject: string; html: string }[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: { to: string[]; subject: string; html: string }) => (sent.push(m), true) }));

// A stand-in for Stripe's subscriptions: checkouts made here, paid when the test says.
const subs = vi.hoisted(() => ({ paid: new Set<string>(), made: 0, cancelled: [] as string[], invoices: {} as Record<string, { paymentId: string; amount: number; paid: boolean }> }));
vi.mock('../src/lib/payments/stripe', async (actual) => ({
  ...(await actual<object>()),
  createSubscriptionCheckout: async () => ({ ref: `cs_sub_${++subs.made}`, url: `https://pay.example/cs_sub_${subs.made}` }),
  checkSubscriptionCheckout: async (ref: string) => (subs.paid.has(ref) ? { status: 'paid', subscription: `sub_${ref}`, customer: `cus_${ref}`, invoice: `in_first_${ref}`, paymentId: `pi_first_${ref}`, amount: 0 } : { status: 'pending' }),
  invoicePayment: async (id: string) => ({ ...(subs.invoices[id] ?? { paymentId: undefined, amount: 0, paid: false }), reason: 'subscription_cycle' }),
  cancelSubscription: async (id: string) => (subs.cancelled.push(id), 'canceled'),
}));

// A stand-in for one-time checkouts.
const paid = new Set<string>();
let made = 0;
const created: any[] = [];
const refunds: number[] = [];
Object.assign(PROVIDERS.stripe, {
  configured: () => true,
  create: async (req: any) => (created.push(req), { ref: `cs_${++made}`, url: `https://pay.example/cs_${made}` }),
  check: async ({ ref }: { ref: string }) => (paid.has(ref) ? { status: 'paid', paymentId: `pi_${ref}`, amount: 0 } : { status: 'pending' }),
  close: async () => {},
  refund: async (_payment: string, amount: number) => (refunds.push(amount), { id: `re_${refunds.length}`, status: 'succeeded' }),
});

const db = siteDb();
const DONATIONS = { enabled: true, provider: 'stripe', feePercent: 3, feeFixed: 30, goals: [{ id: 'spring', name: 'Spring appeal', target: 100000, start: '2020-01-01' }], legalName: 'Example Town Trust', taxId: '12-3456789' };
const setSite = async (value: Record<string, unknown>) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), ...value } });
};
const latest = async () => (await db.from('donations').select('*').order('id', { ascending: false }).limit(1).single<Donation>()).data!;
const plan = async (id: number) => (await db.from('donation_plans').select('*').eq('id', id).single<DonationPlan>()).data!;
let n = 0;
const donor = (more: Record<string, unknown> = {}) => ({ amount: '5000', name: 'Ada Lovelace', email: `ada${++n}@example.org`, page: '/give/', ...more });

beforeEach(async () => {
  await setSite({ donations: DONATIONS });
  sent.length = 0;
});

describe('settings', () => {
  it('keeps only what differs from the defaults, and gives goals ids from their names', () => {
    expect(donationSettingsFrom({ enabled: true, amounts: [2500, 5000, 10000, 25000], monthly: true })).toEqual({ enabled: true });
    const saved = donationSettingsFrom({ goals: [{ name: 'New roof!', target: 500000 }, { name: 'New roof', target: 1 }, { name: '' }] }) as any;
    expect(saved.goals.map((g: any) => g.id)).toEqual(['new-roof', 'new-roof-2']);
    expect(donationSettings({ donations: { amounts: [10, 2500, 2500, 1000] } }).amounts).toEqual([1000, 2500]);
  });
  it('covers the fees so the whole gift arrives', () => {
    const fee = coverFee(5000, { feePercent: 2.9, feeFixed: 30 });
    expect(fee).toBe(181);
    // What the provider takes from the total leaves the gift.
    expect(Math.round(5000 + fee - (5000 + fee) * 0.029 - 30)).toBeGreaterThanOrEqual(5000);
    expect(coverFee(5000, { feePercent: 0, feeFixed: 0 })).toBe(0);
  });
  it('reads a preset or a typed amount', () => {
    expect(askedAmount({ amount: '2500' })).toBe(2500);
    expect(askedAmount({ amount: 'other', other: '$1,000.50' })).toBe(100050);
    expect(askedAmount({ amount: 'other', other: '12.345' })).toBeNaN();
  });
});

describe('one-time gifts', () => {
  it('goes to checkout, is marked paid once, and sends the receipt and the copy once', async () => {
    const r = await startDonation(donor({ cover: 'on', goal: 'spring', dedication: 'In memory of Pat' }), 'http://localhost');
    expect(r).toEqual({ redirect: expect.stringMatching(/^https:\/\/pay\.example\//) });
    const d = await latest();
    expect(d).toMatchObject({ status: 'pending', kind: 'once', amount: 5000, fee: 186, total: 5186, goal: 'spring', dedication: 'In memory of Pat', page: '/give/' });
    expect(created.at(-1).items.map((i: any) => [i.name, i.unit])).toEqual([[expect.stringContaining('Gift'), 5000], ['Fees covered', 186]]);

    paid.add(d.provider_ref!);
    await donationsWebhook('stripe', { kind: 'checkout', ref: d.provider_ref! }, 'http://localhost');
    await markDonationPaid(db, d, { paymentId: 'again' });
    expect(await latest()).toMatchObject({ status: 'paid', provider_payment: `pi_${d.provider_ref}` });
    expect(sent.map((m) => m.to[0])).toEqual([d.email, expect.any(String)]);
    expect(sent[0].html).toContain('Example Town Trust');
    expect(sent[0].html).toContain('12-3456789');
    // The donor comes back to the page they gave on, with their thank-you.
    expect(await returnFromDonation(d.token, false)).toBe(`/give/?donation=${d.token}#donate`);
  });

  it('refuses gifts below the smallest, and monthly gifts while they are off', async () => {
    expect(await startDonation(donor({ amount: '100' }), 'http://localhost')).toMatchObject({ error: 'amount' });
    await setSite({ donations: { ...DONATIONS, monthly: false } });
    expect(await startDonation(donor({ frequency: 'monthly' }), 'http://localhost')).toMatchObject({ error: 'monthly-off' });
  });

  it('is not found while donations are off', async () => {
    await setSite({ donations: { ...DONATIONS, enabled: false } });
    expect(await startDonation(donor(), 'http://localhost')).toMatchObject({ error: 'closed' });
  });

  it('refunds at the provider, emails the donor, and counts the refund off the goal', async () => {
    await startDonation(donor({ goal: 'spring' }), 'http://localhost');
    const d = await latest();
    paid.add(d.provider_ref!);
    await returnFromDonation(d.token, false);
    const before = (await goalTotals(db, donationSettings({ donations: DONATIONS }).goals)).spring.raised;
    sent.length = 0;
    await refundDonation(db, d.id, 2000);
    expect(await latest()).toMatchObject({ status: 'paid', refunded_amount: 2000 });
    expect(sent[0].subject).toContain('refund');
    expect((await goalTotals(db, donationSettings({ donations: DONATIONS }).goals)).spring.raised).toBe(before - 2000);
    await refundDonation(db, d.id, 3000);
    expect((await latest()).status).toBe('refunded');
    await expect(refundDonation(db, d.id, 1)).rejects.toThrow();
  });

  it('cancels when the donor turns back, and expires checkouts left a day', async () => {
    await startDonation(donor(), 'http://localhost');
    const d = await latest();
    expect(await returnFromDonation(d.token, true)).toBe('/give/?donate=cancelled#donate');
    expect((await latest()).status).toBe('cancelled');
    await startDonation(donor(), 'http://localhost');
    const old = await latest();
    await db.from('donations').update({ created_at: new Date(Date.now() - 25 * 3600_000).toISOString() }).eq('id', old.id);
    expect(await expireDonations(db)).toBeGreaterThanOrEqual(1);
    expect((await latest()).status).toBe('expired');
  });
});

describe('monthly gifts', () => {
  it('starts the plan on the first payment, records later months once, and ends it', async () => {
    await startDonation(donor({ frequency: 'monthly', amount: '2500' }), 'http://localhost');
    const first = await latest();
    expect(first).toMatchObject({ kind: 'monthly', status: 'pending', total: 2500 });
    expect((await plan(first.plan_id!)).status).toBe('incomplete');

    subs.paid.add(first.provider_ref!);
    await donationsWebhook('stripe', { kind: 'checkout', ref: first.provider_ref! }, 'http://localhost');
    const p = await plan(first.plan_id!);
    expect(p).toMatchObject({ status: 'active', subscription: `sub_${first.provider_ref}`, customer: `cus_${first.provider_ref}` });
    expect(await latest()).toMatchObject({ status: 'paid', invoice: `in_first_${first.provider_ref}` });
    // The first month's receipt has the link to change or cancel it.
    expect(sent[0].html).toContain(`?plan=${p.token}`);

    // The first invoice's own event is the checkout's: nothing more.
    await donationsWebhook('stripe', { kind: 'invoice', invoice: `in_first_${first.provider_ref}`, subscription: p.subscription!, reason: 'subscription_create', failed: false }, 'http://localhost');
    expect((await db.from('donations').select('id').eq('plan_id', p.id)).data).toHaveLength(1);

    // A later month, delivered twice.
    subs.invoices.in_2 = { paymentId: 'pi_2', amount: 2500, paid: true };
    sent.length = 0;
    await donationsWebhook('stripe', { kind: 'invoice', invoice: 'in_2', subscription: p.subscription!, reason: 'subscription_cycle', failed: false }, 'http://localhost');
    await donationsWebhook('stripe', { kind: 'invoice', invoice: 'in_2', subscription: p.subscription!, reason: 'subscription_cycle', failed: false }, 'http://localhost');
    const months = (await db.from('donations').select('*').eq('plan_id', p.id).order('id')).data as Donation[];
    expect(months).toHaveLength(2);
    expect(months[1]).toMatchObject({ status: 'paid', kind: 'monthly', provider_payment: 'pi_2', amount: 2500 });
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining('monthly gift'), expect.stringContaining('New gift')]);

    // A failed month: behind, the donor told once.
    sent.length = 0;
    await donationsWebhook('stripe', { kind: 'invoice', invoice: 'in_3', subscription: p.subscription!, reason: 'subscription_cycle', failed: true }, 'http://localhost');
    await donationsWebhook('stripe', { kind: 'invoice', invoice: 'in_3', subscription: p.subscription!, reason: 'subscription_cycle', failed: true }, 'http://localhost');
    expect((await plan(p.id)).status).toBe('past_due');
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('didn’t go through');

    // Cancelled from the donor's page; Stripe's own event after it changes nothing.
    sent.length = 0;
    await cancelPlan(db, await plan(p.id), 'http://localhost');
    await donationsWebhook('stripe', { kind: 'subscription', subscription: p.subscription!, status: 'canceled' }, 'http://localhost');
    expect(subs.cancelled).toEqual([p.subscription]);
    expect((await plan(p.id)).status).toBe('cancelled');
    expect(sent).toHaveLength(1);
  });
});

describe('a monthly donor from another copy', () => {
  it('is left alone here: no gifts recorded, no emails, no changes at Stripe', async () => {
    const id = (await db.from('donation_plans').insert({ token: 'plan-elsewhere-xxxxxxxxxxxxxxx', status: 'active', subscription: 'sub_elsewhere', amount: 2500, total: 2500, name: 'E', email: 'e@example.org', home: 'https://other-copy.example' }).select('id').single()).data!.id as number;
    subs.invoices.in_else = { paymentId: 'pi_else', amount: 2500, paid: true };
    sent.length = 0;
    await donationsWebhook('stripe', { kind: 'invoice', invoice: 'in_else', subscription: 'sub_elsewhere', reason: 'subscription_cycle', failed: false }, 'http://localhost');
    await donationsWebhook('stripe', { kind: 'invoice', invoice: 'in_else_2', subscription: 'sub_elsewhere', reason: 'subscription_cycle', failed: true }, 'http://localhost');
    await donationsWebhook('stripe', { kind: 'subscription', subscription: 'sub_elsewhere', status: 'canceled' }, 'http://localhost');
    expect((await db.from('donations').select('id').eq('plan_id', id)).data).toEqual([]);
    expect(sent).toEqual([]);
    expect((await plan(id)).status).toBe('active');
    const before = subs.cancelled.length;
    await expect(cancelPlan(db, await plan(id), 'http://localhost')).rejects.toThrow(/started on https:\/\/other-copy\.example/);
    expect(subs.cancelled.length).toBe(before);
  });
});

describe('goals', () => {
  it('counts paid gifts within the goal’s dates, without the fees', async () => {
    const goals = [{ id: 'roof', name: 'Roof', target: 10000, start: '2026-01-01', end: '2026-12-31' }];
    const base = { kind: 'once', provider: 'stripe', currency: 'USD', name: 'X', goal: 'roof' };
    await db.from('donations').insert([
      { ...base, token: 'tok-roof-1-xxxxxxxxxxxxxxxxx', code: 'ROOF-0001', status: 'paid', amount: 3000, fee: 120, total: 3120, email: 'a@x.org', paid_at: '2026-03-01T12:00:00Z' },
      { ...base, token: 'tok-roof-2-xxxxxxxxxxxxxxxxx', code: 'ROOF-0002', status: 'paid', amount: 2000, fee: 0, total: 2000, email: 'A@x.org', paid_at: '2026-04-01T12:00:00Z' },
      { ...base, token: 'tok-roof-3-xxxxxxxxxxxxxxxxx', code: 'ROOF-0003', status: 'paid', amount: 9000, fee: 0, total: 9000, email: 'b@x.org', paid_at: '2025-12-01T12:00:00Z' },
      { ...base, token: 'tok-roof-4-xxxxxxxxxxxxxxxxx', code: 'ROOF-0004', status: 'pending', amount: 9000, fee: 0, total: 9000, email: 'c@x.org' },
    ]);
    expect((await goalTotals(db, goals)).roof).toEqual({ raised: 5000, donors: 1, gifts: 2 });
  });
});

describe('the Donate block', () => {
  beforeEach(async () => {
    // Pages render through a template with a Page content block.
    const { data } = await db.from('templates').select('id').eq('slug', 'page').maybeSingle();
    if (!data) await db.from('templates').insert({ kind: 'template', slug: 'page', title: 'Page', content: { root: { props: {} }, content: [{ type: 'entry-content', props: { id: 'pc', attrs: {} } }] } });
  });
  it('shows the form on the built-in donation page, and a donor their thank-you', async () => {
    const page = await renderRequest(new URL('http://localhost/donate/'), db);
    expect(page.status).toBe(200);
    expect(page.html).toContain('action="/api/donations/checkout"');
    expect(page.html).toContain('value="2500"');
    expect(page.html).toContain('name="frequency" value="monthly"');
    expect(page.html).toContain('to cover the payment fees');

    await startDonation(donor({ page: '/donate/' }), 'http://localhost');
    const d = await latest();
    paid.add(d.provider_ref!);
    await returnFromDonation(d.token, false);
    const thanks = await renderRequest(new URL(`http://localhost/donate/?donation=${d.token}`), db);
    expect(thanks.html).toContain('Thank you, Ada');
    expect(thanks.html).not.toContain('action="/api/donations/checkout"');
  });

  it('shows a monthly donor their gift with Cancel', async () => {
    await startDonation(donor({ frequency: 'monthly', page: '/donate/' }), 'http://localhost');
    const d = await latest();
    subs.paid.add(d.provider_ref!);
    await returnFromDonation(d.token, false);
    const p = await plan(d.plan_id!);
    const page = await renderRequest(new URL(`http://localhost/donate/?plan=${p.token}`), db);
    expect(page.html).toContain('Your monthly gift');
    expect(page.html).toContain('Cancel my monthly gift');
  });

  it('is gone while donations are off', async () => {
    await setSite({ donations: { ...DONATIONS, enabled: false } });
    expect((await renderRequest(new URL('http://localhost/donate/'), db)).status).toBe(404);
  });
});
