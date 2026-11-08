---
title: Donations
description: "Putting a Donate form and a fundraising progress bar on your pages, and what donors see."
sidebar:
  order: 9.5
---

Donations let people give to your organization from your site, once or every month. You place a
**Donate** block on a page; donors choose an amount, fill in their name and email and pay on a secure
page from your payment provider (Stripe or Square). They get a receipt by email straight away.

Editors put the Donate and Donation progress blocks on pages and can see every gift under **Donations**
in the top bar. Refunds, cancelling a monthly gift and the settings (amounts, fees, receipts, goals and
emails) are for admins (see [Donations](/admins/donations/) in the Admin guide).

:::note
Donations are a feature an admin turns on under **Settings**, **Donations**. If you don't see
**Donations** in the top bar, or a **Donations** group in the page editor's blocks, the feature is off
(see [Turning features on](/admins/features/#donations)).
:::

## The donation page

Your site has a donation page at `/donate/` as soon as donations are on: a heading and a Donate block.
To design your own, make a page with the address `donate` and put a Donate block on it. Keep a Donate
block on that page: monthly donors' receipts link there to change or cancel their gift.

## Adding a Donate form to a page

1. Open the page in the page editor.
2. In **Blocks**, open **Donations** and drag **Donate** onto the page.
3. Click the block and change its settings in the panel on the right (all of them are optional).
4. Save and publish the page as usual.

The Donate block's settings:

- **Heading**: a heading above the form.
- **Text**: a sentence or two under the heading.
- **Amounts**: the amounts offered, separated by commas, such as `25, 50, 100`. Empty: the amounts under
  Settings > Donations.
- **Chosen at first**: which amount is picked when the page opens.
- **Offer monthly gifts**: shows **Give once** and **Monthly** above the amounts.
- **Starts on**: **Give once** or **Monthly**.
- **Cover the fees ticked at first**: ticks the box that adds the payment fees to the gift.
- **Ask for a dedication**: shows the **In honor or memory of** field.
- **Counts towards**: a fundraising goal. Gifts made with this form add to its total.
- **Button**: the button's words (default **Donate**). The amount is added after them as donors choose.
- **Thank-you heading** and **Thank-you text**: shown after the donor pays.
- **Form style**: the form's colors, field and button shapes, as for other forms.

## What donors see

1. They choose **Give once** or **Monthly**, then an amount, or **Other** and type their own.
2. If your site offers it, they can tick **Add $… to cover the payment fees**, so all of their gift
   reaches you.
3. They fill in their name and email, and, if offered, a dedication, **Don't show my name if gifts are
   listed publicly**, and a tick to get your email news.
4. They press the button and pay on Stripe's or Square's page.
5. They come back to the same page, which thanks them by name. Their receipt arrives by email.

If they press **Back** on the payment page instead, the form says their gift wasn't completed and that
they weren't charged.

Monthly donors get a receipt each month with a link to change or cancel their gift. That link opens the
donation page showing their gift, with **Update your card** and **Cancel my monthly gift**.

## Showing a goal's progress

The **Donation progress** block shows how much a fundraising goal has raised, against its target, as a
bar. Goals are made by admins under Settings > Donations.

1. In **Blocks**, open **Donations** and drag **Donation progress** onto the page.
2. Choose its **Goal**.

Its settings:

- **Goal**: which goal it shows.
- **Heading**: empty, the goal's name.
- **Show how many donors**.
- **Show the percent**.
- **Button label** and **Button link**: a button under the bar, such as **Donate** linking to `/donate/`.
  No link, no button.

The total counts paid gifts made towards the goal between its dates, less refunds, and not the fees
donors covered. It updates within a minute of a gift.

## The Donations screen

Click **Donations** in the top bar to see what has come in:

- **Totals**: what was raised, how many gifts and donors, monthly donors now and what they give each
  month, and the fees donors covered, over the last 7, 30, 90 or 365 days.
- **Goals**: each goal's total and donors, with its bar.
- **By campaign**: gifts that came from a campaign link (see [Stats](/editors/stats/)).
- The tabs list gifts: **Paid**, **Monthly donors**, **Not completed** (donors who didn't finish paying),
  **Refunded** and **All**. Search by receipt number, email or name, or pick a goal.
- **Export CSV** downloads the gifts in the tab.

Click a gift's receipt number to see it, and **Resend receipt** if a donor asks for their receipt again.
