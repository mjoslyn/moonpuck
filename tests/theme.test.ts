// Settings > Theme (src/lib/theme): what a saved theme may hold, the CSS it writes and the editor's choices.
import { describe, expect, it } from 'vitest';
import { cleanTheme, DEFAULT_THEME, themeCss, themeHead, themePresets } from '../src/lib/theme/theme';
import { fontFaces, fontStack } from '../src/lib/theme/fonts';

const theme = (over: Record<string, unknown> = {}) =>
  cleanTheme({
    colors: [
      { slug: 'ink', name: 'Ink', color: '#0d0f12', dark: true },
      { slug: 'blue', name: 'Blue', color: '#1f5fa8', dark: true, onDark: 'sky' },
      { slug: 'sky', name: 'Sky', color: '#9cc6ee' },
      { slug: 'white', name: 'White', color: '#ffffff', hidden: true },
    ],
    roles: { text: 'ink', accent: 'blue', dark: 'ink', 'on-dark': 'white' },
    bands: { text: 'white', 'button-bg': 'white' },
    buttons: { bg: 'blue' },
    fonts: { heading: 'anton', body: 'inter' },
    fontSizes: [{ slug: 'small', name: 'Small', size: '0.8rem' }],
    spacing: [{ slug: '40', name: '40', size: '1rem' }],
    layout: { content: '720px', wide: '1240px' },
    ...over,
  })!;

describe('cleanTheme', () => {
  it('keeps known shapes and drops unsafe values and unknown references', () => {
    const t = cleanTheme({
      colors: [{ slug: 'ink', name: 'Ink', color: '#000' }, { slug: 'bad', color: 'red;}</style><script>' }, { slug: 'Bad Slug', color: '#fff' }],
      roles: { text: 'ink', accent: 'nope', muted: 'url(x)' },
      fontSizes: [{ slug: 'big', size: '2rem;color:red' }, { slug: 'ok', size: 'clamp(1rem, 2vw, 2rem)' }],
      fonts: { heading: '</style>', body: 'lora' },
      layout: { content: 'expression(alert(1))' },
    })!;
    expect(t.colors.map((c) => c.slug)).toEqual(['ink']);
    expect(t.roles).toEqual({ text: 'ink' });
    expect(t.fontSizes.map((s) => s.slug)).toEqual(['ok']);
    expect(t.fonts).toEqual({ heading: undefined, body: 'lora' });
    expect(t.layout.content).toBeUndefined();
  });

  it('is undefined for nothing or a theme without colours', () => {
    expect(cleanTheme(undefined)).toBeUndefined();
    expect(cleanTheme({ colors: [] })).toBeUndefined();
  });

  it('keeps the default theme as it is', () => {
    expect(cleanTheme(DEFAULT_THEME)).toEqual(cleanTheme(cleanTheme(DEFAULT_THEME)));
  });
});

describe('themeCss', () => {
  it('writes the palette, roles, fonts, sizes and widths on the root', () => {
    const css = themeCss(theme());
    expect(css).toContain('--color-ink:#0d0f12');
    expect(css).toContain('--color-text:var(--color-ink)');
    expect(css).toContain(`--font-display:${fontStack('anton', '')}`);
    expect(css).toContain('--text-small:0.8rem');
    expect(css).toContain('--wide-size:1240px');
    expect(css).toContain('--button-bg:var(--color-blue)');
    expect(css).toContain('rgba(13, 15, 18, 0.85)');
  });

  it('re-maps dark bands: shades, the roles using them again, the band colours, on its dark colours and the site selectors', () => {
    const css = themeCss(theme(), ['.sb-band']);
    const band = css.split('\n').find((l) => l.includes('.c-hero'))!;
    expect(band).toContain("[style*='background-color:var(--color-ink)']");
    expect(band).toContain("[style*='background-color: var(--color-blue)']");
    expect(band).toContain('.sb-band');
    expect(band).not.toContain('--color-sky)\']');
    expect(band).toContain('--color-blue:var(--color-sky)');
    expect(band).toContain('--color-accent:var(--color-blue)');
    expect(band).not.toContain('--color-text:var(--color-ink)');
    expect(band).toContain('--button-bg:var(--color-white)');
    expect(band).toContain('color:var(--color-text)');
  });

  it("serves the theme's library fonts and preloads them", () => {
    expect(themeCss(theme())).toContain("src:url('/assets/fonts/library/anton-normal-latin.woff2')");
    expect(themeHead(theme())).toContain('<link rel="preload" href="/assets/fonts/library/inter-normal-latin.woff2"');
    expect(fontFaces(['system-sans'])).toBe('');
    expect(themeCss(theme({ fonts: { heading: "'Brand', serif" } }))).toContain("--font-display:'Brand', serif");
  });
});

describe('themePresets', () => {
  it("offers the theme's colours but those left out of the editor's choices", () => {
    const p = themePresets(theme());
    expect(p.colors.map((c) => c.slug)).toEqual(['ink', 'blue', 'sky']);
    expect(p.fontSizes).toEqual([{ slug: 'small', name: 'Small', size: '0.8rem' }]);
  });
});
