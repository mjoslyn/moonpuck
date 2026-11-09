// A site's look as settings (Settings > Theme, settings.site.theme): its palette, which colors play the
// core's roles, the colors inside dark bands, buttons, fonts, text sizes, spacing, the content widths and
// a logo. `themeCss` turns it into the custom properties the core's and the site's styles read
// (var(--color-*), --font-*, --text-*, --space-*, --content-size, --wide-size), put on every page after
// the stylesheet (src/render/page.ts) and in the editor's canvas; `themePresets` gives the editor its
// color, size and spacing choices. Safe in the browser.
import { fontFaces, fontPreloads, fontStack, libraryFont } from './fonts';

export interface ThemeColor {
  /** Its name in content and styles: var(--color-<slug>). */
  slug: string;
  name: string;
  color: string;
  /** A dark background: sections, covers and heroes on it take the dark-band colors (`bands`). */
  dark?: boolean;
  /** What this color becomes inside dark bands (a lighter shade that keeps its contrast there). */
  onDark?: string;
  /** Not offered in the editor's color choices (a shade the theme uses for itself). */
  hidden?: boolean;
}
export interface ThemeSize {
  slug: string;
  name: string;
  size: string;
}

/** The core's role colors (var(--color-<role>)). */
export const ROLES = [
  ['text', 'Text'],
  ['muted', 'Muted text'],
  ['accent', 'Accent (links, highlights)'],
  ['accent-hover', 'Accent on hover'],
  ['accent-fill', 'Button fill'],
  ['on-accent', 'Text on the accent'],
  ['dark', 'Dark background'],
  ['on-dark', 'Text on dark backgrounds'],
  ['surface', 'Page background'],
  ['surface-alt', 'Alternate background'],
  ['surface-soft', 'Soft background'],
] as const;
export type RoleKey = (typeof ROLES)[number][0];

/** What changes inside dark bands, and the custom property each sets. */
export const BANDS = [
  ['text', 'Text', '--color-text'],
  ['muted', 'Muted text', '--color-muted'],
  ['accent', 'Accent', '--color-accent'],
  ['on-accent', 'Text on the accent', '--color-on-accent'],
  ['accent-fill', 'Button fill', '--color-accent-fill'],
  ['heading', 'Headings', '--heading-color'],
  ['link', 'Links', '--link-color'],
  ['link-hover', 'Links on hover', '--link-hover'],
  ['button-bg', 'Button background', '--button-bg'],
  ['button-color', 'Button text', '--button-color'],
  ['button-hover-bg', 'Button background on hover', '--button-hover-bg'],
  ['button-hover-color', 'Button text on hover', '--button-hover-color'],
] as const;
export type BandKey = (typeof BANDS)[number][0];

/** Buttons everywhere else (unset: the accent fill). */
export const BUTTONS = [
  ['bg', 'Background', '--button-bg'],
  ['color', 'Text', '--button-color'],
  ['hover-bg', 'Background on hover', '--button-hover-bg'],
  ['hover-color', 'Text on hover', '--button-hover-color'],
] as const;
export type ButtonKey = (typeof BUTTONS)[number][0];

export interface Theme {
  colors: ThemeColor[];
  /** Each a palette slug or a color. */
  roles: Partial<Record<RoleKey, string>>;
  bands: Partial<Record<BandKey, string>>;
  buttons: Partial<Record<ButtonKey, string>>;
  /** A library font's id (src/lib/theme/fonts.ts), or a family and fallbacks of the site's own. */
  fonts: { heading?: string; body?: string };
  fontSizes: ThemeSize[];
  spacing: ThemeSize[];
  layout: { content?: string; wide?: string };
  /** The logo (media id), which the Site title block can show; its address for the settings screen. */
  logo?: number;
  logo_url?: string;
}

