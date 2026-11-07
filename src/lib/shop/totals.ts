// What an order costs: the shipping options a cart has for an address (the manual zones and rates, a
// carrier later, and pickup), the discount spread over its lines, and tax per line. The quote endpoint
// and checkout both use it, so what the cart shows is what checkout charges. Amounts are in minor units.
// Safe in the browser.
import type { CheckoutSettings, PickupLocation, ShippingRate, ShippingZone, TaxSettings } from './checkout-settings';
import { covers, ELSEWHERE, specificity, type Destination } from './places';

/** What totals need of a cart line (src/lib/shop/cart.ts QuoteLine). */
export interface CartFactLine {
  quantity: number;
  /** The line's price before any discount. */
  total: number;
  /** Sent by post. */
  ships: boolean;
  /** Only collected. */
  pickupOnly: boolean;
  taxable: boolean;
  /** Per item, in the shop's weight unit; null counts as 0. */
  weight: number | null;
}

export interface CartFacts {
  lines: CartFactLine[];
  /** What rates by subtotal and "free over" compare against. */
  subtotal: number;
}

/** A way to get the order to the buyer, as offered at checkout. */
export interface ShipOption {
  /** `<source>:<zone>:<rate>` for a shipping source's rate, `pickup:<id>` for a pickup location. */
  id: string;
  kind: 'ship' | 'pickup';
  name: string;
  price: number;
  /** The shipping source (`manual`; a carrier later), or `pickup`. */
  source: string;
  /** A pickup location's address and hours. */
  address?: string;
  hours?: string;
  /** Where the order is taxed for a pickup ("US-NY"; empty: the store's rate). */
  place?: string;
}

/** A source of shipping rates: the manual zones, a carrier later. */
export interface ShippingSource {
  id: string;
  quote(cart: CartFacts, dest: Destination): ShipOption[] | Promise<ShipOption[]>;
}

/** The shipped lines' total weight. */
export const cartWeight = (cart: CartFacts) => cart.lines.reduce((w, l) => w + (l.ships && !l.pickupOnly ? (l.weight ?? 0) * l.quantity : 0), 0);

/** What a cart needs to reach the buyer: nothing (no line is posted or collected), pickup only, or
 *  shipping or pickup. */
export function fulfilment(cart: CartFacts): 'none' | 'pickup' | 'any' {
  if (cart.lines.some((l) => l.quantity > 0 && l.pickupOnly)) return 'pickup';
  return cart.lines.some((l) => l.quantity > 0 && l.ships) ? 'any' : 'none';
}

/**
 * The zone for an address: the first, in order, with a place covering it; a zone covering it only as
 * "everywhere else" is taken only when no zone names the address's country or state.
 */
export function zoneFor(zones: ShippingZone[], dest: Destination): ShippingZone | undefined {
  return zones.find((z) => z.places.some((p) => p !== ELSEWHERE && covers(p, dest))) ?? zones.find((z) => z.places.includes(ELSEWHERE));
}

/** A rate's price for a cart, or null when its rule doesn't fit it. */
export function ratePrice(rate: ShippingRate, cart: CartFacts): number | null {
  if (rate.freeOver != null && cart.subtotal >= rate.freeOver) return 0;
  if (rate.rule === 'flat') return rate.price;
  const value = rate.rule === 'weight' ? cartWeight(cart) : cart.subtotal;
  const band = rate.bands.find((b) => value >= b.min && (b.max == null || value < b.max));
  return band ? band.price : null;
}

/** The manual rates as a shipping source. */
export const manualSource = (settings: Pick<CheckoutSettings, 'zones'>): ShippingSource => ({
  id: 'manual',
  quote(cart, dest) {
    const zone = zoneFor(settings.zones, dest);
    if (!zone) return [];
    return zone.rates.flatMap((r) => {
      const price = ratePrice(r, cart);
      return price == null ? [] : [{ id: `manual:${zone.id}:${r.id}`, kind: 'ship' as const, name: r.name, price, source: 'manual' }];
    });
  },
});

export const pickupOption = (p: PickupLocation): ShipOption => ({
  id: `pickup:${p.id}`,
  kind: 'pickup',
  name: p.name,
  price: p.fee,
  source: 'pickup',
  address: p.address,
  hours: p.hours,
  place: p.place,
});

export interface ShippingChoices {
  /** none: nothing to post or collect; pickup: only pickup; any: shipping (with an address) or pickup. */
  needs: 'none' | 'pickup' | 'any';
  /** Rates for the address (cheapest first), then the pickup locations. */
  options: ShipOption[];
  /** Why the cart can't be had: a pickup-only item with no pickup locations, or no rate for the address
   *  and no pickup. */
  problem?: 'no-pickup' | 'no-rates';
}

/**
 * The ways a cart can reach the buyer. Every source is asked (a failing one is left out and logged), and
 * their rates listed together, cheapest first, then the pickup locations. Without an address only pickup
 * is listed.
 */
export async function shippingChoices(settings: Pick<CheckoutSettings, 'zones' | 'pickup'>, cart: CartFacts, dest: Destination | null, sources: ShippingSource[] = [manualSource(settings)]): Promise<ShippingChoices> {
  const needs = fulfilment(cart);
  const pickup = settings.pickup.map(pickupOption);
  if (needs === 'none') return { needs, options: [] };
  if (needs === 'pickup') return pickup.length ? { needs, options: pickup } : { needs, options: [], problem: 'no-pickup' };
  const rates: ShipOption[] = [];
  if (dest?.country) {
    const answers = await Promise.all(
      sources.map(async (s) => {
        try {
          return await s.quote(cart, dest);
        } catch (e) {
          console.error(`Shipping source ${s.id} failed:`, e);
          return [];
        }
      }),
    );
    rates.push(...answers.flat().sort((a, b) => a.price - b.price));
  }
  const options = [...rates, ...pickup];
  return dest?.country && !options.length ? { needs, options, problem: 'no-rates' } : { needs, options };
}

