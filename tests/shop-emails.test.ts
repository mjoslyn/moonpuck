// The shop's order emails: designed in Settings > Shop (else the default template, else the built-in one),
// sent when an order is paid, shipped and refunded, and the shop's copy.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { PROVIDERS } from '../src/lib/payments';
import { fulfilOrder, markShopPaid, refundShopOrder, resendShopConfirmation, startShopCheckout, type ShopOrder } from '../src/lib/shop/orders';
import { shopSettingsFrom } from '../src/lib/shop/config';
import { orderPayment, SAMPLE_SHOP_ORDER, shopEmail, shopEmailToSend, DEFAULT_SHOP_EMAILS } from '../src/lib/shop/email';

type Sent = { to: string[]; replyTo?: string; subject: string; html: string; text: string };
const sent: Sent[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: Sent) => (sent.push(m), true) }));

let made = 0;
Object.assign(PROVIDERS.stripe, {
  configured: () => true,
  create: async () => ({ ref: `cs_e${++made}`, url: `https://pay.example/cs_e${made}` }),
  check: async () => ({ status: 'pending' }),
  close: async () => {},
  refund: async () => ({ id: 're_1', status: 'succeeded' }),
});

const db = siteDb();
const SHOP = {
  enabled: true,
  provider: 'stripe',
  zones: [{ id: 'us', name: 'US', places: ['US'], rates: [{ id: 'std', name: 'Standard', price: 500 }] }],
  pickup: [{ id: 'store', name: 'The store', address: '1 Main St', hours: 'Tue to Sat', fee: 0, place: 'US-NY' }],
};
const setShop = async (shop: Record<string, unknown>) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), shop } });
};
const design = (html: string) => ({ root: { props: {} }, content: [{ type: 'Text', props: { id: 'Text-1', html } }] });
let n = 0;
const product = async (price: number) => (await db.from('entries').insert({ type: 'product', slug: `e-${++n}`, title: `Mug ${n}`, status: 'publish', fields: { shop: { price } } }).select('id').single()).data!.id as number;
const lastOrder = async () => (await db.from('shop_orders').select('*').order('id', { ascending: false }).limit(1).single<ShopOrder>()).data!;
const paidOrder = async () => {
  const p = await product(1000);
  await startShopCheckout({ lines: [{ product: p, variant: 'default', quantity: 2 }], name: 'Ada Lovelace', email: 'ada@example.org', option: 'pickup:store' }, 'http://localhost');
  const o = await lastOrder();
  await markShopPaid(db, o, { paymentId: 'pi_1' }, 'http://localhost');
  return lastOrder();
};

beforeEach(async () => {
  await setShop(SHOP);
  await db.from('email_templates').delete().eq('kit', 'shop');
  sent.length = 0;
});

describe('sending', () => {
  it('sends the built-in confirmation and the shop its copy, once paid', async () => {
    const o = await paidOrder();
    expect(sent.map((m) => m.to[0])).toEqual(['ada@example.org', 'info@example.org']);
    expect(sent[0].subject).toBe(`Your order ${o.code} from Example Town`);
    expect(sent[0].html).toContain('Pick up at The store');
    expect(sent[0].html).toContain(`/cart/?order=${o.token}`);
    expect(sent[1]).toMatchObject({ replyTo: 'ada@example.org', subject: `New order ${o.code}: $20.00` });
    expect(sent[1].html).toContain(`/admin/shop/${o.id}/`);
  });

  it('sends the design from Settings > Shop, else the default template, and no copy when turned off', async () => {
    await db.from('email_templates').insert({ kit: 'shop', name: 'Shipped', design: design('<p>Template: {tracking}</p>'), default_for: 'shop:shipped' });
    await setShop({ ...SHOP, notify: false, emails: { confirmation: { subject: 'Thanks {first_name}: {code}', design: design('<p>Ours: {items}</p>') } } });
    const o = await paidOrder();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(`Thanks Ada: ${o.code}`);
    expect(sent[0].html).toContain('Ours: 2 × Mug');

    sent.length = 0;
    await fulfilOrder(db, o.id, 'shipped', 'TRACK-1', 'http://localhost');
    expect(sent[0].subject).toBe(`Your order ${o.code} from Example Town has shipped`);
    expect(sent[0].html).toContain('Template: TRACK-1');

    sent.length = 0;
    await resendShopConfirmation(db, o.id, 'http://localhost');
    expect(sent[0].subject).toBe(`Thanks Ada: ${o.code}`);
  });

  it('tells the buyer about a refund, with its amount', async () => {
    const o = await paidOrder();
    sent.length = 0;
    await refundShopOrder(db, o.id, 500, {}, 'http://localhost');
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(`A refund for your order ${o.code}`);
    expect(sent[0].text).toContain('We have refunded $5.00');
    expect(sent[0].html).toMatch(/Refunded in all[\s\S]*\$5\.00/);
  });
});

