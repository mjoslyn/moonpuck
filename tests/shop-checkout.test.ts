// The shop's checkout settings (zones, rates, pickup, tax), the totals engine and member pricing.
import { describe, expect, it } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { checkoutSettings, checkoutSettingsFrom, taxInForce } from '../src/lib/shop/checkout-settings';
import { cleanPlace, covers } from '../src/lib/shop/places';
import { cartTotals, orderTotals, ratePrice, shippingChoices, spreadDiscount, taxRateFor, zoneFor, type CartFacts, type ShippingSource } from '../src/lib/shop/totals';
import { mayBuyProduct, productOf, unitFor, variantOf } from '../src/lib/shop/config';
import { quoteCart } from '../src/lib/shop/cart';

const line = (total: number, more: Partial<CartFacts['lines'][number]> = {}) => ({ quantity: 1, total, ships: true, pickupOnly: false, taxable: true, weight: null, ...more });
const cart = (...lines: CartFacts['lines']): CartFacts => ({ lines, subtotal: lines.reduce((a, l) => a + l.total, 0) });

const settings = checkoutSettings({
  zones: [
    { id: 'world', name: 'World', places: ['*'], rates: [{ id: 'intl', name: 'International', price: 2500 }] },
    { id: 'ny', name: 'New York', places: ['US-NY'], rates: [{ id: 'local', name: 'Local courier', price: 500 }] },
    {
      id: 'us',
      name: 'US',
      places: ['US', 'PR'],
      rates: [
        { id: 'std', name: 'Standard', rule: 'subtotal', bands: [{ min: 0, max: 5000, price: 800 }, { min: 5000, max: null, price: 400 }], freeOver: 10000 },
        { id: 'heavy', name: 'Freight', rule: 'weight', bands: [{ min: 10, max: null, price: 3000 }] },
      ],
    },
  ],
  pickup: [{ id: 'shop', name: 'Main Street', address: '1 Main St', fee: 0, place: 'US-PA' }],
  tax: { rate: 7, regions: [{ place: 'US', rate: 5 }, { place: 'US-NY', rate: 8.875 }, { place: 'bogus', rate: 3 }], onShipping: true },
});

describe('places', () => {
  it('cleans place codes and matches destinations', () => {
    expect(cleanPlace(' us-ny ')).toBe('US-NY');
    expect(cleanPlace('CA-ON')).toBeNull();
    expect(cleanPlace('ZZ')).toBeNull();
    expect(covers('US', { country: 'us', state: 'ca' })).toBe(true);
    expect(covers('US-NY', { country: 'US', state: 'CA' })).toBe(false);
  });
});

describe('checkout settings', () => {
  it('cleans zones, rates and tax, and saves only what differs from the defaults', () => {
    expect(settings.tax.regions.map((r) => r.place)).toEqual(['US', 'US-NY']);
    expect(settings.zones[2].rates[1].bands).toEqual([{ min: 10, max: null, price: 3000 }]);
    expect(checkoutSettingsFrom({ hold: 60, tax: { mode: 'rates' } })).toEqual({});
    expect(checkoutSettingsFrom({ hold: 500, provider: 'paypal' })).toEqual({ hold: 120 });
    // Ids made where missing, never two the same.
    expect(checkoutSettings({ zones: [{ name: 'A' }, { id: 'z1' }] }).zones.map((z) => z.id)).toEqual(['z1', 'z1-2']);
  });
});

describe('Stripe Tax', () => {
  it('is in force only while payments go through Stripe', () => {
    const tax = checkoutSettings({ tax: { mode: 'stripe', rate: 6 } }).tax;
    expect(taxInForce(tax, 'stripe').mode).toBe('stripe');
    expect(taxInForce(tax, 'square')).toMatchObject({ mode: 'rates', rate: 6 });
    expect(taxInForce(tax, undefined).mode).toBe('rates');
  });
});

