// Share cards' designs (safe anywhere: no WebAssembly). A design is a function from what the card
// shows (ShareCardView) to an element tree that Satori lays out at 1200 by 630: plain objects of
// { type, props: { style, children } }, written with `h`. Satori takes a subset of CSS: every element
// with more than one child needs `display: flex`; sizes are in pixels.
// https://github.com/vercel/satori#css

/** A card's size in pixels (Open Graph's 1.91:1). */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export type CardStyle = Record<string, string | number>;
export interface CardNode {
  type: string;
  props: { style?: CardStyle; src?: string; width?: number; height?: number; children?: CardChild | CardChild[] };
}
export type CardChild = CardNode | string | null | undefined | false;

/** An element: h('div', { display: 'flex' }, ...children); an image: h('img', style, { src, width, height }). */
export function h(type: string, style: CardStyle = {}, ...children: (CardChild | { src: string; width?: number; height?: number })[]): CardNode {
  const attrs = children[0] && typeof children[0] === 'object' && !('type' in children[0]) ? (children.shift() as { src: string; width?: number; height?: number }) : {};
  const kids = (children as CardChild[]).filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  return { type, props: { ...attrs, style, ...(kids.length ? { children: kids.length === 1 ? kids[0] : kids } : {}) } };
}

/** What a card shows. */
export interface ShareCardView {
  /** The page's title (plain text). */
  title: string;
  /** What the page is ("Event", a taxonomy's name), or '' (pages, the home page). */
  label: string;
  /** The site's name (Settings). */
  siteName: string;
  /** The home page's card. */
  isFront: boolean;
  /** The site's tagline (Settings), on the home page's card. */
  tagline: string;
  /** The photo: the page's featured image (else the default share image), as a data URL, with its size. */
  image?: { src: string; width: number; height: number };
  /** The site icon (Settings > Social), as a data URL. */
  icon?: string;
}

/** A font for cards: WOFF, TTF or OTF bytes (Satori reads no WOFF2). */
export interface ShareCardFont {
  name: string;
  data: ArrayBuffer;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style?: 'normal' | 'italic';
}

/** Colors of the core's design (a site sets its own in render.ts, shareCard.colors). */
export interface ShareCardColors {
  background: string;
  text: string;
  muted: string;
  accent: string;
}
export const DEFAULT_CARD_COLORS: ShareCardColors = { background: '#1f2430', text: '#ffffff', muted: '#c5cad3', accent: '#f0b35a' };

/** A title's size: smaller as it gets longer, so up to three lines fit. */
export const titleSize = (title: string, sizes: [number, number, number] = [72, 60, 48]) => (title.length <= 28 ? sizes[0] : title.length <= 56 ? sizes[1] : sizes[2]);

/** The core's card: the label and title over the site's name (on the home page: its name over its
 * tagline), the photo on the right. */
export function coreCard(v: ShareCardView, c: ShareCardColors = DEFAULT_CARD_COLORS): CardNode {
  const title = v.isFront ? v.siteName : v.title;
  const footer = v.isFront
    ? v.tagline
      ? h('div', { fontSize: 30, lineHeight: 1.35, color: c.muted, lineClamp: 3, display: 'block' }, v.tagline)
      : null
    : h(
        'div',
        { display: 'flex', alignItems: 'center', fontSize: 26, color: c.muted },
        v.icon ? h('img', { width: 48, height: 48, borderRadius: 8, marginRight: 16 }, { src: v.icon, width: 48, height: 48 }) : null,
        v.siteName,
      );
  return h(
    'div',
    { width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', background: c.background, color: c.text, fontFamily: 'Inter' },
    h(
      'div',
      { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: v.image ? 700 : CARD_WIDTH, padding: '72px 64px 64px 72px', borderBottom: `10px solid ${c.accent}` },
      h(
        'div',
        { display: 'flex', flexDirection: 'column' },
        v.isFront && v.icon ? h('img', { width: 96, height: 96, borderRadius: 16, marginBottom: 36 }, { src: v.icon, width: 96, height: 96 }) : null,
        v.label ? h('div', { fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: c.accent, marginBottom: 20 }, v.label) : null,
        h('div', { fontSize: titleSize(title), fontWeight: 700, lineHeight: 1.08, lineClamp: 3, display: 'block' }, title),
      ),
      footer,
    ),
    v.image ? h('img', { width: 500, height: CARD_HEIGHT, objectFit: 'cover' }, { src: v.image.src, width: 500, height: CARD_HEIGHT }) : null,
  );
}

/** A site's share cards (render.ts `shareCard`): its design, fonts and colors. */
export interface ShareCardDesign {
  /** The card (else the core's, `coreCard`, in `colors`). */
  render?: (v: ShareCardView) => CardNode;
  /** Its fonts, loaded when a card is drawn: import the files as `.bin` modules (Cloudflare's Data
   * modules) inside the function, so nothing else loads them. Without: the core's Inter, 400 and 700. */
  fonts?: () => Promise<ShareCardFont[]>;
  /** Colors for the core's design. */
  colors?: Partial<ShareCardColors>;
  /** Change it when the design changes, so every card is made again. */
  version?: string;
}
