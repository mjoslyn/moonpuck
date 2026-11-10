---
title: SEO and social
description: Per-entry SEO settings, meta tags, generated descriptions and social profiles.
sidebar:
  order: 9
---

## Entry SEO

An entry's SEO settings live in `fields.seo` (`src/lib/seo.ts`). `seo` is a reserved field key. The settings are:

- search title
- meta description
- share image (a media id)
- **Hide from search engines and AI answer engines** (`noindex`): the robots meta tag says
  `noindex, follow, noai, noimageai`. `/robots.txt` (`src/pages/robots.txt.ts`) also disallows the page
  for the crawlers behind AI answers (`AI_CRAWLERS` in `src/lib/ai-crawlers.ts`: GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended and others). These crawlers follow robots.txt, not the tag. Robots.txt
  doesn't disallow search engines' own crawlers, because they must fetch the page to see noindex. Term pages
  hidden the same way are listed too. A site's own `public/robots.txt` is served instead of this one.
- leave out of this site's search (`nosearch`, entries only): `entry_search` never matches the entry, so
  `/search/` and the search forms' live results leave it out. It doesn't change lists, menus or search
  engines (noindex is for those).

The entry settings' SEO section (`src/puck/SeoForm.tsx`) shows lengths and a search result preview.
**Compose** asks Claude (`POST /api/admin/seo`, `ANTHROPIC_SEO_MODEL`, default Haiku 4.5) for text
from the page as it is in the editor.

Compose includes `seo` in every `build_page` and writes it, marked `generated`, on each build until
someone edits it by hand.

## Term pages

A term's SEO lives in its own fields (Content > Taxonomies, **Details**), with the same settings as an
entry's. Its taxonomy's defaults are under Settings > Types, where `{term}` in the title and
description becomes the term's name. A term page uses:

- **Search title** (and `<title>`): the term's, else the taxonomy's, else the term's name.
- **Meta description**: the term's SEO description, else its description, else the taxonomy's, else the
  site's tagline.
- **Share image**: the term's, else the taxonomy's. Without either, the term's share card (its name,
  taxonomy and featured image, else the taxonomy's). With share cards off, its featured image, else
  the taxonomy's featured image, else the site's default.
- **noindex**: if either the term or its taxonomy sets it. See
[Taxonomies and tags](../../content/taxonomies/#term-details).

## Listing pages

Each type's listing page (`/directory/`, `/events/`, `/news/`...) has its featured image and SEO under
Settings > Types. The **SEO** button beside its listing template's Edit opens them: a search title, a
meta description, noindex and a featured image. The featured image is its share image. It also shows in
a Featured image block on the page (outside a collection).
**Compose** writes the title and description from what the page lists.

The title and description apply on the listing's own address. Views under it, such as the event
calendar's months and days, and searches in it keep their own titles and descriptions. They get the
image and noindex.

## Meta tags

`src/render/meta.ts` writes the head tags: description, canonical, robots, Open Graph and Twitter
card. They fall back to the excerpt, the share card (below), the featured image and the site's default
share image. The home page also gets Organization structured data, with the social profiles as `sameAs`.

## Share cards

A page, term page or listing whose SEO settings have no share image is shared with a share card
(`src/lib/share-card/`). The card is a 1200 by 630 PNG with its title, what it is (its type, or its
taxonomy) and its featured image, else the default share image. It also has the site's name and icon.
The home page's card shows the site's name and tagline. **Make share cards** under Settings > Social turns them off
(`settings.site.share_cards: false`). Drafts, members-only entries and Not found pages get none.

- **Address**: `/share-card/<entry|term|listing>/<id or type>.png?v=<stamp>`, in `og:image`. The stamp
  is a hash of what the card shows and the design's version, so an edited title or image gives a new
  address, which social networks fetch again. The route sends an older stamp on (302) to the current one.
- **Drawing**: Satori lays the design out as SVG and resvg draws the PNG. Both are WebAssembly modules
  in the Worker (about 3.3 MB of its 64 MiB). Drawing takes about 100 ms of CPU, which needs Workers
  Paid. The first request draws the card (a few hundred milliseconds) and keeps it in the store
  (`share-cards/`), deleting the page's earlier cards. It answers with a year's caching at the CDN.
- **Design**: the core's (`coreCard`, Inter) in the site's colors, or the site's own. For its own, a
  site's `shareCard` in its `render.ts` gives:
  `render` (an element tree for Satori, written with `h`), `fonts` (WOFF or TTF files kept under
  `src/site/` with `.bin` added to their names, listed by file name and weight), `colors` for the core's
  design, and `version`. Change `version` with the design, so every card is made again.

## Social profiles

**Settings > Social** keeps the site's profiles (`settings.site.social`: network and URL,
`src/lib/social/links.ts`) and the default share image (`share_image`).

The `social-links` block shows the profiles as icons (`src/lib/social/icons.ts`, Simple Icons paths,
CC0), optionally with names.
