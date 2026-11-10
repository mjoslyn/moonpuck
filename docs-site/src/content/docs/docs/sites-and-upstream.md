---
title: Sites and upstream
description: How a site repository relates to moonpuck, and how core updates reach it.
sidebar:
  order: 3
---

`moonpuck` is the upstream. Each site is its own repository with `moonpuck` as its `upstream`
remote. Its history starts from the core's, with a commit that swaps the example `src/site/` for its
own.

## Setting up a site repository

After cloning:

```sh
git remote rename origin upstream
git remote add origin git@github.com:<you>/my-site.git
```

Then make it your site:

- Replace `src/site/` with your own (see [Site configuration](../../site/configuration/)).
- Replace `AGENTS.md` with your site's own notes, keeping its first line, `@CORE.md`, which brings in
  the core's reference. The core's `AGENTS.md` is about working on the core itself.
- `CORE.md` documents the core and belongs to upstream: sites don't edit it.

## What a site may change

Merges stay clean as long as the site only changes:

- `src/site/`
- its own database migrations, `db/migrations/*_site_*.sql` (wrangler reads only that folder)
- `AGENTS.md`, `README.md`
- its env and its `wrangler.jsonc` (names and ids of its Worker, database, bucket and queue)

## Taking core updates

```sh
npm run core:update                                # fetch upstream/main, check for conflicts, merge
npm run core:update -- --check                     # only check what would come in, and any conflicts
npx wrangler d1 migrations apply DB --remote       # if there are new migrations
npx tsx --env-file=.env scripts/migrate-content.ts # if stored content needs migrating
```

`core:update` (`scripts/update-core.mjs`) stops before it changes anything if there is no `upstream`
remote, if there are uncommitted changes or if a merge is under way. It tries the merge first and lists
every file that would conflict. On a conflict, the site keeps its own `AGENTS.md`, `README.md`,
`.env.example` and `wrangler.jsonc`. Any other conflict (a core file the site has changed) stops it and
leaves the branch as it was. Then it merges, lists the new migrations and runs `npm install` if the
dependencies changed. To do it by hand: `git fetch upstream && git merge upstream/main`.

### Migrations

Migrations (core and site) are named with the time they were written: `YYYYMMDDHHMMSS_name.sql`.
`wrangler d1 migrations apply` applies, in order, every one that is not yet applied. So a core
migration still goes in even if it was written before a migration that the site already applied:

```sh
npx wrangler d1 migrations apply DB --remote   # deployed
npx wrangler d1 migrations apply DB --local    # local
```

## Sending a fix upstream

A core bug found while working on a site can be fixed there: commit the fix on its own, touching core
files only, then `git cherry-pick` it into `moonpuck`.

## Rules for core code

- Never import from `src/site/` in core code except through `src/lib/site` (the CSS imports of the
  site's `styles/tokens.css` and `styles/theme.css` in `src/styles/site.css` aside).
- New core code must not hard-code a site's types, URLs, names, palette names or classes. If a site
  needs something general (a filter, a map, a menu), build it as a core feature with settings and move
  the site onto it.
