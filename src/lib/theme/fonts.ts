// The fonts a theme can choose (Settings > Theme), served from the site (public/assets/fonts/library/,
// latin and latin-ext WOFF2, SIL Open Font License; OFL.txt beside them): a page links only the faces of
// the fonts its theme uses (`fontFaces`). Safe in the browser.

/** Google Fonts' latin and latin-ext ranges, so a page downloads latin-ext only when it shows such text. */
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

export const FONT_DIR = '/assets/fonts/library/';

export interface LibraryFont {
  id: string;
  /** The family name pages use. */
  name: string;
  kind: 'serif' | 'sans' | 'display' | 'system';
  /** The CSS font-family value: the family, then fallbacks. */
  stack: string;
  /** Its faces: style and weight range (variable fonts) or weight; none for system fonts. */
  faces: { style: 'normal' | 'italic'; weight: string }[];
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const FONT_LIBRARY: LibraryFont[] = [
  { id: 'system-sans', name: 'System sans-serif', kind: 'system', stack: SANS, faces: [] },
  { id: 'system-serif', name: 'System serif', kind: 'system', stack: "Georgia, 'Times New Roman', serif", faces: [] },
  { id: 'inter', name: 'Inter', kind: 'sans', stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", faces: [{ style: 'normal', weight: '400 700' }] },
  { id: 'work-sans', name: 'Work Sans', kind: 'sans', stack: "'Work Sans', -apple-system, BlinkMacSystemFont, sans-serif", faces: [{ style: 'normal', weight: '300 700' }] },
  { id: 'dm-sans', name: 'DM Sans', kind: 'sans', stack: `'DM Sans', ${SANS}`, faces: [{ style: 'normal', weight: '100 1000' }, { style: 'italic', weight: '100 1000' }] },
  { id: 'montserrat', name: 'Montserrat', kind: 'sans', stack: `'Montserrat', ${SANS}`, faces: [{ style: 'normal', weight: '100 900' }, { style: 'italic', weight: '100 900' }] },
  { id: 'source-sans-3', name: 'Source Sans 3', kind: 'sans', stack: `'Source Sans 3', ${SANS}`, faces: [{ style: 'normal', weight: '200 900' }, { style: 'italic', weight: '200 900' }] },
  { id: 'fraunces', name: 'Fraunces', kind: 'serif', stack: "'Fraunces', Georgia, serif", faces: [{ style: 'normal', weight: '300 700' }, { style: 'italic', weight: '300 400' }] },
  { id: 'lora', name: 'Lora', kind: 'serif', stack: "'Lora', Georgia, serif", faces: [{ style: 'normal', weight: '400 700' }, { style: 'italic', weight: '400 700' }] },
  { id: 'merriweather', name: 'Merriweather', kind: 'serif', stack: "'Merriweather', Georgia, serif", faces: [{ style: 'normal', weight: '300 900' }, { style: 'italic', weight: '300 900' }] },
  { id: 'playfair-display', name: 'Playfair Display', kind: 'serif', stack: "'Playfair Display', Georgia, serif", faces: [{ style: 'normal', weight: '400 900' }, { style: 'italic', weight: '400 900' }] },
  { id: 'source-serif-4', name: 'Source Serif 4', kind: 'serif', stack: "'Source Serif 4', Georgia, serif", faces: [{ style: 'normal', weight: '200 900' }, { style: 'italic', weight: '200 900' }] },
  { id: 'anton', name: 'Anton', kind: 'display', stack: "'Anton', Impact, 'Arial Narrow', sans-serif", faces: [{ style: 'normal', weight: '400' }] },
  { id: 'oswald', name: 'Oswald', kind: 'display', stack: "'Oswald', Impact, 'Arial Narrow', sans-serif", faces: [{ style: 'normal', weight: '200 700' }] },
];

export const libraryFont = (id: string | undefined) => FONT_LIBRARY.find((f) => f.id === id);

/** A theme's font: a library font's stack, else the value itself (a site's own family and fallbacks). */
export const fontStack = (font: string | undefined, fallback: string) => libraryFont(font)?.stack ?? (font && font.trim() ? font.trim() : fallback);

/** The @font-face rules of these library fonts (each once). */
export function fontFaces(ids: (string | undefined)[]): string {
  const out: string[] = [];
  for (const f of FONT_LIBRARY.filter((x) => ids.includes(x.id))) {
    for (const face of f.faces) {
      for (const [subset, range] of [['latin', LATIN], ['latin-ext', LATIN_EXT]] as const) {
        out.push(`@font-face{font-family:'${f.name}';font-style:${face.style};font-weight:${face.weight};font-display:swap;src:url('${FONT_DIR}${f.id}-${face.style}-${subset}.woff2') format('woff2');unicode-range:${range}}`);
      }
    }
  }
  return out.join('\n');
}

/** Preload links for the upright latin face of these fonts (what most pages show first). */
export const fontPreloads = (ids: (string | undefined)[]) =>
  FONT_LIBRARY.filter((f) => ids.includes(f.id) && f.faces.some((x) => x.style === 'normal'))
    .map((f) => `<link rel="preload" href="${FONT_DIR}${f.id}-normal-latin.woff2" as="font" type="font/woff2" crossorigin />`)
    .join('\n');
