---
title: Shop (preview)
description: Products with options, variants and stock, a cart kept in the browser, the server's quote, checkout and orders.
sidebar:
  order: 12
---

The shop is optional and is being built in phases. Phase 1: products, options and variants, stock, the
shop's blocks and the cart. Phase 2 so far: checkout settings, shipping, pickup, tax, member pricing,
checkout and orders, the Orders screen, discounts, the order emails in the email builder, Shop > Stats, and orders, stock and discounts in sync and backups.
Phase 3: the Stock screen, low-stock alerts, digital downloads, and Shippo for live carrier rates, labels
and tracking.

Turn it on under **Settings > Shop** (admins). It brings the `product` type under Content, product pages,
the shop at `/shop/`, product categories, the cart at `/cart/` and the shop blocks.

## Products

The core supplies the `product` type and the `product_category` taxonomy (`src/lib/shop/types.ts`). A
site changes them with `shop` in `src/site/config.ts` (`product` takes any type option plus `fields`;
`category` the taxonomy's options), or lists its own `product` type, which it keeps whole and which stays
shown while the shop is off.

What a product sells is in its fields under the reserved key `shop` (`src/lib/shop/config.ts`):

| Setting | |
| --- | --- |
| `price`, `compareAt` | In cents. No price: not for sale. |
| `sku`, `weight` | Weight in the unit chosen under Settings > Shop. |
| `ships`, `pickupOnly`, `taxable` | For checkout. |
| `maxPerOrder` | Empty: 99. |
| `trackStock` | Off: no limit. |
| `options` | Up to 3, each with a name and values. |
| `variants` | One per combination: a stable `id`, its `values`, and its own price, compare-at price, SKU, weight and image (media id), sale price and members' sale prices, or `off`. |
| `gallery` | Media ids shown after the featured image by the Product gallery block; at most 30. |
| `sale` | `start` and `end` (ISO, either open), `price` or `percent` off, and members' `memberPrices` or `memberDiscounts` by level. |

A product with no options has one variant, `default`. Changing the options keeps each variant whose
values stay (its id, price and stock), adds the new combinations and drops the rest.

While a sale runs (`saleRuns`), `resolveVariant` gives a variant its sale price as `price` when it is
lower, with the usual price as `regular` and struck through (`compareAt`), so the blocks, the quote and
checkout all charge it. `unitFor` gives a member the lowest of their member price, their sale price and
the sale price.

## Stock

Counts are in the `shop_stock` table (product, variant, on hand), apart from the product's fields, so
saving a product never overwrites a count. The product's settings save each count as it changes.

## The cart

The cart is kept in the visitor's browser (`localStorage`, `public/assets/js/cart.js`), so pages with shop
blocks stay cached and shared. The script:

- adds to the cart from **Add to cart**, offering what's left of each combination
- asks `GET /api/shop/availability?ids=` what's left, since a cached page can be a minute old
- fills the **Cart** block from `POST /api/shop/quote`, the server's prices (`quoteCart`,
  `src/lib/shop/cart.ts`): lines no longer sold are dropped, quantities are cut to what's left

Both endpoints read as the visitor sees the site (members-only products only for their members) and
answer 404 while the shop is off.

## Blocks

`product-price`, `add-to-cart`, `shop-gallery`, `cart` and `cart-link` (`src/render/c/shop.ts`),
offered in the editor's **Shop** category while the shop is on and rendering nothing while it is off. The
Product gallery shows the featured image, the `gallery` and the variants' own pictures
(`productImages`), with `public/assets/js/shop-gallery.js` switching them and following the variant
chosen in Add to cart (`c-product:variant`). The product card design
(`product`) is added to the site's cards unless the site has its own.

## Templates

Turning the shop on the first time makes `single-product` and `archive-product` if they aren't there
(`src/lib/shop/templates.ts`); `npm run seed` does the same while the shop is on. The cart is a built-in
page at `/cart/` unless a page has that address.

## Checkout and orders

`cart.js` builds the Cart block as a two-column checkout: on the left the form (Contact, Delivery with the
country and state, Shipping method, Payment with Pay), on the right the order summary (each line's
picture with its quantity, the discount code and the totals), which comes first and folds behind **Show
order summary** below 900px. The shipping and pickup options come from `POST /api/shop/quote` (sent with
`destination` and `option`, it answers `shipping`, `chosen` and `totals` too: `src/lib/shop/totals.ts`).
The quote names a product's download but never its stored path.

With Stripe Tax chosen, Settings > Shop asks Stripe whether Stripe Tax is active
(`GET /api/admin/shop/stripe-tax`) and warns while it isn't, since Stripe refuses those checkouts.

`POST /api/shop/checkout` (`startShopCheckout`, `src/lib/shop/orders.ts`) prices the cart again, checks
the option and address, and makes the order in `shop_orders` with `shop_order_create`
(`src/lib/db/functions.ts`): one statement that inserts it only if every line whose stock is counted has
that many left and the buyer is within their share of unpaid orders, so two checkouts can't both take the
last one. Then the provider's hosted checkout (`src/lib/payments`), or paid at once when there's nothing
to pay.

| Step | Where |
| --- | --- |
| The buyer comes back | `GET /api/shop/return?order=<token>`: the payment asked of the provider |
| The provider's webhook | `/api/payments/<provider>`, `shopWebhook` |
| Paid | `markShopPaid`: once; `shop_take_stock` takes the counted lines off `shop_stock`; the emails |
| Not paid in time | the hourly run, `expireShopHolds` |
| The order's page | `/cart/?order=<token>`, never cached |

What's left of a variant (`loadStock`, `src/lib/shop/stock.ts`) is on hand less what orders hold:
unexpired holds and paid orders whose stock isn't taken off yet.

## The Orders screen

`/admin/shop/` (`src/pages/admin/shop/`): orders by tab and search (`ordersQuery`), CSV
(`/api/admin/shop/orders.csv`), and each order's page with its actions through `POST
/api/admin/shop/orders`: `fulfil`, `note`, `status`, `resend`, `cancel`, `refund` (admins) and `restock`.
Lines go back in stock through `shop_restock`, which records each line's `restocked` in the statement that
checks it, so nothing goes back twice.

Each order's history is in `shop_order_events` (`src/lib/shop/history.ts`): placed, paid, every email with
its subject and recipients, fulfilment, labels, delivery, refunds, restocks, cancellations, expiry, status
changes and notes, each with who did it. The shop's own statuses (`settings.site.shop.statuses`,
`src/lib/shop/statuses.ts`) are set on an order's page (`shop_orders.custom_status`), can email the buyer
with a design from the email builder, and filter the Orders screen (`?status=`).

