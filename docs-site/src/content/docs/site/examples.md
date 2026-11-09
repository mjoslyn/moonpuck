---
title: Examples
description: Worked examples of a site's own block (with its settings panel and a prepare hook), a template and a pattern.
sidebar:
  order: 4
---

These examples are written for a site's `src/site/`. Paths are relative to it unless they start with
`src/`.

## A block with settings

An **Opening hours** block: a heading and a list of days and times, edited in the block's panel.

### 1. Its fields

The fields the panel shows, kept beside the site's other block fields (`lib/fields.ts`). `FieldDef`
types are the ones content types use: `text`, `textarea`, `url`, `email`, `number`, `bool`, `image`,
`select`, `repeater`, `entries` and `entry`.

```ts
// lib/fields.ts
import type { FieldDef } from '../../lib/site/types';

export const BLOCK_FIELDS: Record<string, FieldDef[]> = {
  hours: [
    { key: 'title', label: 'Heading', type: 'text' },
    {
      key: 'days', label: 'Days', type: 'repeater', itemLabel: 'day', itemName: 'day',
      fields: [
        { key: 'day', label: 'Day', type: 'text' },
        { key: 'time', label: 'Hours', type: 'text' },
      ],
    },
    { key: 'note', label: 'Note under the list', type: 'textarea' },
  ],
};
```

### 2. Its markup

A renderer turns the block's `attrs` into an HTML string. It runs on the server and in the editor's
canvas, so it is synchronous and loads nothing itself. Escape every value with `esc`. In the editor
(`env.ctx.editor`) an empty block shows a hint; on the site it shows nothing.

```ts
// render/c/hours.ts
import { esc } from '../../../render/html';
import type { Renderer } from '../../../render/env';

const list = (v: unknown): Record<string, any>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

export const hours: Renderer = (b, env) => {
  const days = list(b.attrs.days).filter((d) => d.day);
  if (!days.length) return env.ctx.editor ? '<p class="site-hint">Add days in the block settings.</p>' : '';
  const rows = days.map((d) => `<div><dt>${esc(d.day)}</dt><dd>${esc(d.time ?? '')}</dd></div>`).join('');
  return (
    `<section class="site-hours">` +
    (b.attrs.title ? `<h2>${esc(b.attrs.title)}</h2>` : '') +
    `<dl>${rows}</dl>` +
    (b.attrs.note ? `<p class="site-hours__note">${esc(b.attrs.note)}</p>` : '') +
    `</section>`
  );
};
```

### 3. Register it

```ts
// render.ts
import { defineRender } from '../lib/site/extend';
import { hours } from './render/c/hours';

export default defineRender({
  blocks: {
    hours: { label: 'Opening hours', category: 'site', render: hours },
  },
});
```

### 4. Its panel

`FieldsForm` draws the fields and writes what is typed into the block's `attrs`.

```tsx
// editor.tsx
import { defineEditor } from '../lib/site/extend';
import { FieldsForm } from '../puck/entry-fields';
import { BLOCK_FIELDS } from './lib/fields';

export default defineEditor({
  panels: {
    hours: (a, set) => <FieldsForm defs={BLOCK_FIELDS.hours} value={a} onChange={(v) => set(v)} />,
  },
});
```

The block also takes the shared style settings (colours, spacing, width) every block has, which
editors set in its panel below these fields.

### 5. Its styles

Styles go in `styles/theme.css` and use the role tokens, so the block follows Settings > Theme and
re-colours itself in dark bands:

```css
.site-hours dl { display: grid; gap: var(--space-20); margin: 0; }
.site-hours dl > div { display: flex; justify-content: space-between; border-bottom: 1px solid var(--color-surface-alt); }
.site-hours dt { font-weight: 600; }
.site-hours__note { color: var(--color-muted); font-size: var(--text-small); }
```

The stored block looks like this:

```json
{ "type": "hours", "props": { "id": "hours-1", "attrs": { "title": "Hours", "days": [{ "day": "Monday", "time": "9 to 5" }] } } }
```

## A block that loads data

A **Latest post** block shows the newest post's title and date. What it needs is loaded before the
page renders, in `prepare`, and put on `ctx.data` under a key with the block's id; the renderer reads
it from there.

