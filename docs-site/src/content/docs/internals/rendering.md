---
title: How rendering works
description: From a request to HTML strings, styles, scripts and caching.
sidebar:
  order: 1
---

`src/render/` turns a request into HTML strings, in four steps:

1. **Resolve** the queried entry or archive and its template (`page.ts`).
2. **Prepare** all data up front (`prepare.ts`): queries, media, parts, patterns, and the site blocks'
   `prepare` hooks. Results go on `ctx.data`. Blocks add page scripts to `ctx.scripts` /
   `ctx.headScripts` and vendor CSS through `ctx.assets`.
3. **Render** the items (`engine.ts` and the registry in `blocks/index.ts`, plus the site's blocks).
   Renderers are synchronous string functions, so the same code runs in the editor.
4. **Texturize** the whole output (smart quotes, dashes).

Supporting code:

- `src/lib/text/`: texturize, autop, entities
- `src/lib/date-format.ts`: PHP-style date formats stored in content
- `src/lib/media/image.ts`: image markup
- `src/lib/permalink.ts`: entry URLs

## CSS

`src/styles/site.css` (Tailwind, no preflight) imports the site's `tokens.css` and `theme.css`,
`forms.css` and `events.css`. The page shell links the compiled file. The site serves Swiper (sliders)
and Leaflet (maps) itself, from versioned folders under `public/assets/vendor/`, rather than from a CDN.
Their stylesheets are linked only on pages that use them. A site should serve its fonts the same way:
files in `src/site/public/assets/fonts/`, `@font-face` in its `theme.css`, and the first faces preloaded
from its `render.ts` `head`.

## Scripts

Browser scripts are in `public/assets/js/`. Each enhances the server markup. The page works without
it.

## Caching

The CDN caches pages for 60 seconds. After that it serves them stale for up to a week while they
refresh in the background, in the Workers cache. This goes through Astro's route cache with the
Cloudflare provider (`cache` in `astro.config.mjs`). Every page carries the cache tag `pages`. Any
successful change made in the admin clears it (`src/lib/cache.ts`, `cache.invalidate` from the
middleware), so edits show on the next visit. Under `astro dev` nothing is cached. A sync from another
copy into production clears nothing there, so its pages update within the minute. The browser adds the
editor bar for signed-in editors, so cached pages stay shared.