describe('Email me news', () => {
  beforeEach(() => {
    process.env.MAIL_LINK_SECRET = 'a-test-link-secret-that-is-long-enough';
  });
  it('signs a buyer who ticks it up to the lists chosen, confirmed by email; no tick, no sign-up', async () => {
    const list = (await db.from('mail_lists').insert({ name: 'Shop news' }).select('id').single()).data!.id as number;
    const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
    await db.from('settings').upsert({ key: 'site', value: { ...(data?.value as object), mailing: { enabled: true }, shop: { ...SHOP, news: { lists: [list], label: 'Send me the shop’s news' } } } });
    const p = await product(500);
    const body = (email: string, news: boolean) => ({ lines: [{ product: p, variant: 'default', quantity: 1 }], name: 'Nell News', email, option: 'pickup:store', news });
    await startShopCheckout(body('nell@example.org', true), 'http://localhost');
    await startShopCheckout(body('nope@example.org', false), 'http://localhost');
    const c = (await db.from('contacts').select('id, status, consent_source, consent_text').eq('email', 'nell@example.org').single()).data!;
    expect(c).toMatchObject({ status: 'pending', consent_source: 'shop:checkout', consent_text: 'Send me the shop’s news' });
    expect((await db.from('contact_lists').select('list_id, status').eq('contact_id', c.id)).data).toEqual([{ list_id: list, status: 'pending' }]);
    expect(sent.map((m) => [m.to[0], m.subject])).toContainEqual(['nell@example.org', expect.stringMatching(/Confirm/)]);
    expect((await db.from('contacts').select('id').eq('email', 'nope@example.org')).data).toEqual([]);
  });
});

describe('the emails', () => {
  it('keeps the emails as saved, and a copy turned off', () => {
    expect(shopSettingsFrom({ emails: { shipped: { subject: 'Sent', design: design('<p>x</p>') }, refunded: {} }, notify: false })).toMatchObject({ emails: { shipped: { subject: 'Sent' } }, notify: false });
    expect(shopSettingsFrom({ emails: { refunded: {} } })).toBeUndefined();
  });
  it('falls back from the site to the template to the built-in', () => {
    const t = { design: design('<p>t</p>'), text: 'plain' };
    expect(shopEmailToSend('shipped', undefined, null)).toEqual({ subject: DEFAULT_SHOP_EMAILS.shipped.subject, design: DEFAULT_SHOP_EMAILS.shipped.design, text: undefined });
    expect(shopEmailToSend('shipped', { subject: 'S' }, t)).toEqual({ subject: 'S', design: t.design, text: 'plain' });
    expect(shopEmailToSend('shipped', { design: design('<p>s</p>') }, t).design).toEqual(design('<p>s</p>'));
  });
  it('fills in the order, escaping what the buyer typed', () => {
    const o = { ...SAMPLE_SHOP_ORDER, name: '<b>Al</b> Sample' };
    const mail = shopEmail({ subject: '{code} for {first_name}', design: design('<p>{name}: {delivery}</p>') }, o, { order: 'https://x/o', admin: 'https://x/a', siteName: 'S' }, 'https://x');
    expect(mail.subject).toBe(`${o.code} for <b>Al</b>`);
    expect(mail.html).toContain('&lt;b&gt;Al&lt;/b&gt; Sample: Shipping to<br>');
    expect(mail.html).toContain('Example Town, NY 14731');
  });
  it('has no payment for a free order', () => {
    expect(orderPayment({ ...SAMPLE_SHOP_ORDER, provider: 'free' })).toBeNull();
    expect(orderPayment(SAMPLE_SHOP_ORDER)).toMatchObject({ amount: 4920, method: 'Stripe' });
  });
});
