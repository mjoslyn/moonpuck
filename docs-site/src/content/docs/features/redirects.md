---
title: Redirects
description: Redirect rules, automatic redirects and the not-found log.
sidebar:
  order: 10
---

**Settings > Redirects** (admins, and `/admin/redirects/` forwards there) maps old addresses to new
(301 or 302), in `src/lib/redirects.ts` and the `redirects` table.

## Rules

- **Exact**: covers its own path.
- **Wildcard**: a prefix ending in `*`, covering every path under it. The rest of the path fills a
  `*` in the target.

One function, `ruleCovers`, decides whether a rule covers an address.

Redirects apply only when an address would otherwise be Not found (`renderRequest`, before the slug
guess), so they never hide a live page. The exact rule wins, else the wildcard with the longest
prefix. The site counts each use (`redirect_hit`).

The site refuses a rule that would lead back to itself (`loopReason`: a wildcard whose target is
under its own prefix).

Saving a rule clears the cached entries it covers (for a wildcard, every entry under its prefix). The
API returns the cleared paths and reports a failed clear rather than hiding it.

## Automatic redirects

- A published entry whose address changes gets one (`redirectMovedEntry`).
- A term whose address changes leaves one from the old term page.

## Not found page

When no redirect or guess covers a missing address, the visitor sees the page chosen as **Not found
page** (Settings > General, `settings.site.not_found_page_id`) while it is published. It is an ordinary
page, edited like any other and rendered through its own template. The site answers it with 404,
`noindex` and no canonical, with `is-404` on the body. Without one, the site shows the `404` template
(then `index`). The
page's own address stays an ordinary page, also `noindex`. Listing pages past their last page show it
too.

## Not found log

The site logs addresses that are still not found (`not_found`, via `not_found_hit`) and lists them
on the screen with **Add redirect**. The log leaves out files, admin and probes.

## Site-level redirects

A site can also redirect in code: `redirect(url)` in its `render.ts` (a previous site's URLs) and
`moved-paths.json` (URL prefixes that moved). See [Blocks and hooks](../../site/extending/).
