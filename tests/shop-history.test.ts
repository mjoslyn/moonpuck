// An order's history (shop_order_events) and the shop's own order statuses: what happens to an order is
// recorded with who did it, emails included, and a status that says so emails the buyer.
import { describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { addNote, fulfilOrder, markShopPaid, setOrderStatus, ordersQuery, type ShopOrder } from '../src/lib/shop/orders';
import { orderHistory } from '../src/lib/shop/history';
import { orderStatusesFrom, statusEmail } from '../src/lib/shop/statuses';
import { shopSettingsFrom } from '../src/lib/shop/config';

const sent: { to: string[]; subject: string; html: string }[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: any) => (sent.push(m), true) }));

const db = siteDb();
let n = 0;
const order = async (patch: Partial<ShopOrder> = {}) => {
  n++;
  const { data, error } = await db
    .from('shop_orders')
    .insert({ token: `hist-${n}-tokenaaaaaaaaaaaaaaaaaa`, code: `HIS-${n}`, status: 'pending', provider: 'stripe', name: 'Ada Buyer', email: `ada${n}@example.org`, lines: [], quantity: 1, subtotal: 2000, total: 2000, currency: 'USD', fulfilment: 'ship', ...patch })
    .select('*')
    .single();
  expect(error).toBeNull();
  return data as ShopOrder;
};
const setStatuses = async (statuses: unknown[]) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), shop: { enabled: true, statuses } } });
};

describe('order statuses as saved', () => {
  it('keeps named statuses with distinct ids, and their emails', () => {
    const got = orderStatusesFrom([{ id: 'made', name: ' Being  made ', notify: true, email: { subject: 'Hi' } }, { id: 'made', name: 'Again' }, { id: 'x', name: '' }, { id: 'bad id!', name: 'Bad' }]);
    expect(got).toEqual([{ id: 'made', name: 'Being made', notify: true, email: { subject: 'Hi' } }]);
    expect(shopSettingsFrom({ statuses: [{ id: 'ready', name: 'Ready' }] })?.statuses).toEqual([{ id: 'ready', name: 'Ready' }]);
  });
  it('sends the built-in email until one is designed', () => {
    expect(statusEmail({ id: 'r', name: 'Ready' }).subject).toContain('{order_status}');
  });
});

describe('an order’s history', () => {
  it('records the payment and the emails it sent', async () => {
    const o = await order();
    sent.length = 0;
    await markShopPaid(db, o, { paymentId: 'pi_1', amount: 2000 });
    const h = await orderHistory(db, o.id);
    expect(h.map((e) => e.kind).sort()).toEqual(['email', 'email', 'paid']);
    expect(h.find((e) => e.kind === 'paid')!.text).toContain('pi_1');
    expect(h.filter((e) => e.kind === 'email').map((e) => e.text).join(' ')).toContain(o.email);
    expect(sent.length).toBe(2);
  });
  it('records notes and fulfilment with who did them', async () => {
    const o = await order({ status: 'paid', paid_at: new Date().toISOString() });
    await addNote(db, o.id, 'Gift wrap it', 'Sam');
    await fulfilOrder(db, o.id, 'shipped', '1Z999', undefined, '', { by: 'Sam' });
    const h = await orderHistory(db, o.id);
    expect(h.find((e) => e.kind === 'note')).toMatchObject({ text: 'Gift wrap it', by: 'Sam' });
    expect(h.find((e) => e.kind === 'fulfilled')).toMatchObject({ by: 'Sam' });
    expect(h.find((e) => e.kind === 'fulfilled')!.text).toContain('1Z999');
    await expect(addNote(db, o.id, '  ', 'Sam')).rejects.toThrow();
  });
});

describe('setting a status', () => {
  it('records it and emails the buyer when the status says so', async () => {
    await setStatuses([
      { id: 'made', name: 'Being made' },
      { id: 'ready', name: 'Ready to collect', notify: true, email: { subject: 'Order {code}: {order_status}' } },
    ]);
    const o = await order({ status: 'paid' });
    sent.length = 0;
    expect(await setOrderStatus(db, o.id, 'made', 'Sam')).toEqual({ emailed: false });
    expect(sent.length).toBe(0);
    expect(await setOrderStatus(db, o.id, 'ready', 'Sam')).toEqual({ emailed: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([o.email]);
    expect(sent[0].subject).toBe(`Order ${o.code}: Ready to collect`);
    const h = await orderHistory(db, o.id);
    expect(h.filter((e) => e.kind === 'status').map((e) => e.text)).toEqual(['Status: Ready to collect (was Being made).', 'Status: Being made.']);
    expect(h.some((e) => e.kind === 'email' && e.text.includes('Ready to collect'))).toBe(true);
    // The same status again changes nothing; one left unsent sends nothing.
    expect(await setOrderStatus(db, o.id, 'ready', 'Sam')).toEqual({ emailed: false });
    await setOrderStatus(db, o.id, '', 'Sam');
    sent.length = 0;
    expect(await setOrderStatus(db, o.id, 'ready', 'Sam', undefined, false)).toEqual({ emailed: false });
    expect(sent.length).toBe(0);
    await expect(setOrderStatus(db, o.id, 'gone', 'Sam')).rejects.toThrow(/No such status/);
  });
  it('filters the Orders screen by status', async () => {
    const o = await order({ status: 'paid' });
    await setOrderStatus(db, o.id, 'made', '', undefined, false);
    const { data } = await ordersQuery(db, 'all', '', 'made');
    expect((data ?? []).map((x: any) => x.id)).toContain(o.id);
    const { data: none } = await ordersQuery(db, 'all', '', '-');
    expect((none ?? []).map((x: any) => x.id)).not.toContain(o.id);
  });
});