describe('shipping', () => {
  it('takes the first zone naming the address, then everywhere else', () => {
    expect(zoneFor(settings.zones, { country: 'US', state: 'NY' })?.id).toBe('ny');
    expect(zoneFor(settings.zones, { country: 'US', state: 'OH' })?.id).toBe('us');
    expect(zoneFor(settings.zones, { country: 'FR' })?.id).toBe('world');
    expect(zoneFor(settings.zones.slice(1), { country: 'FR' })).toBeUndefined();
  });

  it('prices rates by band, weight and free over', () => {
    const [std, heavy] = settings.zones[2].rates;
    expect(ratePrice(std, cart(line(3000)))).toBe(800);
    expect(ratePrice(std, cart(line(6000)))).toBe(400);
    expect(ratePrice(std, cart(line(12000)))).toBe(0);
    expect(ratePrice(heavy, cart(line(1000, { weight: 4, quantity: 2 })))).toBeNull();
    expect(ratePrice(heavy, cart(line(1000, { weight: 4, quantity: 3 })))).toBe(3000);
    // Lines that aren't shipped weigh nothing.
    expect(ratePrice(heavy, cart(line(1000, { weight: 40, ships: false })))).toBeNull();
  });

  it('lists rates cheapest first then pickup, limits pickup-only carts and skips carts with nothing to ship', async () => {
    const oh = await shippingChoices(settings, cart(line(3000)), { country: 'US', state: 'OH' });
    expect(oh.options.map((o) => [o.id, o.price])).toEqual([['manual:us:std', 800], ['pickup:shop', 0]]);
    expect((await shippingChoices(settings, cart(line(3000)), null)).options.map((o) => o.id)).toEqual(['pickup:shop']);
    expect((await shippingChoices(settings, cart(line(3000), line(100, { pickupOnly: true })), { country: 'US', state: 'OH' })).options.map((o) => o.kind)).toEqual(['pickup']);
    expect(await shippingChoices({ zones: [], pickup: [] }, cart(line(1, { pickupOnly: true })), null)).toEqual({ needs: 'pickup', options: [], problem: 'no-pickup' });
    expect(await shippingChoices(settings, cart(line(3000, { ships: false })), { country: 'US' })).toEqual({ needs: 'none', options: [] });
    expect((await shippingChoices({ zones: settings.zones.slice(1), pickup: [] }, cart(line(1)), { country: 'FR' })).problem).toBe('no-rates');
  });

  it('leaves out a source that fails', async () => {
    const broken: ShippingSource = { id: 'carrier', quote: () => Promise.reject(new Error('down')) };
    const ok: ShippingSource = { id: 'flat', quote: () => [{ id: 'flat:a:b', kind: 'ship', name: 'Flat', price: 100, source: 'flat' }] };
    const err = console.error;
    console.error = () => {};
    const r = await shippingChoices({ zones: [], pickup: [] }, cart(line(1)), { country: 'US' }, [broken, ok]);
    console.error = err;
    expect(r.options.map((o) => o.id)).toEqual(['flat:a:b']);
  });
});

describe('tax and totals', () => {
  it('takes the most specific region', () => {
    expect(taxRateFor(settings.tax, { country: 'US', state: 'NY' })).toBe(8.875);
    expect(taxRateFor(settings.tax, { country: 'US', state: 'OH' })).toBe(5);
    expect(taxRateFor(settings.tax, { country: 'FR' })).toBe(7);
    expect(taxRateFor(settings.tax, null)).toBe(7);
  });

  it('spreads a discount so it adds up and no line goes below 0', () => {
    expect(spreadDiscount([1000, 2000, 3000], 100)).toEqual([16, 33, 51]);
    expect(spreadDiscount([1, 1, 1], 2).reduce((a, b) => a + b)).toBe(2);
    expect(spreadDiscount([500, 300], 5000)).toEqual([500, 300]);
    expect(spreadDiscount([], 10)).toEqual([]);
  });

  it('taxes each line after its share of the discount, and shipping when set', () => {
    const t = orderTotals({ lines: [line(1000), line(2000, { taxable: false })], tax: settings.tax, where: { country: 'US', state: 'NY' }, shipping: 500, discount: 300 });
    expect(t.lineDiscounts).toEqual([100, 200]);
    expect(t.lineTax).toEqual([80, 0]);
    expect(t.shippingTax).toBe(44);
    expect(t).toMatchObject({ subtotal: 3000, discount: 300, shipping: 500, tax: 124, total: 3324 });
    const free = orderTotals({ lines: [line(1000)], tax: { ...settings.tax, onShipping: false }, where: null, shipping: 500, freeShipping: true });
    expect(free).toMatchObject({ shipping: 0, discount: 500, tax: 70, total: 1070 });
    expect(orderTotals({ lines: [line(1000)], tax: { ...settings.tax, mode: 'stripe' }, where: null, shipping: 500 })).toMatchObject({ tax: null, total: 1500 });
  });

  it('taxes a pickup at its location and leaves out lines that can\'t be had', async () => {
    const q = { lines: [line(1000), { ...line(0, { quantity: 0 }), problem: 'sold-out' }], subtotal: 1000 };
    const r = await cartTotals(q, settings, { destination: { country: 'US', state: 'NY' }, option: 'pickup:shop' });
    expect(r.chosen?.id).toBe('pickup:shop');
    // At US-PA: the US rate, not New York's.
    expect(r.totals).toMatchObject({ subtotal: 1000, tax: 50, total: 1050 });
    const none = await cartTotals(q, settings, { destination: null, option: 'manual:us:std' });
    expect(none.chosen).toBeNull();
  });
});