/** The theme a site has before anyone sets one (the example site's). */
export const DEFAULT_THEME: Theme = {
  colors: [
    { slug: 'night', name: 'Night', color: '#1c2331', dark: true },
    { slug: 'slate', name: 'Slate', color: '#555f6d', onDark: '#a7b0bd' },
    { slug: 'stone', name: 'Stone', color: '#f3f4f6' },
    { slug: 'cream', name: 'Cream', color: '#fafaf9' },
    { slug: 'white', name: 'White', color: '#ffffff' },
    { slug: 'copper', name: 'Teal', color: '#1f6672', onDark: '#6cc3cf' },
    { slug: 'bark', name: 'Deep teal', color: '#174e57' },
  ],
  roles: { text: 'night', muted: 'slate', accent: 'copper', 'accent-hover': 'bark', dark: 'night', 'on-dark': 'white', 'on-accent': 'white', surface: 'white', 'surface-alt': 'stone', 'surface-soft': 'cream' },
  bands: { muted: '#a7b0bd', accent: '#6cc3cf', 'on-accent': 'night', 'link-hover': '#a3dde5' },
  buttons: {},
  fonts: { heading: 'system-serif', body: 'system-sans' },
  fontSizes: [
    { slug: 'small', name: 'Small', size: '0.875rem' },
    { slug: 'medium', name: 'Medium', size: '1rem' },
    { slug: 'large', name: 'Large', size: 'clamp(1rem, 1rem + ((1vw - 0.2rem) * 0.208), 1.125rem)' },
    { slug: 'x-large', name: 'Extra Large', size: 'clamp(1.25rem, 1.25rem + ((1vw - 0.2rem) * 0.417), 1.5rem)' },
    { slug: 'xx-large', name: 'Extra Extra Large', size: 'clamp(1.5rem, 1.5rem + ((1vw - 0.2rem) * 0.833), 2rem)' },
    { slug: 'heading-2', name: 'Heading 2', size: 'clamp(1.75rem, 1.75rem + ((1vw - 0.2rem) * 0.833), 2.25rem)' },
    { slug: 'heading-1', name: 'Heading 1', size: 'clamp(2.25rem, 2.25rem + ((1vw - 0.2rem) * 1.25), 3rem)' },
    { slug: 'hero', name: 'Hero', size: 'clamp(2.5rem, 2.5rem + ((1vw - 0.2rem) * 2.5), 4rem)' },
  ],
  spacing: [
    { slug: '10', name: 'Tiny', size: '0.25rem' },
    { slug: '20', name: '2X Small', size: '0.5rem' },
    { slug: '30', name: 'X Small', size: '0.75rem' },
    { slug: '40', name: 'Small', size: '1rem' },
    { slug: '50', name: 'Medium', size: '1.5rem' },
    { slug: '60', name: 'Large', size: '2rem' },
    { slug: '70', name: 'X Large', size: '3rem' },
    { slug: '80', name: 'Section', size: '5rem' },
  ],
  layout: { content: '720px', wide: '1280px' },
};

// Values ------------------------------------------------------------------------------------------

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const COLOR = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/deg]+\)|transparent|currentColor)$/i;
/** A length or a calc/clamp/min/max of lengths: digits, units, operators, parentheses, commas. */
const LENGTH = /^(?=.*[0-9])[0-9a-z.%()+\-*/, ]{1,120}$/i;
const NAME = (v: unknown, max = 60) => (typeof v === 'string' ? v.replace(/[<>{};]/g, '').trim().slice(0, max) : '');

export const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR.test(v.trim());
const LENGTH_WORDS = new Set(['px', 'rem', 'em', 'vw', 'vh', 'vmin', 'vmax', 'svh', 'dvh', 'ch', 'ex', 'pt', 'calc', 'clamp', 'min', 'max']);
export const isLength = (v: unknown): v is string =>
  typeof v === 'string' && LENGTH.test(v.trim()) && (v.match(/[a-z]+/gi) ?? []).every((w) => LENGTH_WORDS.has(w.toLowerCase()));
export const slugFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'color';

/** A color reference: a palette slug or a color; undefined when it's neither. */
function ref(v: unknown, slugs: Set<string>): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (slugs.has(s)) return s;
  return isColor(s) ? s : undefined;
}
/** A reference as CSS: var(--color-<slug>) or the color. */
export const refCss = (v: string, slugs: Set<string>) => (slugs.has(v) ? `var(--color-${v})` : v);

function sizes(list: unknown, max: number): ThemeSize[] {
  const seen = new Set<string>();
  const out: ThemeSize[] = [];
  for (const s of Array.isArray(list) ? list : []) {
    const slug = typeof s?.slug === 'string' ? s.slug.trim() : '';
    if (!SLUG.test(slug) || seen.has(slug) || !isLength(s?.size)) continue;
    seen.add(slug);
    out.push({ slug, name: NAME(s.name) || slug, size: s.size.trim() });
    if (out.length >= max) break;
  }
  return out;
}

