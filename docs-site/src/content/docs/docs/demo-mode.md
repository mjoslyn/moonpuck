---
title: A demo site
description: Run a public copy of a site where anyone can try the editor, reset every 12 hours.
sidebar:
  order: 4
---

Demo mode turns a copy of a site into a public demo. Visitors ask for an invitation on the sign-in page,
get an editor's account by email, and try the editor. Every 12 hours the demo goes back to its starting
point: what visitors made, the files they uploaded and their accounts are deleted.

Moonpuck's own demo, Copernicus Base, runs this way: [dev.moonpuck.com](https://dev.moonpuck.com/).

## What visitors can and can't do

Visitors are **editors**: they edit pages, templates, media and forms, and use Compose. They can't reach
Settings, Users or Connections. On a demo:

- **Uploads**: images only (JPEG, PNG, WebP, GIF, AVIF), up to 10 MB. No videos or documents.
- **Blocks**: the HTML and Embed blocks aren't offered, and show no markup of their own.
- **Email**: only account emails go out (invitations and password links). Form notifications, ticket
  emails and mentions are logged as not sent.
- **Payments, shipping labels and Mailgun**: off. Their keys are never read, wherever they are set.
- **Claude**: Compose and the Compose buttons use Claude Haiku 5.5, to keep costs down, and each account
  gets 10 answers a day, the whole demo 150. Compose's panel tells visitors that a site of their own uses
  Claude Sonnet 5.5 by default and can choose a larger model for better results.
- **What they write**: a save is refused when it holds script (tags, event handlers, script links) or
  offensive words. What they publish, and their comments, are also read by a small model (Claude Haiku),
  which catches what a word list misses.

You, as an admin, aren't limited by any of this.

## Setting one up

1. Deploy a copy of the site as usual (see [Hosting](/docs/hosting/)), on its own Worker, database and
   bucket. Don't use your real site: a reset deletes every account but admins'.
2. In its `wrangler.jsonc`, set the demo and keep it out of search engines:

   ```jsonc
   "vars": { "SITE_URL": "https://demo.example.org", "SITE_NOINDEX": "1", "DEMO_MODE": "1" }
   ```

3. Set up email (Email Service or SMTP), so invitations reach visitors.
4. Connect Claude under Settings > Connections, or leave it off to turn Compose off on the demo.
5. Make the content visitors start from, signed in as an admin.
6. Save it as the starting point. With the deployed database's and bucket's keys in the environment
   (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID` and the `STORAGE_*` variables):

   ```bash
   npm run demo -- save
   ```

   Save again whenever you change the starting content. Only the newest starting point is kept.

## Resets

The Worker's hourly run resets the demo at 00:00 and 12:00 UTC. A reset:

- puts back the entries, terms, media library, templates, forms, settings and redirects of the starting
  point, and deletes what was made since;
- deletes the files visitors uploaded;
- deletes every account but admins';
- empties share links and comments, Compose conversations, form submissions, revisions, the email log
  and the Not found list.

Admin pages show when the next reset comes. To reset now:

```bash
DEMO_MODE=1 npm run demo -- reset
```

## Settings

All are Worker variables:

- `DEMO_MODE`: `1` or `true` turns the demo on.
- `DEMO_RESET_HOURS`: hours between resets, a number that divides 24. Default 12.
- `DEMO_CLAUDE_TURNS`: Claude's answers per account a day. Default 10.
- `DEMO_CLAUDE_DAILY`: Claude's answers for the whole demo a day. Default 150.
- `DEMO_ANTHROPIC_MODEL`: the model the demo answers with. Default `claude-haiku-5-5`.
- `DEMO_INVITES_DAILY`: invitations the demo sends a day. Default 200. Each address gets at most 3 a day,
  and each visitor 5.

## The word list

The offensive words are kept in `src/lib/demo/words.ts` as hashes, so the repository doesn't spell them
out. To change them, keep your own list as a text file outside the repository, one word a line, `*` at
the end of a stem that no ordinary word starts with, and write the hashes from it:

```bash
npm run demo:words -- ~/demo-words.txt
```
