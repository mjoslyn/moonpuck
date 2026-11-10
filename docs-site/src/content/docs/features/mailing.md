---
title: Mailing
description: Mailing lists, campaigns and a weekly digest through Mailgun, with confirmed sign-ups, one-click unsubscribe, and clicks told apart into people's and mail scanners'.
sidebar:
  order: 8
---

Mailing is optional: turn it on under **Settings > Mailing Lists**. People sign up to your mailing lists (and
confirm by email), and you send them campaigns and a weekly digest through Mailgun from a marketing
subdomain. Each email's deliveries, opens and clicks are recorded. The site's other email (form
notifications, tickets) goes out as before, through Cloudflare Email Service or SMTP. Mailgun's setup is under
[Hosting](../../docs/hosting/#mailing).

## Settings

Under **Settings > Mailing Lists** (admins):

- **Sender**: the name and the address before `@` your Mailgun domain (default `news`), and where
  replies go.
- **Postal address**: every email shows it, as the law requires. Nothing is sent until it's there.
- **Consent wording** under sign-up forms, kept with each sign-up.
- **Lists offered to members** (with [Members](../members/) on).
- **Track links** and **UTM parameters** for new campaigns.
- **Pause sending when** spam complaints or bounces pass a rate (default 0.1% and 2%). The site checks
  this once a campaign has 500 deliveries. Then everything stops, digests included, and the admins are
  emailed. Sending stays stopped until an admin resumes it on the Mailing Lists screen.

## Lists and signing up

Add lists on the **Mailing Lists** screen (under People in the admin menu once Mailing is on), **Lists** tab: name,
description and Public, then **Add list**. Lists are for anyone, members or not. **View subscribers**
on each list shows who is on it. Sign-up forms and
the email preferences page offer **Public** lists. The others are for people you add yourself.

Put the **Subscribe** block (Mailing group in the block list) anywhere: email, an optional name, the
public lists to choose from when there are several, the consent wording and a button. The site also has
a page at **/subscribe/**. Every sign-up gets an email with a link to confirm, and nothing is sent until
they do. A sign-up never confirmed is deleted after 30 days. Admins can send the email again with
**Resend confirmation**, on the Subscribers tab or the person's page. One address gets at most 3
confirmation emails a day.

People manage their subscription from the links at the bottom of every email: **/email-preferences/**
(which lists) and **/unsubscribe/**. Mail apps' own one-click unsubscribe (Gmail, Yahoo, Apple Mail)
works too, at once. A page of your own with one of these addresses takes the built-in page's place. Put the
**Email preferences** block on it.

On the **Subscribers** tab, admins search and filter everyone (by status, list or tag). They see each
one's consent (where, when, the wording, confirmed when), lists, emails and clicks. They can
**Add a contact**, **Import a CSV** (email and name columns), **Add members to a list**, **Unsubscribe**,
**Erase** and **Export as CSV**. Adding or importing asks how those people agreed to get your email.
Adding skips anyone who unsubscribed, bounced, marked an email as spam or was erased. It also skips
anyone who unsubscribed from that list. They have to sign up themselves. Erasing deletes a contact (with
Mailgun's event log for the address) and keeps only a one-way hash of the address. So they're never
mailed again unless they sign up.

## Tags, fields and segments

Each person has a first and last name, and can have **tags** (farm, vip, trade show 2026) and
**fields** (town, business type). You set these on their page, give them when adding the person, or
take them from an import. An import reads a `tags` column (separated by `;` or `|`), and any other
column becomes a field.

Fields every contact can have are set under **Settings > Mailing Lists > Subscriber fields**: a name
and a type (text, number, date, or a choice of options). Each field:

- shows on every contact's page as its own input
- fills from an import column of the same name (a value that doesn't fit the type is left out)
- is offered in segments with its options
- is a merge tag (Town is `{town}`)

A Subscribe block can ask for first and last name and any of these fields, and tag the people who sign
up through it. A form only fills them in for someone new or not yet confirmed.

A **segment** (the **Segments** tab) picks some of the people on a campaign's lists, members or not.
While a scheduled, approved or sending campaign, or a digest that is on, uses a segment, only admins
can change its rules. Its
rules, all or any of which must match, can each be turned round:

- on a list
- tagged (any of some tags)
- a field filled in, equal to or containing a value
- a member (of some levels), while Members is on
- signed up, opened an email or clicked a link in the last so many days (clicks by people, not mail
  scanners)
- signed up from a page, form or import

Its page shows who matches now, with a count. Choose a segment on a campaign or digest. It then goes to
the people on its lists who match. A segment that a campaign or digest uses can't be deleted.

## Campaigns

**New campaign** on the Campaigns tab opens its editor. You can also use **Compose** in the admin bar,
then **Campaign**: say what the email is about, and Compose makes it as a draft and writes it. The
editor's **Compose** button writes the name, subject and email from a brief. It writes a heading,
sections of text with buttons, and optionally the latest entries and upcoming events. It keeps the
email's look, and you check and save the result. A campaign has:

- name, subject, sender and reply-to (empty: the settings'), the lists, and with Members on, everyone,
  only members (of some levels) or only non-members
- the email, designed in the email builder: text, images, buttons, sections and columns, the
  **Entries** block (the site's latest posts or other entries, of some categories or tags) and, with
  Events on, the **Events** block. Merge tags: `{first_name}`, `{last_name}`, `{name}`, your subscriber fields (`{town}`), `{email}`, `{site_name}`,
  `{unsubscribe_url}`, `{preferences_url}`. A fallback for an empty value goes after a bar:
  `{first_name|there}`. Every email ends with a footer you can't remove: why they get it, your name and
  postal address, and unsubscribe and preferences links. The site checks it is there before every send
  and test, and sends nothing without it.
- **Send a test**, to you and up to 5 more addresses, marked [Test].

Editors write and test campaigns. Admins **Send now** or **Schedule** (in the site's time zone), after a
confirmation that shows how many people it goes to. Admins can also **Pause**, **Resume** and **Cancel**.
Whoever is still subscribed when each batch goes out gets it. If Mailgun refuses a batch (a wrong key,
say), the campaign stops as failed. Once that's fixed, **Resume** sends the batches that didn't go.
Campaigns and digests need `SITE_URL` set, because their links are made from it.

Once it has gone out, the campaign shows its numbers: delivered, bounces, spam complaints, opens,
clicks, unsubscribes, and each link's clicks. It also shows its **Recipients**: everyone it went to,
filtered by delivered, opened, clicked, bounced, marked as spam, unsubscribed or not sent.

## Clicks: people and machines

Mail security scanners (Microsoft's, Proofpoint, Mimecast, Barracuda...) follow every link in an email
seconds after it arrives, so raw click counts overstate interest. With link tracking on, each link goes
through the site. The site records the click, sends the visitor on, and judges each click:

- **machine**: a scanner's address or browser name, a check that doesn't load the page, a hidden link in
  the email that only machines follow (and clicks just around it), three different links within
  seconds, or a click seconds after delivery with no sign of a person after
- **confirmed person**: they went on to use the page the link led to (links to your own site)
- **likely a person**: the rest.

**Clicked** counts people (confirmed and likely), not machines. **Show machine clicks** adds those to
the links table. Opens leave out scanners and privacy proxies (Apple Mail's opens every email). Open
counts are only indicative. Each contact's page lists their clicks with the verdict and why.

## Weekly digest

**New digest** on the Weekly digests tab makes a digest: a day and time, the lists, a subject
(`{week_of}` is the Monday of the week) and an email. It starts with an Entries block set to **only those
new since the last issue** and, with Events on, an Events block of what's coming up.

Each week at its time the site makes that week's issue, filled in with what's new, as a campaign:

- **Waits for an admin's approval** (default): the admins are emailed. If an admin approves it within
  the hours you choose, it goes out. If not, it is cancelled.
- **Goes out on its own**.

A week with fewer entries and events than you choose is skipped. **Send me this week's issue** sends a
test of it as it would be now. **Make an issue now** makes one outside its schedule. Editors set up a
digest, and an admin turns it on.

## Members

With Members on, see [Members and Mailing](../members/#members-and-mailing).