const font = (v: unknown) => (typeof v !== 'string' || !v.trim() ? undefined : libraryFont(v) ? v : /^[\w\s'",-]{1,200}$/.test(v) ? v.trim() : undefined);

/** A theme as saved: known shapes only, references to colors it has, safe CSS values; else undefined. */
export function cleanTheme(raw: unknown): Theme | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, any>;
  const colors: ThemeColor[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(r.colors) ? r.colors : []) {
    const slug = typeof c?.slug === 'string' ? c.slug.trim() : '';
    if (!SLUG.test(slug) || seen.has(slug) || !isColor(c?.color)) continue;
    seen.add(slug);
    colors.push({ slug, name: NAME(c.name) || slug, color: c.color.trim(), ...(c.dark ? { dark: true } : {}), ...(c.hidden ? { hidden: true } : {}), ...(typeof c.onDark === 'string' && c.onDark ? { onDark: c.onDark.trim() } : {}) });
    if (colors.length >= 60) break;
  }
  if (!colors.length) return undefined;
  for (const c of colors) {
    if (c.onDark && !ref(c.onDark, seen)) delete c.onDark;
  }
  const pick = <K extends string>(src: unknown, keys: readonly (readonly [K, ...string[]])[]): Partial<Record<K, string>> => {
    const out: Partial<Record<K, string>> = {};
    for (const [k] of keys) {
      const v = ref((src as Record<string, unknown> | undefined)?.[k], seen);
      if (v) out[k] = v;
    }
    return out;
  };
  const logo = Number(r.logo) > 0 ? Number(r.logo) : undefined;
  return {
    colors,
    roles: pick(r.roles, ROLES),
    bands: pick(r.bands, BANDS),
    buttons: pick(r.buttons, BUTTONS),
    fonts: { heading: font(r.fonts?.heading), body: font(r.fonts?.body) },
    fontSizes: sizes(r.fontSizes, 20),
    spacing: sizes(r.spacing, 20),
    layout: { content: isLength(r.layout?.content) ? r.layout.content.trim() : undefined, wide: isLength(r.layout?.wide) ? r.layout.wide.trim() : undefined },
    ...(logo ? { logo, logo_url: typeof r.logo_url === 'string' && r.logo_url.startsWith('/media/') ? r.logo_url : undefined } : {}),
  };
}

// CSS ----------------------------------------------------------------------------------------------

/** A color as r, g, b (for the overlays made from the dark color), if it is a hex color. */
function rgb(hex: string): string | undefined {
  const h = hex.replace('#', '');
  const full = h.length === 3 || h.length === 4 ? [...h.slice(0, 3)].map((x) => x + x).join('') : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return undefined;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(', ');
}

/** A reference's color value (a slug followed to its color). */
export function resolveColor(theme: Theme, v: string | undefined): string | undefined {
  if (!v) return undefined;
  return theme.colors.find((c) => c.slug === v)?.color ?? (isColor(v) ? v : undefined);
}

/** The selectors of dark bands: sections on a dark color (as the editor writes them, with and without a space), covers, heroes, and the site's own. */
export function darkSelectors(theme: Theme, extra: string[] = []): string[] {
  const own = theme.colors.filter((c) => c.dark).flatMap((c) => [`[style*='background-color:var(--color-${c.slug})']`, `[style*='background-color: var(--color-${c.slug})']`]);
  return [...own, ...extra, '.c-cover:not(.is-light)', '.c-hero'];
}

/** The theme's custom properties: on the page's root, and inside dark bands. */
export function themeCss(theme: Theme, extraDark: string[] = []): string {
  const slugs = new Set(theme.colors.map((c) => c.slug));
  const root: string[] = [];
  for (const c of theme.colors) root.push(`--color-${c.slug}:${c.color}`);
  for (const [k] of ROLES) if (theme.roles[k]) root.push(`--color-${k}:${refCss(theme.roles[k]!, slugs)}`);
  root.push(`--font-display:${fontStack(theme.fonts.heading, DEFAULT_THEME_STACKS.heading)}`, `--font-body:${fontStack(theme.fonts.body, DEFAULT_THEME_STACKS.body)}`);
  for (const s of theme.fontSizes) root.push(`--text-${s.slug}:${s.size}`);
  for (const s of theme.spacing) root.push(`--space-${s.slug}:${s.size}`);
  if (theme.layout.content) root.push(`--content-size:${theme.layout.content}`);
  if (theme.layout.wide) root.push(`--wide-size:${theme.layout.wide}`);
  // Overlays over photos, in the dark color.
  const dark = rgb(resolveColor(theme, theme.roles.dark) ?? '');
  if (dark) {
    root.push(`--gradient-hero-overlay:linear-gradient(to top, rgba(${dark}, 0.85) 0%, rgba(${dark}, 0.3) 50%, rgba(${dark}, 0.2) 100%)`);
    root.push(`--gradient-card-overlay:linear-gradient(to top, rgba(${dark}, 0.75) 0%, transparent 100%)`);
  }
  for (const [k, , prop] of BUTTONS) if (theme.buttons[k]) root.push(`${prop}:${refCss(theme.buttons[k]!, slugs)}`);

  // Inside dark bands: each color's lighter shade, the roles that use those colors again (custom
  // properties inherit their value, so a role set on the root keeps the root's color unless set again),
  // then the band's own colors.
  const band: string[] = [];
  const shaded = new Set<string>();
  for (const c of theme.colors) {
    if (!c.onDark) continue;
    band.push(`--color-${c.slug}:${refCss(c.onDark, slugs)}`);
    shaded.add(c.slug);
  }
  for (const [k] of ROLES) if (theme.roles[k] && shaded.has(theme.roles[k]!)) band.push(`--color-${k}:var(--color-${theme.roles[k]})`);
  for (const [k, , prop] of BANDS) if (theme.bands[k]) band.push(`${prop}:${refCss(theme.bands[k]!, slugs)}`);
  if (theme.bands.text) band.push('color:var(--color-text)');

  let css = `:root{${root.join(';')}}`;
  if (band.length) css += `\n${darkSelectors(theme, extraDark).join(',')}{${band.join(';')}}`;
  const faces = fontFaces([theme.fonts.heading, theme.fonts.body]);
  return faces ? `${faces}\n${css}` : css;
}

const DEFAULT_THEME_STACKS = { heading: "Georgia, 'Times New Roman', serif", body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" };

/** The <head> markup of a theme: preloads for its fonts, then its style. */
export const themeHead = (theme: Theme, extraDark: string[] = []) => {
  const pre = fontPreloads([theme.fonts.heading, theme.fonts.body]);
  return `${pre ? `${pre}\n` : ''}<style id='site-theme'>\n${themeCss(theme, extraDark)}\n</style>`;
};

// The editor's choices ----------------------------------------------------------------------------------

export interface Presets {
  colors: { slug: string; name: string; color: string }[];
  fontSizes: { slug: string; name: string; size: string }[];
  spacing: { slug: string; name: string; size: string }[];
  fontFamilies: { slug: string; name: string; fontFamily: string }[];
}

/** The colors, sizes and spacing the editor offers, from a theme. */
export const themePresets = (theme: Theme): Presets => ({
  colors: theme.colors.filter((c) => !c.hidden).map(({ slug, name, color }) => ({ slug, name, color })),
  fontSizes: theme.fontSizes.map(({ slug, name, size }) => ({ slug, name, size })),
  spacing: theme.spacing.map(({ slug, name, size }) => ({ slug, name, size })),
  fontFamilies: [
    { slug: 'display', name: 'Display', fontFamily: fontStack(theme.fonts.heading, DEFAULT_THEME_STACKS.heading) },
    { slug: 'body', name: 'Body', fontFamily: fontStack(theme.fonts.body, DEFAULT_THEME_STACKS.body) },
  ],
});

/**
 * The editor's choices for this site: from the theme admin pages hand the browser (window.__siteTheme,
 * the site's theme as it is now), else the default. Read when a module loads, so admin pages set it
 * first (src/layouts/Admin.astro).
 */
export const PRESETS: Presets = themePresets((typeof window !== 'undefined' && cleanTheme((window as any).__siteTheme)) || DEFAULT_THEME);