describe('member pricing', () => {
  const gold = { level: 'gold', status: 'active' };
  const p = productOf({ shop: { price: 2000, memberDiscounts: { gold: 15, silver: '0', bronze: 'lots' }, membersOnly: true, levels: ['gold'] } })!;

  it('takes a level\'s discount off for active members only', () => {
    expect(p.memberDiscounts).toEqual({ gold: 15 });
    const v = variantOf(p, 'default')!;
    expect(unitFor(p, v, gold)).toBe(1700);
    expect(unitFor(p, v, { ...gold, status: 'pending' })).toBe(2000);
    expect(unitFor(p, v, { ...gold, expires_on: '2000-01-01' })).toBe(2000);
    expect(unitFor(p, v, null)).toBe(2000);
    expect(mayBuyProduct(p, gold)).toBe(true);
    expect(mayBuyProduct(p, { level: 'silver', status: 'active' })).toBe(false);
    expect(mayBuyProduct(p, null)).toBe(false);
  });

  it("takes a fixed member price: the variant's, else the product's, never above the price", () => {
    const q = productOf({
      shop: {
        price: 2000,
        memberDiscounts: { gold: 50, silver: 10 },
        memberPrices: { gold: 1500, bronze: 2500 },
        options: [{ name: 'Size', values: ['S', 'L'] }],
        variants: [{ id: 's', values: ['S'] }, { id: 'l', values: ['L'], price: 3000, memberPrices: { gold: 2200, bad: -1 } }],
      },
    })!;
    const at = (id: string, level: string) => unitFor(q, variantOf(q, id)!, { level, status: 'active' });
    expect(variantOf(q, 'l')!.memberPrices).toEqual({ gold: 2200 });
    // A fixed price wins over the level's percent off.
    expect(at('s', 'gold')).toBe(1500);
    expect(at('l', 'gold')).toBe(2200);
    expect(at('s', 'silver')).toBe(1800);
    expect(at('s', 'bronze')).toBe(2000);
    expect(at('l', 'bronze')).toBe(2500);
  });

  it('charges members their price in the cart and refuses members-only products to others', async () => {
    const db = siteDb();
    const id = (await db.from('entries').insert({ type: 'product', slug: 'club-mug', title: 'Club mug', status: 'publish', fields: { shop: { price: 2000, memberDiscounts: { gold: 10 } } } }).select('id').single()).data!.id as number;
    const only = (await db.from('entries').insert({ type: 'product', slug: 'club-pin', title: 'Club pin', status: 'publish', fields: { shop: { price: 500, membersOnly: true } } }).select('id').single()).data!.id as number;
    const lines = [{ product: id, variant: 'default', quantity: 2 }, { product: only, variant: 'default', quantity: 1 }];
    const site = { shop: { enabled: true } };
    const viewer = { id: 'u', email: 'a@b.c', name: 'A', editor: false, member: { level: 'gold', status: 'active' } as any };
    const member = await quoteCart(db, lines, { published: true, viewer }, site);
    expect(member.lines.map((l) => [l.unit, l.listUnit, l.total, l.problem])).toEqual([
      [1800, 2000, 3600, undefined],
      [500, undefined, 500, undefined],
    ]);
    const anyone = await quoteCart(db, lines, { published: true }, site);
    expect(anyone.lines.map((l) => [l.unit, l.total, l.quantity, l.problem])).toEqual([
      [2000, 4000, 2, undefined],
      [500, 0, 0, 'members-only'],
    ]);
    expect(anyone.subtotal).toBe(4000);
  });
});

describe('product categories', () => {
  it('pass their member discounts to their products, the largest winning, after the product\'s own', async () => {
    const db = siteDb();
    const term = async (slug: string, fields: Record<string, unknown>, parent_id: number | null = null) =>
      (await db.from('terms').insert({ taxonomy: 'product_category', name: slug, slug, parent_id, fields }).select('id').single()).data!.id as number;
    const clothing = await term('clothing', { memberDiscounts: { gold: 10, silver: 5 } });
    const hats = await term('hats', { memberDiscounts: { silver: 20 } }, clothing);
    const product = async (slug: string, shop: Record<string, unknown>, terms: number[]) => {
      const id = (await db.from('entries').insert({ type: 'product', slug, title: slug, status: 'publish', fields: { shop } }).select('id').single()).data!.id as number;
      await db.from('entry_terms').insert(terms.map((term_id) => ({ entry_id: id, term_id })));
      return id;
    };
    const cap = await product('cap', { price: 1000 }, [hats]);
    const own = await product('own-cap', { price: 1000, memberDiscounts: { gold: 50 } }, [hats]);
    const viewer = (level: string) => ({ id: 'u', email: 'a@b.c', name: 'A', editor: false, member: { level, status: 'active' } as any });
    const lines = [cap, own].map((product) => ({ product, variant: 'default', quantity: 1 }));
    const site = { shop: { enabled: true } };
    const units = async (level: string) => (await quoteCart(db, lines, { published: true, viewer: viewer(level) }, site)).lines.map((l) => l.unit);
    // Gold: the parent's 10% (the cap); its own 50% (own-cap).
    expect(await units('gold')).toEqual([900, 500]);
    // Silver: hats' 20% over clothing's 5%.
    expect(await units('silver')).toEqual([800, 800]);
    expect((await quoteCart(db, lines, { published: true }, site)).lines.map((l) => l.unit)).toEqual([1000, 1000]);
  });
});