/** A place code ("US-NY") as a destination. */
export function placeDestination(place: string | null | undefined): Destination | null {
  if (!place || place === ELSEWHERE) return null;
  const [country, state] = place.split('-');
  return { country, state };
}

/** The tax rate (percent) for where an order is taxed: the most specific region covering it, else the
 *  store's. Null: the store's. */
export function taxRateFor(tax: TaxSettings, where: Destination | null): number {
  if (!where) return tax.rate;
  const region = tax.regions.filter((r) => covers(r.place, where)).sort((a, b) => specificity(b.place) - specificity(a.place))[0];
  return region ? region.rate : tax.rate;
}

/** Tax on an amount at a rate, rounded to the minor unit. */
export const taxOn = (amount: number, rate: number) => (amount > 0 && rate > 0 ? Math.round((amount * rate) / 100) : 0);

/**
 * A discount spread over the lines in proportion to their amounts, rounded down, the cents left over
 * going to the last lines with room, so the shares add up to the discount and no line goes below 0.
 */
export function spreadDiscount(amounts: number[], discount: number): number[] {
  const sum = amounts.reduce((a, b) => a + Math.max(0, b), 0);
  const d = Math.max(0, Math.min(Math.round(discount), sum));
  if (!d) return amounts.map(() => 0);
  const shares = amounts.map((a) => Math.floor((Math.max(0, a) * d) / sum));
  let left = d - shares.reduce((a, b) => a + b, 0);
  for (let i = amounts.length - 1; left > 0 && i >= 0; i--) {
    const room = Math.max(0, amounts[i]) - shares[i];
    const take = Math.min(room, left);
    shares[i] += take;
    left -= take;
  }
  return shares;
}

export interface Totals {
  subtotal: number;
  discount: number;
  /** Each line's share of the discount. */
  lineDiscounts: number[];
  shipping: number;
  /** Each line's tax (0 for lines not taxed). */
  lineTax: number[];
  shippingTax: number;
  /** Null: worked out at checkout (Stripe Tax). */
  tax: number | null;
  /** Without tax when it is worked out at checkout. */
  total: number;
  /** The rate used, in percent (null with Stripe Tax). */
  taxRate: number | null;
}

/**
 * An order's totals: the discount spread over the lines (a free-shipping discount takes the shipping
 * instead), tax per line after its share of the discount at the rate for `where` (the address, or a
 * pickup location's place), and on shipping when the settings say so.
 */
export function orderTotals(input: {
  lines: Pick<CartFactLine, 'total' | 'taxable'>[];
  tax: TaxSettings;
  where: Destination | null;
  shipping?: number;
  discount?: number;
  freeShipping?: boolean;
}): Totals {
  const amounts = input.lines.map((l) => Math.max(0, l.total));
  const subtotal = amounts.reduce((a, b) => a + b, 0);
  const lineDiscounts = spreadDiscount(amounts, input.discount ?? 0);
  const goodsDiscount = lineDiscounts.reduce((a, b) => a + b, 0);
  const shippingFull = Math.max(0, Math.round(input.shipping ?? 0));
  const shipping = input.freeShipping ? 0 : shippingFull;
  const discount = goodsDiscount + (input.freeShipping ? shippingFull : 0);
  const net = subtotal - goodsDiscount + shipping;
  if (input.tax.mode === 'stripe') return { subtotal, discount, lineDiscounts, shipping, lineTax: amounts.map(() => 0), shippingTax: 0, tax: null, total: net, taxRate: null };
  const rate = taxRateFor(input.tax, input.where);
  const lineTax = input.lines.map((l, i) => (l.taxable ? taxOn(amounts[i] - lineDiscounts[i], rate) : 0));
  const shippingTax = input.tax.onShipping ? taxOn(shipping, rate) : 0;
  const tax = lineTax.reduce((a, b) => a + b, 0) + shippingTax;
  return { subtotal, discount, lineDiscounts, shipping, lineTax, shippingTax, tax, total: net + tax, taxRate: rate };
}

/** What the cart shows and checkout charges for an address and a chosen way of getting the order. */
export interface CartTotals {
  shipping: ShippingChoices;
  /** The option chosen, if it is offered (else none: the buyer picks one). */
  chosen: ShipOption | null;
  totals: Totals;
}

/**
 * A priced cart's totals for an address (or none yet) and the option the buyer chose. Only lines that can
 * be had count. Tax is at the chosen pickup location's place, else the address's, else the store's rate.
 */
export async function cartTotals(
  quote: { lines: (CartFactLine & { problem?: string })[]; subtotal: number },
  settings: CheckoutSettings,
  input: { destination?: Destination | null; option?: string | null; sources?: ShippingSource[] },
): Promise<CartTotals> {
  const lines = quote.lines.filter((l) => l.quantity > 0 && l.problem !== 'members-only' && l.problem !== 'sold-out' && l.problem !== 'gone');
  const cart: CartFacts = { lines, subtotal: quote.subtotal };
  const dest = input.destination?.country ? input.destination : null;
  const shipping = await shippingChoices(settings, cart, dest, input.sources);
  const chosen = shipping.options.find((o) => o.id === input.option) ?? null;
  const where = chosen?.kind === 'pickup' ? placeDestination(chosen.place) : dest;
  const totals = orderTotals({ lines, tax: settings.tax, where, shipping: chosen?.price ?? 0 });
  return { shipping, chosen, totals };
}
