// The shop's blocks (Settings > Shop, src/lib/shop/config.ts): a product's price, Add to cart (its
// options, quantity and button), the cart, and a cart link with the number of items. The cart is kept
// in the visitor's browser (public/assets/js/cart.js), so pages with these blocks stay cached and
// shared: the script adds to the cart, fills the cart from the server's prices (POST /api/shop/quote)
// and corrects what's left from GET /api/shop/availability, since a cached page can be a minute old.
import type { Env, Renderer } from '../env';
import type { Entry } from '../../lib/types';
import { esc } from '../html';
import { attrs, escAttr, styleDecls } from './style';
import { formatMoney } from '../../lib/payments/money';
import { downsize, mediaUrl } from '../../lib/media/image';
import { CART_PATH, categoryDiscounts, maxQuantity, priceRange, productOf, sellable, shopSettings, unitFor, type Product } from '../../lib/shop/config';
import { leftOf, type StockMap } from '../../lib/shop/stock';
import { ARCHIVE_PATHS } from '../../lib/site';
import { ACCOUNT_PATH, memberSettings } from '../../lib/members/config';
import { carrierProblem, checkoutSettings, DEFAULT_NEWS_LABEL } from '../../lib/shop/checkout-settings';
import { mailingOn } from '../../lib/mailing/config';
import { carrierName, trackingLink, TRACKING_WORDS } from '../../lib/shop/tracking';
import { COUNTRY_CODES, ELSEWHERE, placeName, US_STATES } from '../../lib/shop/places';
import type { ShopOrder } from '../../lib/shop/orders';

/** Where the server's hook keeps the order a cart page shows (?order=<token>; src/lib/shop/page-data.ts). */
export const ORDER_KEY = 'shop-order';

/** Where prepare keeps the stock of the products on the page. */
export const STOCK_KEY = 'shop-stock';
export const CART_SCRIPT = '<script src="/assets/js/cart.js" defer></script>';

