---
title: Selling things
description: "Products with options such as size and color, stock, the cart and checkout. A preview."
sidebar:
  order: 8
---

:::note[Preview]
The shop is being built. Products, options, stock, the cart and checkout (paying, shipping, pickup and
tax) and orders work now. Discount codes come next.
:::

If your site has a shop, products appear under **Content**, **Products**, and on your site at `/shop/`.
(If you don't see **Products** under **Content**, the shop is turned off; an admin can turn it on under
**Settings**, **Shop**.)

## Adding a product

1. Click **Content**, then **Products**, then **New Product**.
2. Give it a **Title** in the right-hand panel.
3. Add a **Featured image** and an **Excerpt**: they show beside the price on its page and in the shop.
4. Describe it on the page itself, as with any page.
5. Under **Shop**, give it a **Price**. Add a **Compare-at price** to show a higher price struck
   through (a sale).
6. Click **Publish**.

![A product's Shop settings](../../../assets/guide/shop-product-settings.png)

A product without a price isn't for sale. The other settings under **Shop**:

- **SKU** and **Weight**: for your records, and later for shipping by weight.
- **Shipped**: untick it for things nobody posts, such as a class or a gift card.
- **Pickup only**: collected, never posted.
- **Taxed**: untick it for things you don't charge tax on.
- **Most per order**: leave it empty for no limit.
- **Members** (when your site has Members turned on): for each member level, what they pay: The usual
  price, A percent off, or A price of their own. Members never pay more than the usual price.
  **Members only** limits who may buy it, with the levels that may. The product's page says what
  members save or pay and that it is for members, with a link to sign in; for anyone who isn't one of
  those members, the button says **Members only**. The cart charges signed-in
  members their price.
- A variant can have its own price for each member level too. Left empty, it uses the product's member
  pricing.

## Sizes, colors and other options

Under **Options**, click **Add an option**, name it (**Size**) and type its values with commas between
them (**S, M, L**). Add up to three options. Each combination becomes a **variant** (S / Olive,
M / Olive...), listed under **Variants**.

Open a variant to give it its own **Price**, **SKU**, **Weight** or **Image** (shown when a visitor
picks it). Left empty, it uses the product's. Tick **Not sold** for a combination that doesn't exist.
**Every variant's price** and **Every variant's stock** set them all at once.

## Stock

Tick **Count stock** to keep count of what you have. Type how many are **In stock** (on each variant,
when the product has options). Stock saves as soon as you leave the box, without saving the product:
nobody's other changes to the product can overwrite it. Leave **Count stock** unticked for no limit.

On the site, what has run out says **Sold out** and can't be added to the cart.

## On the site

A product's page shows its options, price and **Add to cart**.

![A product's page with its options and Add to cart](../../../assets/guide/shop-product-page.png)

The cart is at `/cart/`. Visitors change quantities or remove things there; it never takes more than
you have in stock.

![The cart](../../../assets/guide/shop-cart.png)

## Product categories

Products come with **Product categories**, a taxonomy of their own: tick a product's categories in its
settings, and manage them under **Content**, **Taxonomies**, **Product categories**. Categories can sit
under other categories. Each has its own page at `/shop/category/<address>/`, listing its products,
and the shop at `/shop/` has filters by category.

When your site has Members turned on, a category can take a percent off for members:

1. Click **Content**, then **Taxonomies**, then **Product categories**.
2. Click **Details** beside the category.
3. Under **Member pricing**, type the percent off for each member level.
4. Click **Save**.

The discount applies to every product in the category and in the categories under it. A product's own
member pricing comes first; a product in several categories takes the largest discount.

## Checkout

Under the cart, visitors check out:

1. They give their name, email and, if they like, a phone number.
2. They choose how to get the order: one of your shipping rates for their country (and state, in the US),
   or a pickup location. Only rates that fit their order are offered.
3. For shipping, they give their address.
4. They see the shipping, tax and total, and click **Pay**. Payment is on Stripe's or Square's own page.
5. They come back to a page with their order, and get a receipt by email.

Each order is emailed to the site's admin address too (or the address set as `SHOP_NOTIFY_EMAIL`), and
listed under **Orders**.

What someone is paying for is put aside while they pay, so two people can't buy the last one. If they
don't pay within the time set under **Settings**, **Shop**, it goes back on sale. Stock comes off the
count once an order is paid.

An order with nothing to pay (everything free) is placed at once, without the payment page.

## Orders

Click **Orders** in the admin bar (it shows while the shop is on). The tabs:

- **To send or hand over**: paid orders still to ship or to be picked up.
- **Paid**, **Awaiting payment**, **Cancelled and expired**, **Refunded** and **All orders**.

Search by order number, email or name. **Export CSV** downloads the orders shown, a row for each item.

Click an order to see what was bought, the totals, the buyer, where it goes and the payment. On its page:

- **Mark shipped and email the buyer**: type the tracking number first, if there is one. The buyer gets an
  email saying it is on its way.
- **Mark picked up**: for an order collected from a pickup location.
- **Notes**: for the shop only; the buyer never sees them.
- **Resend confirmation**: emails the buyer their receipt again.
- **Refund** (admins): type how much to give back, all or part. The money goes back to their card through
  Stripe or Square. Refunding all of it marks the order refunded.
- **Cancel order**: for an order that wasn't paid for, or one with nothing left to pay back (free, or
  refunded in full).
- **Put back in stock**: for each item, how many go back on the shelf. Fill these in before you refund or
  cancel and they go back at the same time, or use **Put back in stock only**. An item can't go back more
  times than it was bought.

A refund made in Stripe's or Square's own dashboard shows on the order too, but puts nothing back in
stock: do that on the order's page.

## Blocks for the shop

In the page editor, under **Shop**:

- **Add to cart**: on a product's page it sells that product; anywhere else, choose one in its settings.
- **Product price**: the price, or "From" the lowest when variants differ.
- **Cart**: the cart itself. Your `/cart/` page shows it on its own; a page you make with that address
  needs this block.
- **Cart link**: a link to the cart with the number of things in it, for the header.

Collections can show products with the **Product: image, name and price** card.

## Turning the shop on

**Settings**, **Shop** (admins): tick **Shop on**, choose the **Currency** and the unit **Weights** are
in, and click **Save settings**. Turning it on the first time adds three templates under **Templates**:
**Product** (a product's page), **Shop** (the `/shop/` listing) and **Product category** (a category's
page). Change them like any template.
Turning the shop off deletes nothing; products are hidden until it is on again.

While the shop is on, the same screen sets up checkout.

**Payments**:

- **Payments go through**: Stripe or Square, when both are connected under **Settings**, **Connections**.
- **Minutes an unpaid order holds its stock**: 30 to 120 (60 if left empty).

**Shipping**: click **Add a shipping zone**, name it, and add the places it covers (a country, a US
state, or **Everywhere else**). Zones are checked in order: the first that names the buyer's country or
state gives its rates, and **Everywhere else** is used only when no zone names it. Without it, other
addresses can't be shipped to. Each zone's rates:

- **Name**: what the buyer sees, such as Standard or Express.
- **Price**: One price, By the order's subtotal, or By the order's weight. By subtotal or weight, add
  bands, each with a **From**, an **Up to** (empty: no limit) and a **Price**. An order that falls in no
  band isn't offered the rate.
- **Free when the subtotal is at least**: leave empty for never.

**Pickup**: click **Add a pickup location** for each place buyers can collect from:

- **Name**, **Address** and **Hours**: shown to the buyer.
- **Fee**: empty for free.
- **Where it is, for tax**: the country or state whose tax rate applies.

**Tax**:

- **Tax is**: Worked out from the rates here, or Worked out by Stripe Tax (only when payments go through
  Stripe; turn Stripe Tax on in Stripe first).
- **Store's tax rate (%)**: used where no other rate applies.
- **Rates for places**: a rate for a country or US state, replacing the store's. A state's rate wins
  over its country's.
- **Tax shipping too**: on or off.

Each product's **Taxed** switch decides whether it is taxed. The shop adds the tax you set up; it
doesn't register for or file tax for you.
