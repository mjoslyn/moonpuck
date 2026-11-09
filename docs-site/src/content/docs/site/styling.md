---
title: Styling
description: The site's theme (Settings > Theme or code), role colors, dark bands and Compose's house style.
sidebar:
  order: 3
---

## Where the look comes from

A site's colours, fonts, text sizes, spacing, widths and logo are its **theme**. The theme in use is,
in order:

1. The one an admin saved under **Settings > Theme** (`settings.site.theme`).
2. The one the site's code gives: `theme.default` in `src/site/render.ts`.
3. The core's starting theme, `DEFAULT_THEME` (`src/lib/theme/theme.ts`).

The core writes it on every page as `<style id="site-theme">` after the compiled stylesheet, with
`@font-face` rules and preloads for its fonts (served from `/assets/fonts/library/`, `src/lib/theme/fonts.ts`).
The editor's colour, size, font and spacing choices come from it too (`themePresets`).

- `src/site/styles/tokens.css`: tokens the theme doesn't cover (most sites need none).
- `src/site/styles/theme.css`: the site's own styles.

`src/styles/site.css` (Tailwind, no preflight) imports the site's `tokens.css` and `theme.css`, along
with the core's `forms.css` and `events.css`. The page shell links the compiled file.

## A theme in code

A custom-coded site gives its starting theme in `render.ts`, so a new copy looks right before anyone
opens Settings:

```ts
import type { Theme } from '../lib/theme/theme';

const theme: Theme = {
  colors: [
    { slug: 'ink', name: 'Ink', color: '#0d0f12', dark: true },
    { slug: 'blue', name: 'Blue', color: '#1f5fa8', dark: true, onDark: 'sky' },
    { slug: 'sky', name: 'Sky', color: '#9cc6ee' },
    { slug: 'white', name: 'White', color: '#ffffff' },
  ],
  roles: { text: 'ink', muted: 'ink', accent: 'blue', 'accent-hover': 'ink', dark: 'ink', 'on-dark': 'white', surface: 'white' },
  bands: { text: 'white', accent: 'sky', 'button-bg': 'white', 'button-color': 'ink' },
  buttons: { bg: 'blue', color: 'white', 'hover-bg': 'ink', 'hover-color': 'white' },
  fonts: { heading: 'anton', body: 'inter' },
  fontSizes: [{ slug: 'small', name: 'Small', size: '0.875rem' }, { slug: 'large', name: 'Large', size: '1.15rem' }],
  spacing: [{ slug: '40', name: '1', size: '1rem' }, { slug: '60', name: '2', size: '2.25rem' }],
  layout: { content: '720px', wide: '1240px' },
};

export default defineRender({
  theme: { default: theme, darkSelectors: ['.my-band'] },
  // blocks, cards...
});
```

- `colors`: the palette, as `--color-<slug>`. `dark` marks a dark background; `onDark` is the colour
  used in its place inside dark bands; `hidden` leaves it out of the editor's choices.
- `roles`, `bands`, `buttons`: palette slugs or colour codes (see below).
- `fonts`: a library font id (`inter`, `work-sans`, `dm-sans`, `montserrat`, `source-sans-3`,
  `fraunces`, `lora`, `merriweather`, `playfair-display`, `source-serif-4`, `anton`, `oswald`,
  `system-sans`, `system-serif`), or a CSS font stack for fonts the site serves itself.
- `darkSelectors`: the site's own classes whose backgrounds are dark, re-mapped like dark bands.

Content stores palette names (`var(--color-blue)`), so a site moving onto a theme keeps its slugs.

## Palette and role colors

The core's styles never use palette names, only **role tokens**, which the theme maps onto the palette:

| Role | Used for |
| --- | --- |
| `--color-text` | Body text |
| `--color-muted` | Secondary text |
| `--color-accent`, `--color-accent-hover` | Links, buttons, eyebrows |
| `--color-dark`, `--color-on-dark` | Dark bands and the text on them |
| `--color-on-accent` | Text on accent fills (optional; falls back to on-dark) |
| `--color-accent-fill` | The accent as a background under text: the Hero's first button, button and search hovers, today in the calendar (optional; falls back to the accent) |
| `--color-surface`, `-surface-alt`, `-surface-soft` | Light backgrounds |

Inside dark bands (sections on a `dark` colour, covers, heroes and `darkSelectors`), the theme writes
each colour's `onDark` shade, the roles using those colours again, and the `bands` values (text,
muted, accent, on-accent, headings, links and buttons), so accent text keeps 4.5:1 contrast. A lighter
accent can be too light under white text: set the `accent-fill` role to a deep enough accent, so filled
buttons keep 4.5:1 there too.

Other tokens: `--font-display`, `--font-body`, `--text-*` (sizes, `small` to `hero`) and
`--space-*` (spacing). Block props store styles as CSS that uses these tokens.

## Compose house style

Compose builds sections in a house style taken from the config's `compose`. Each option defaults to a
role token or the original house style.

| Option | Meaning |
| --- | --- |
| `bands` | Section backgrounds: `plain`, `tint`, `soft`, `dark` |
| `body` | Body text on light bands |
| `onDark` | Text on dark bands |
| `accent` | Eyebrows, the rule above headings, big numbers |
| `card` | Card backgrounds on light bands |
| `bandNames` | Older band names in saved conversations, mapped to the generic ones |
| `headingFont` | Headings, quotes and big numbers |
| `rule` | An accent rule between eyebrow and heading (default true) |
| `bodySize`, `bodyWeight`, `bodyLineHeight` | Body text |
| `bandPadding` | `{ block, inline }` padding of a band |
| `textWidth`, `wideWidth` | Content widths (default 720px and 1280px) |
| `radius`, `buttonRadius` | Corners of cards and images (6px) and buttons (2px) |
| `buttonCaps` | Button labels in spaced capitals (default true) |