/** A JSON value in an attribute (every & escaped, so text that looks like an entity stays as it is). */
const jsonAttr = (v: unknown) => JSON.stringify(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const root = (a: Record<string, any>, base: string[]) => attrs([...base, a.className], styleDecls(a.style), { id: a.anchor });
const note = (env: Env, text: string) => (env.ctx.editor ? `<div class="cms-editor-note">${esc(text)}</div>` : '');

/** The product a block shows: the one it names, else the entry in context (a product's page, a card). */
function productEntry(b: { attrs: Record<string, any> }, env: Env): Entry | undefined {
  const id = Number(b.attrs.product) || 0;
  const e = id ? env.ctx.loader.entries.get(id) : (env.post ?? undefined);
  return e?.type === 'product' ? e : undefined;
}

const currency = (env: Env) => shopSettings(env.ctx.settings.site).currency;

/** A price, struck through beside its compare-at price when that is higher. */
function priceHtml(price: number, compareAt: number | null | undefined, cur: string): string {
  const was = compareAt && compareAt > price ? `<s class="c-price__was">${esc(formatMoney(compareAt, cur))}</s> ` : '';
  return `${was}<span class="c-price__now">${esc(formatMoney(price, cur))}</span>`;
}

/**
 * What members get, under Add to cart's price: "Members save 10%", "Members pay $15.00" (from the lowest
 * when variants differ; by level when levels differ) and "For members only", with a sign-in link. The
 * same for everyone, so the page stays cached; the cart charges a member their price. Nothing while
 * Members is off.
 */
function memberNote(p: Product, e: Entry, env: Env): string {
  const m = memberSettings(env.ctx.settings.site);
  if (!m.enabled) return '';
  const cur = currency(env);
  const variants = sellable(p);
  // Its categories' discounts (their terms loaded by prepare).
  const fromCategories = categoryDiscounts(e.term_ids, env.ctx.loader.terms);
  // What each level gets, in words.
  const deals = m.levels
    .map((l) => {
      const member = { level: l.id, status: 'active' };
      const fixed = p.memberPrices?.[l.id] != null || variants.some((v) => v.memberPrices?.[l.id] != null);
      if (fixed) {
        const units = variants.map((v) => unitFor(p, v, member, fromCategories));
        const low = Math.min(...units);
        if (!variants.length || units.every((u, i) => u >= variants[i].price!)) return null;
        return [l, `pay ${units.every((u) => u === low) ? '' : 'from '}${formatMoney(low, cur)}`] as const;
      }
      const pct = p.memberDiscounts?.[l.id] || fromCategories?.[l.id];
      return pct ? ([l, `save ${pct}%`] as const) : null;
    })
    .filter((d): d is NonNullable<typeof d> => !!d);
  const parts: string[] = [];
  if (deals.length) {
    const same = deals.length === m.levels.length && deals.every(([, t]) => t === deals[0][1]);
    parts.push(same ? `Members ${deals[0][1]}` : deals.map(([l, t]) => `${l.name} members ${t}`).join(', '));
  }
  const name = (id: string) => m.levels.find((l) => l.id === id)?.name ?? id;
  if (p.membersOnly) parts.push(p.levels?.length ? `For ${p.levels.map(name).join(' and ')} members only` : 'For members only');
  if (!parts.length) return '';
  return `<p class="c-price__members">${esc(parts.join('. '))}. <a href="${ACCOUNT_PATH}">Sign in</a></p>`;
}

/** The product's price: one price, or "From" the lowest of its variants' when they differ. */
const productPrice: Renderer = (b, env) => {
  const e = productEntry(b, env);
  if (!e) return note(env, 'Product price: shows the price of the product whose page or card it is in, or of the product chosen in its settings.');
  const p = productOf(e.fields);
  const range = p ? priceRange(p) : null;
  if (!p || !range) return note(env, 'This product has no price yet (its settings, under Shop).');
  const cur = currency(env);
  const same = range.min === range.max;
  // Its compare-at price shows when every variant sells at the one price.
  const compareAt = same ? sellable(p)[0]?.compareAt : null;
  const html = same ? priceHtml(range.min, compareAt, cur) : `From <span class="c-price__now">${esc(formatMoney(range.min, cur))}</span>`;
  return `<p ${root(b.attrs, ['c-price', 'c-product-price'])} data-product="${e.id}">${html}</p>`;
};

/** A variant as the script needs it: its values, price, image and what is left. */
function variantData(env: Env, e: Entry, p: Product, stock: StockMap | undefined) {
  return sellable(p).map((v) => {
    const m = v.image ? env.ctx.loader.media.get(v.image) : undefined;
    return {
      id: v.id,
      values: v.values,
      price: v.price,
      compareAt: v.compareAt,
      image: m ? mediaUrl(downsize(m, 'large').path) : null,
      // A product whose stock wasn't read (a card in a list): as many as an order takes, until the script asks.
      left: maxQuantity(p, stock?.has(e.id) ? leftOf(p, stock.get(e.id), v.id) : null),
    };
  });
}

/** Add to cart: the product's options as choices, a quantity and the button. */
const addToCart: Renderer = (b, env) => {
  const e = productEntry(b, env);
  if (!e) return note(env, 'Add to cart: on a product\'s page (or its card) it sells that product; elsewhere, choose one in its settings.');
  const p = productOf(e.fields);
  const variants = p ? variantData(env, e, p, env.ctx.data.get(STOCK_KEY) as StockMap | undefined) : [];
  if (!p || !variants.length) return note(env, 'This product has nothing for sale yet: give it a price in its settings, under Shop.');
  const a = b.attrs;
  const cur = currency(env);
  // The first variant that is left, chosen to begin with.
  const first = variants.find((v) => v.left > 0) ?? variants[0];
  const id = `c-cart-${e.id}-${String(b.id ?? '').replace(/[^\w-]/g, '')}`;
  const choices = p.options
    .map((o, i) => {
      const values = o.values.filter((val) => variants.some((v) => v.values[i] === val));
      // The first variant left is chosen by the script (data-value): the canvas, rendered by React, takes no `selected`.
      return `<label class="c-add-to-cart__option"><span>${esc(o.name)}</span><select name="option-${i}" data-value="${escAttr(first.values[i] ?? '')}">${values.map((val) => `<option value="${escAttr(val)}">${esc(val)}</option>`).join('')}</select></label>`;
    })
    .join('');
  const label = String(a.label || 'Add to cart');
  const soldOut = first.left <= 0;
  const qty = a.showQuantity === false ? '<input type="hidden" name="quantity" value="1">' : `<label class="c-add-to-cart__quantity"><span>Quantity</span><input type="number" name="quantity" value="1" min="1" max="${Math.max(1, first.left)}" inputmode="numeric"></label>`;
  return (
    `<form ${root(a, ['c-add-to-cart'])} id="${id}" data-add-to-cart data-product="${e.id}" data-title="${escAttr(e.title)}" data-currency="${escAttr(cur)}" data-variants="${jsonAttr(variants)}" data-label="${escAttr(label)}" data-cart-path="${CART_PATH}"${Number(a.product) ? '' : ' data-own'}>` +
    (choices ? `<div class="c-add-to-cart__options">${choices}</div>` : '') +
    `<p class="c-price c-add-to-cart__price">${priceHtml(first.price!, first.compareAt, cur)}</p>` +
    memberNote(p, e, env) +
    `<div class="c-add-to-cart__row">${qty}<button type="submit" class="c-shop-button c-add-to-cart__button"${soldOut ? ' disabled' : ''}>${esc(soldOut ? 'Sold out' : label)}</button></div>` +
    `<p class="c-add-to-cart__status" role="status" aria-live="polite"></p>` +
    `<noscript><p class="c-add-to-cart__status">The cart needs JavaScript, which is off in this browser.</p></noscript>` +
    `</form>`
  );
};

/**
 * What the checkout form offers (data-checkout): the countries the shipping zones cover (every one when a
 * zone covers everywhere else), US states, and the country to begin on.
 */
function checkoutOffer(env: Env) {
  const c = checkoutSettings(env.ctx.settings.site?.shop);
  const places = c.zones.flatMap((z) => z.places);
  // With a carrier's live rates on, any country (the carrier says whether it ships there).
  const codes = places.includes(ELSEWHERE) || (c.carrier.rates && !carrierProblem(c.carrier)) ? COUNTRY_CODES : [...new Set(places.map((p) => p.split('-')[0]))];
  const countries = codes.map((code): [string, string] => [code, placeName(code)]).sort((x, y) => x[1].localeCompare(y[1]));
  // The Email me news tick's words, while Mailing is on and lists are chosen for it.
  const news = mailingOn(env.ctx.settings.site) && c.news.lists.length ? c.news.label || DEFAULT_NEWS_LABEL : undefined;
  // Live carrier rates, which need the buyer's ZIP code first.
  const carrier = c.carrier.rates && !carrierProblem(c.carrier);
  const first = places.find((p) => p !== ELSEWHERE)?.split('-')[0] ?? (carrier ? c.carrier.from.country : undefined);
  return { countries, states: US_STATES.slice(), country: first ?? countries[0]?.[0] ?? '', pickup: c.pickup.length > 0, ...(news ? { news } : {}), ...(carrier ? { carrier: true } : {}) };
}

/** A buyer's order, as the cart's page shows it after checkout (paid, being confirmed, or not completed). */
function orderView(o: ShopOrder, a: Record<string, any>): string {
  const money = (n: number) => esc(formatMoney(n, o.currency));
  const heading =
    o.status === 'paid' || o.status === 'refunded'
      ? `<h2 class="c-order__heading">Thank you, ${esc(o.name)}</h2><p>Your order <strong>${esc(o.code)}</strong> is confirmed. We've emailed a receipt to ${esc(o.email)}.</p>`
      : o.status === 'pending'
        ? `<h2 class="c-order__heading">Confirming your payment</h2><p>Order <strong>${esc(o.code)}</strong> is waiting for the payment to come through. This page shows it once it has; reload in a moment.</p>`
        : `<h2 class="c-order__heading">This order wasn't completed</h2><p>Order <strong>${esc(o.code)}</strong> wasn't paid for, so nothing was charged. Your cart is as you left it.</p>`;
  const rows = o.lines
    .map((l) => `<tr><td class="c-cart__item">${esc(l.title)}${l.label ? `<small>${esc(l.label)}</small>` : ''}</td><td>${l.quantity}</td><td class="c-cart__total">${money(l.total)}</td></tr>`)
    .join('');
  const totals = [
    o.discount ? [`Discount${o.discount_code ? ` (${esc(o.discount_code)})` : ''}`, `−${money(o.discount)}`] : null,
    o.shipping ? [`${o.shipping.kind === 'pickup' ? 'Pickup' : 'Shipping'}: ${esc(o.shipping.name)}`, o.shipping_total ? money(o.shipping_total) : 'Free'] : null,
    o.tax ? ['Tax', money(o.tax)] : null,
    ['Total', `<strong>${money(o.total)}</strong>`],
  ]
    .filter((x): x is string[] => !!x)
    .map(([k, v]) => `<p class="c-cart__subtotal"><span>${k}</span> <span>${v}</span></p>`)
    .join('');
  const where =
    o.fulfilment === 'pickup' && o.shipping
      ? `<div class="c-order__where"><h3>Pick up at ${esc(o.shipping.name)}</h3><p>${esc(o.shipping.address ?? '').replace(/\n/g, '<br>')}${o.shipping.hours ? `<br>${esc(o.shipping.hours)}` : ''}</p></div>`
      : o.address
        ? `<div class="c-order__where"><h3>Shipping to</h3><p>${[o.name, o.address.line1, o.address.line2, [o.address.city, [o.address.state, o.address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), placeName(o.address.country)].filter(Boolean).map((x) => esc(String(x))).join('<br>')}</p></div>`
        : '';
  // A shipped order's tracking: the carrier's own page for the number, and its latest news.
  const link = o.fulfilled === 'shipped' && o.tracking ? (o.carrier ? trackingLink(o.carrier, o.tracking) : '') : '';
  const sent =
    o.fulfilled === 'shipped'
      ? `<div class="c-order__tracking"><h3>${o.delivered_at ? 'Delivered' : 'On its way'}</h3><p>${o.tracking ? `${o.carrier ? `${esc(carrierName(o.carrier))} ` : ''}tracking ${link ? `<a href="${escAttr(link)}" rel="noopener nofollow">${esc(o.tracking)}</a>` : esc(o.tracking)}` : 'Your order has been sent.'}${o.tracking_status && !o.delivered_at ? `<br>${esc(o.tracking_status.details || TRACKING_WORDS[o.tracking_status.status] || '')}` : ''}</p></div>`
      : '';
  // A paid order's downloads (src/lib/shop/downloads.ts), each counted and limited where it is served.
  const files = o.status === 'paid' ? o.lines.flatMap((l, i) => (l.download ? [[i, l.download.name] as const] : [])) : [];
  const downloads = files.length
    ? `<div class="c-order__downloads"><h3>Your downloads</h3><ul>${files.map(([i, name]) => `<li><a class="c-order__download" href="/api/shop/download?order=${escAttr(encodeURIComponent(o.token))}&amp;line=${i}" rel="nofollow">${esc(name)}</a></li>`).join('')}</ul></div>`
    : '';
  return (
    `<div ${root(a, ['c-cart', 'c-order', `is-${o.status}`])} data-cart data-order="${escAttr(o.status)}">` +
    heading +
    `<table class="c-cart__table"><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Total</th></tr></thead><tbody>${rows}</tbody></table>${totals}${sent}${downloads}${where}` +
    `</div>`
  );
}

/** The cart: filled in the visitor's browser from the cart it keeps and the server's prices, with the checkout below it. */
const cart: Renderer = (b, env) => {
  const a = b.attrs;
  const order = env.ctx.data.get(ORDER_KEY) as ShopOrder | undefined;
  if (order) return orderView(order, a);
  const shop = ARCHIVE_PATHS.product ?? '/';
  const empty = String(a.empty || 'Your cart is empty.');
  // The canvas runs no scripts: a sample of what visitors see.
  const sample = env.ctx.editor
    ? `<div class="cms-editor-note">The cart: the products a visitor has added, their quantities and the subtotal, then the checkout (their details, shipping or pickup, tax and Pay). Sample lines below.</div><table class="c-cart__table"><tbody><tr><td class="c-cart__item">Sample product<br><small>Large / Blue</small></td><td>${esc(formatMoney(2000, currency(env)))}</td><td>2</td><td>${esc(formatMoney(4000, currency(env)))}</td></tr></tbody></table>`
    : '<p class="c-cart__loading">Loading your cart…</p>';
  return (
    `<div ${root(a, ['c-cart'])} data-cart data-currency="${escAttr(currency(env))}" data-empty="${escAttr(empty)}" data-shop="${escAttr(shop)}" data-checkout="${jsonAttr(checkoutOffer(env))}"${env.ctx.queried.url.searchParams.get('checkout') === 'cancelled' ? ' data-cancelled' : ''}>` +
    `<div class="c-cart__body" aria-live="polite">${sample}</div>` +
    `<noscript><p>The cart needs JavaScript, which is off in this browser.</p></noscript>` +
    `</div>`
  );
};

/** A link to the cart with the number of items in it (set in the browser, so pages stay shared). */
const cartLink: Renderer = (b) => {
  const a = b.attrs;
  const label = String(a.label || 'Cart');
  return `<a ${root(a, ['c-cart-link'])} href="${CART_PATH}" data-cart-link><span class="c-cart-link__label">${esc(label)}</span> <span class="c-cart-link__count" data-cart-count hidden>0</span></a>`;
};

export const SHOP_RENDERERS: Record<string, Renderer> = {
  'product-price': productPrice,
  'add-to-cart': addToCart,
  cart,
  'cart-link': cartLink,
};
