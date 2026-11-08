---
title: Members
description: "Turning members on, membership levels, how people join, and adding, approving and removing members."
sidebar:
  order: 6.5
---

Members are people with an account on your site who can see members-only pages and blocks and pay member
prices. They can't get into the admin screens. Editors decide what is members only (see
[Members](/editors/members/) in the Editor guide); this page covers who is a member.

## Settings > Members

Open **Settings** (the gear), then **Members** under **Features**. Change what you need and press
**Save settings**.

- **Members on**: turns on members-only pages and blocks, the account page (`/account/`) and **Members**
  under **People** in the top bar. Turned off, nobody counts as a member, and nothing is deleted.
- **Levels**: the kinds of membership, such as **Friend** and **Patron**. Editors tick levels when they
  choose who may see something; ticket types and products can have a price for each.
- **Sign-ups**:
  - **Admins add members**: only you add people.
  - **Sign up, then approved**: visitors create an account on the account page and wait for you to
    approve them.
  - **Sign up and join**: visitors join at once.
- **Level for sign-ups**: the level people get when they sign up.
- **Message for visitors who can't see members-only things**: shown in place of members-only content,
  with a sign-in link.

People who sign up confirm their email address first, from a link the site emails them.

## The Members screen

Click **People** in the top bar, then **Members**. The tabs:

- **All**.
- **Waiting for approval**: listed first.
- **Active**.
- **Expired**: active, but past the date their membership ends.
- **Suspended**: can't see members-only things until you make them active again.

Search by name or email. For each member you can change their **Level**, **Status**, the date their
membership ends (**Expires**, empty: never) and **Notes**, then press **Save**.

Each member's actions:

- **Approve**: for someone waiting for approval.
- **Resend invitation**: to someone you added who hasn't set a password yet.
- **Send password link**: emails them a link to set a new password.
- **Remove**: ends their membership. Their account goes too, unless they also edit the site.

## Adding a member

1. Under **Add a member**, fill in their **Email**, **Name**, **Level** and, if their membership ends,
   **Expires**.
2. Press **Add a member**.

Someone who already has an account joins at once. Anyone else is emailed an invitation to set a
password on the account page. Invitations last 7 days; **Resend invitation** sends a new one.

## Good to know

- Members aren't synced between copies of the site or backed up: accounts belong to each copy. The
  levels are synced, with the other settings.
- Members never appear on the **Users** screen, which lists the people who look after the site.
