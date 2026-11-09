// Draws a share card (src/lib/share-card/card.ts) as a PNG: Satori lays the design out as SVG (text as
// paths, in the design's fonts) and resvg draws it, both as WebAssembly modules the Worker loads with
// the code (Cloudflare's CompiledWasm modules). Imported only by the card route, on demand.
import satori, { init } from 'satori/standalone';
import yoga from 'satori/yoga.wasm';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { SITE_RENDER } from '../site/render';
import { siteCardFonts } from '../site/share-card-fonts';
import { siteStorage } from '../storage';
import { CARD_HEIGHT, CARD_WIDTH, DEFAULT_CARD_COLORS, coreCard, type ShareCardFont, type ShareCardView } from './design';
import type { ShareCardData } from './card';
import type { Media } from '../types';
import { downsize } from '../media/image';

let ready: Promise<unknown> | null = null;
let coreFonts: Promise<ShareCardFont[]> | null = null;
let siteFonts: Promise<ShareCardFont[]> | null = null;

const loadCoreFonts = async (): Promise<ShareCardFont[]> => [
  { name: 'Inter', data: (await import('./fonts/inter-400.woff.bin')).default, weight: 400, style: 'normal' },
  { name: 'Inter', data: (await import('./fonts/inter-700.woff.bin')).default, weight: 700, style: 'normal' },
];

/** Image types Satori draws. */
const DRAWN: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A file in the media folder as a data URL, if it is a JPEG or PNG. */
async function dataUrl(path: string): Promise<string | undefined> {
  const type = DRAWN[path.split('.').pop()?.toLowerCase() ?? ''];
  if (!type) return undefined;
  const { data } = await siteStorage().from('media').download(path);
  return data ? `data:${type};base64,${base64(new Uint8Array(await data.arrayBuffer()))}` : undefined;
}

/** The photo: the image's large size (else its full size) when it is a JPEG or PNG. */
async function photo(media: Media | undefined): Promise<ShareCardView['image']> {
  if (!media) return undefined;
  for (const size of ['large', 'full']) {
    const s = downsize(media, size);
    const src = s.width && s.height ? await dataUrl(s.path).catch(() => undefined) : undefined;
    if (src) return { src, width: s.width, height: s.height };
  }
  return undefined;
}

/** The PNG of a card, given its photo's media row. */
export async function renderCard(card: ShareCardData, media?: Media): Promise<Uint8Array> {
  ready ??= Promise.all([init(yoga), initWasm(resvgWasm)]);
  const design = SITE_RENDER.shareCard;
  coreFonts ??= loadCoreFonts();
  siteFonts ??= siteCardFonts(design?.fonts ?? []).catch((e) => {
    siteFonts = null;
    throw e;
  });
  const [, core, own, image, icon] = await Promise.all([ready, coreFonts, siteFonts, photo(media), card.iconPath ? dataUrl(card.iconPath).catch(() => undefined) : undefined]);
  const view: ShareCardView = { title: card.title, label: card.label, siteName: card.siteName, isFront: card.isFront, tagline: card.tagline, image, icon };
  const tree = design?.render ? design.render(view) : coreCard(view, { ...DEFAULT_CARD_COLORS, ...design?.colors });
  // Satori's types expect React elements; a design is the same shape as plain objects.
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: [...own, ...core] });
  return new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } }).render().asPng();
}
