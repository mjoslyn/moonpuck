// Digital downloads: a product's private file, kept on the order's line, linked once paid, counted and
// limited where it is served, closed after the days set.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { bindings, setBindings } from '../src/lib/platform';
import { PROVIDERS } from '../src/lib/payments';
import { markShopPaid, startShopCheckout, type ShopOrder } from '../src/lib/shop/orders';
import { downloadOf } from '../src/lib/shop/config';
import { downloadsClosed, serveDownload, storeDownload } from '../src/lib/shop/downloads';
import { memoryBucket } from './setup/memory-bucket';

const sent: { to: string[]; subject: string; html: string }[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: any) => (sent.push(m), true) }));
let made = 0;
Object.assign(PROVIDERS.stripe, { configured: () => true, create: async () => ({ ref: `cs_d${++made}`, url: 'https://pay.example/x' }), check: async () => ({ status: 'pending' }), close: async () => {} });

const db = siteDb();
beforeAll(() => setBindings({ ...bindings(), BUCKET: memoryBucket() }));
const setShop = async (shop: Record<string, unknown> = {}) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), shop: { enabled: true, provider: 'stripe', pickup: [{ id: 'store', name: 'Store', address: '1 Main St' }], ...shop } } });
};
beforeEach(async () => {
  await setShop({ downloadLimit: 2 });
  sent.length = 0;
});

const upload = async (name: string, body: string) => {
  const r = await storeDownload(new Request('http://localhost/api/admin/shop/downloads', { method: 'POST', body, headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(body.length), 'X-File-Name': encodeURIComponent(name) } }));
  if ('error' in r) throw new Error(r.error);
  return r;
};
let n = 0;
const paidOrder = async (download: unknown) => {
  const p = (await db.from('entries').insert({ type: 'product', slug: `dl-${++n}`, title: `Pattern ${n}`, status: 'publish', fields: { shop: { price: 500, ships: false, download } } }).select('id').single()).data!.id as number;
  await startShopCheckout({ lines: [{ product: p, variant: 'default', quantity: 1 }], name: 'Ada', email: 'ada@example.org' }, 'http://localhost');
  const o = (await db.from('shop_orders').select('*').order('id', { ascending: false }).limit(1).single<ShopOrder>()).data!;
  return o;
};

describe('downloads', () => {
  it('keep the file on the line, link it once paid, and count and limit each download', async () => {
    const file = await upload('Harbour pattern.pdf', '%PDF-1.4 hello');
    expect(file).toMatchObject({ name: 'Harbour pattern.pdf', size: 14, type: 'application/pdf', path: expect.stringMatching(/^[a-f0-9]{16}\/harbour-pattern\.pdf$/) });
    const o = await paidOrder(file);
    expect(o.lines[0].download).toEqual({ path: file.path, name: 'Harbour pattern.pdf' });
    // Not paid yet: closed.
    expect((await serveDownload(o.token, 0)).status).toBe(410);

    await markShopPaid(db, o, { paymentId: 'pi' }, 'http://localhost');
    const receipt = sent.find((m) => m.to[0] === 'ada@example.org')!;
    expect(receipt.html).toContain(`/api/shop/download?order=${o.token}&amp;line=0`);

    const first = await serveDownload(o.token, 0);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-disposition')).toContain('filename="Harbour pattern.pdf"');
    expect(await first.text()).toBe('%PDF-1.4 hello');
    expect((await serveDownload(o.token, 0)).status).toBe(200);
    // The limit (2) reached.
    const third = await serveDownload(o.token, 0);
    expect(third.status).toBe(410);
    expect(await third.text()).toMatch(/used 2 times/);
    expect((await db.from('shop_orders').select('lines').eq('id', o.id).single()).data!.lines[0].downloads).toBe(2);
    // No such line, or a wrong token.
    expect((await serveDownload(o.token, 5)).status).toBe(404);
    expect((await serveDownload('x'.repeat(32), 0)).status).toBe(404);
  });
  it('close after the days set, and keep only safe paths', () => {
    const paid = { status: 'paid' as const, paid_at: '2026-01-01T00:00:00.000Z' };
    expect(downloadsClosed(paid, 30, Date.parse('2026-01-20'))).toBeNull();
    expect(downloadsClosed(paid, 30, Date.parse('2026-03-01'))).toMatch(/30 days/);
    expect(downloadsClosed(paid, 0, Date.parse('2030-01-01'))).toBeNull();
    expect(downloadOf({ path: '../media/x.jpg', name: 'x' })).toBeNull();
    expect(downloadOf({ path: '0123456789abcdef/a.pdf', name: 'A "b"/c.pdf' })).toMatchObject({ name: 'A bc.pdf' });
  });
});

describe('the public quote', () => {
  it('names a product’s download without its stored path', async () => {
    const { POST } = await import('../src/pages/api/shop/quote');
    const db = siteDb();
    const { data: site } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
    await db.from('settings').upsert({ key: 'site', value: { ...((site?.value as object) ?? {}), shop: { enabled: true } } });
    const path = '0123456789abcdef/pattern.pdf';
    const { data: e } = await db.from('entries').insert({ type: 'product', slug: 'quote-pattern', title: 'Pattern', status: 'publish', fields: { shop: { price: 500, ships: false, download: { path, name: 'pattern.pdf', size: 10, type: 'application/pdf' } } } }).select('id').single();
    const res = await POST({ request: new Request('http://localhost/api/shop/quote', { method: 'POST', body: JSON.stringify({ lines: [{ product: e!.id, variant: 'default', quantity: 1 }] }) }) } as any);
    const text = await res.text();
    expect(JSON.parse(text).lines[0].download).toEqual({ name: 'pattern.pdf' });
    expect(text).not.toContain('0123456789abcdef');
  });
});
