---
title: Members
description: "Members-only pages and blocks, the sign-in and account page, and member prices for tickets and products."
sidebar:
  order: 9.6
---

Members are people with an account on your site who can see what you keep for them: members-only pages,
parts of pages, and member prices. They sign in on the site's account page; they can't get into the
admin screens.

Editors decide what is members only. Adding, approving and removing members, and the levels, are for
admins (see [Members](/admins/members/) in the Admin guide).

:::note
Members are a feature an admin turns on under **Settings**, **Members**. If a page's settings have no
**Members** section, or the page editor's blocks have no **Members** group, the feature is off (see
[Turning features on](/admins/features/#members)).
:::

## Levels

Your site can have several kinds of membership, called levels (such as **Friend** and **Patron**).
Wherever you choose who may see something, you can tick levels. None ticked means every member.

## Members-only pages

1. Open the page (or post, event or any entry) in the editor.
2. In its settings, open **Members**.
3. Turn on **Members only**.
4. If your site has several levels, tick the levels that may see it.
5. Publish. Like other settings, it takes effect when you publish.

Everyone else sees the page's title, excerpt and featured image with a sign-in link in place of its
content. Members-only pages are left out of lists, search and feeds for people who can't see them.
Editors always see them.

## Members-only parts of a page

To keep part of a page for members, use the **Members only** block (in **Blocks**, under **Members**)
and put blocks inside it. Members of the chosen levels, and editors, see what is in it. Everyone else
sees a message and a sign-in link, or nothing.

Its settings:

- **Members of (none ticked: any level)**.
- **Show nothing to everyone else**: no message, no sign-in link.
- **Message for everyone else**: empty, the message under Settings > Members.

## Signing in and the account page

Your site has an account page at `/account/` where members sign in, reset their password and (if your
site allows it) create an account. Signed in, it shows their name, level, status and when their
membership ends, with **Change password** and **Sign out**. With mailing lists on, members also choose
their lists there.

To design your own account page, make a page with the address `account` and put a **Member account**
block on it.

The **Member sign-in link** block (for a header or footer) links to the account page. It reads
**Sign in**, or **My account** once a member is signed in. Its settings:

- **Label**.
- **Label when signed in**.

## Member prices

- **Tickets**: in a ticket type's settings, under **Members**, set a price for each level, or turn on
  **Members only** so only members can buy it (see [Events and tickets](/editors/events-and-tickets/)).
- **Products**: in a product's **Shop** settings, under **Members**, set a percent off or a price of their
  own for each level, or **Members only** (see [Selling things](/admins/shop/)).

Everyone sees what members pay, with a sign-in link; signed-in members are charged their price.