```ts
// render/c/latest.ts
import { esc } from '../../../render/html';
import { permalink } from '../../../lib/permalink';
import type { Renderer, RenderCtx } from '../../../render/env';
import type { PuckItem } from '../../../lib/puck/types';
import type { Entry } from '../../../lib/types';

const key = (id: string) => `latest:${id}`;

export async function prepareLatest(item: PuckItem, ctx: RenderCtx) {
  // The loader limits entries to published ones, and members-only ones to those who may see them.
  const { ids } = await ctx.loader.query({ postType: item.props.attrs?.type || 'post', perPage: 1, orderBy: 'date', order: 'desc' });
  const [entry] = ids.length ? await ctx.loader.entriesByIds(ids) : [];
  ctx.data.set(key(item.props.id), entry ?? null);
}

export const latest: Renderer = (b, env) => {
  const entry = env.ctx.data.get(key(b.id)) as Entry | null | undefined;
  if (!entry) return env.ctx.editor ? '<p class="site-hint">Nothing published yet.</p>' : '';
  return `<p class="site-latest"><a href="${esc(permalink(entry))}">${esc(entry.title)}</a></p>`;
};
```

```ts
// render.ts
blocks: {
  latest: { label: 'Latest post', category: 'dynamic', render: latest, prepare: prepareLatest },
},
```

`prepare` runs once for each time the block is on the page. Its third argument has helpers: `uid()`,
`loadEntryMedia(ids)` (featured images and image fields in one query) and `descendantTermIds(ids)`. A
block that reads the page's own fields (a product's details, a member's address) sets `types` to the
entry types it belongs to, and reads `env.post.fields`.

## A template

Templates, parts and patterns are rows in `templates` (`kind` `template`, `part` or `pattern`), whose
`content` is a Puck document of blocks. Editors make and change them under **Content > Templates**; a
site that starts with its own writes them from a seed script. Every block needs an `id` unique in its
document.

A template for single posts: the header part, the post's title, date and featured image, its content
(the **Page content** block, `entry-content`), and the footer part.

```ts
// scripts/seed.ts
import { siteDb } from '../../lib/db/site';
import type { PuckItem } from '../../lib/puck/types';

const sb = siteDb();
let n = 0;
const node = (type: string, attrs: Record<string, any> = {}, children?: PuckItem[]): PuckItem =>
  ({ type, props: { id: `seed-${type}-${n++}`, attrs, ...(children ? { children } : {}) } }) as PuckItem;
const doc = (content: PuckItem[]) => ({ root: { props: {} }, content, zones: {} });

const singlePost = [
  node('part', { slug: 'header' }),
  node('section', { tag: 'main', layout: { type: 'constrained', contentSize: '720px' }, style: { padding: { top: 'var(--space-70)', bottom: 'var(--space-80)', left: 'var(--space-50)', right: 'var(--space-50)' } } }, [
    node('entry-title', { level: 1 }),
    node('entry-date', { style: { color: 'var(--color-muted)' } }),
    node('entry-image', { size: 'large' }),
    node('entry-content', { layout: { type: 'flow' } }),
  ]),
  node('part', { slug: 'footer' }),
];

async function ensureTemplate(kind: 'template' | 'part' | 'pattern', slug: string, title: string, content: PuckItem[]) {
  const { data: existing } = await sb.from('templates').select('id').eq('kind', kind).eq('slug', slug).maybeSingle();
  if (existing) return; // what editors changed stays
  await sb.from('templates').insert({ kind, slug, title, content: doc(content) });
}

await ensureTemplate('template', 'single-post', 'Single post', singlePost);
```

Run it with `npx tsx --env-file=.env src/site/scripts/seed.ts`. The name `single-post` puts it in the
template hierarchy for posts (`single-<type>`, then `single`, then `index`); any other name is chosen per
type under Settings > Types, or per entry in its settings. A template can have more than one Page content
block, each with its own `area` (`entry-content` with `{ area: 'sidebar' }`), filled in per entry.

## A pattern

A pattern is a group of blocks editors insert from the editor's **Patterns** tab: a call to action
band here. Editors can also make one from any block with **Save as pattern**.

```ts
const callToAction = [
  node('section', { style: { backgroundColor: 'var(--color-night)', padding: { top: 'var(--space-80)', bottom: 'var(--space-80)' } }, layout: { type: 'constrained' } }, [
    node('heading', { level: 2, content: 'Plan your visit' }),
    node('text', { content: 'Places to stay, eat and explore, all in one guide.' }),
    node('buttons', {}, [node('button', { text: 'Get the guide', href: '/guide/' })]),
  ]),
];

await ensureTemplate('pattern', 'call-to-action', 'Call to action', callToAction);
```

A section whose background is one of the theme's dark colours (here `night`, ticked **Dark background**
under Settings > Theme) takes the theme's dark-band colours, so the heading, text and button need no
colours of their own.

Inserted, a pattern's blocks are copied into the page. To make every page that uses it follow later
changes to its layout, save it as a linked pattern: its document's root has `linked: true`
(`{ root: { props: { linked: true } }, ... }`), and pages place it as
`{ type: 'pattern', props: { id, attrs: { slug: 'call-to-action', linked: true, overrides: {} } } }`, each
page changing only its content (see [Templates and types](../../content/templates/)).
