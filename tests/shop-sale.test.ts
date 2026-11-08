// Sale pricing: a product's sale runs between its times; variants sell at their sale price (only when
// lower), and members pay the lowest of their price, their sale price and the sale price.
import { describe, expect, it } from 'vitest';
import { priceRange, productOf, saleRuns, sellable, unitFor, variantOf } from '../src/lib/shop/config';

const now = new Date('2026-11-08T12:00:00Z');
const gold = { level: 'gold', status: 'active' };
const product = (shop: Record<string, unknown>) => productOf({ shop: { price: 2000, ...shop } })!;

describe('sale times', () => {
  it('runs inside its times, either of which may be open', () => {
    expect(saleRuns({}, now)).toBe(true);
    expect(saleRuns({ start: '2026-11-09T00:00:00Z' }, now)).toBe(false);
    expect(saleRuns({ end: '2026-11-08T12:00:00Z' }, now)).toBe(false);
    expect(saleRuns({ start: '2026-11-01T00:00:00Z', end: '2026-11-30T00:00:00Z' }, now)).toBe(true);
    expect(saleRuns(undefined, now)).toBe(false);
  });
});

describe('sale prices', () => {
  it('sells at the sale price, the usual price struck through', () => {
    const v = variantOf(product({ sale: { price: 1500 } }), 'default', now)!;
    expect(v).toMatchObject({ price: 1500, regular: 2000, compareAt: 2000, sale: true });
  });
  it('takes a percent off each variant, a variant’s own sale price first', () => {
    const p = product({ options: [{ name: 'Size', values: ['S', 'L'] }], variants: [{ id: 'vs', values: ['S'] }, { id: 'vl', values: ['L'], price: 3000, salePrice: 2000 }], sale: { percent: 25 } });
    expect(sellable(p, now).map((v) => v.price)).toEqual([1500, 2000]);
    expect(priceRange(p)).toEqual({ min: 1500, max: 2000 });
  });
  it('keeps the usual price outside the sale’s times, and a sale price that isn’t lower', () => {
    expect(variantOf(product({ sale: { price: 1500, end: '2026-11-01T00:00:00Z' } }), 'default', now)).toMatchObject({ price: 2000, sale: false });
    expect(variantOf(product({ sale: { price: 2500 } }), 'default', now)).toMatchObject({ price: 2000, sale: false });
  });
  it('keeps a higher compare-at price struck through', () => {
    expect(variantOf(product({ compareAt: 2500, sale: { price: 1500 } }), 'default', now)!.compareAt).toBe(2500);
  });
});

describe('members in a sale', () => {
  it('pay the sale price when it is below their price', () => {
    const p = product({ memberDiscounts: { gold: 10 }, sale: { price: 1500, end: '2026-12-01T00:00:00Z' } });
    expect(unitFor(p, variantOf(p, 'default', now)!, gold)).toBe(1500);
    // Outside the sale, their 10% off the usual price.
    expect(unitFor(p, variantOf(p, 'default', new Date('2027-01-01'))!, gold)).toBe(1800);
  });
  it('pay their own sale price, or percent off, when lower', () => {
    const fixed = product({ memberPrices: { gold: 1800 }, sale: { price: 1500, memberPrices: { gold: 1200 } } });
    expect(unitFor(fixed, variantOf(fixed, 'default', now)!, gold)).toBe(1200);
    const pct = product({ sale: { memberDiscounts: { gold: 50 } } });
    expect(unitFor(pct, variantOf(pct, 'default', now)!, gold)).toBe(1000);
    // Everyone else: the usual price (the sale sets no price of its own).
    expect(unitFor(pct, variantOf(pct, 'default', now)!, null)).toBe(2000);
  });
  it('take a variant’s own member sale price over the sale’s', () => {
    const p = product({ variants: [{ id: 'default', values: [], memberSalePrices: { gold: 900 } }], sale: { memberPrices: { gold: 1200 } } });
    expect(unitFor(p, variantOf(p, 'default', now)!, gold)).toBe(900);
  });
});
