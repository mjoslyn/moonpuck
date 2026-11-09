// A site's share card fonts (render.ts `shareCard.fonts`), loaded by file name from anywhere under
// src/site/ as Cloudflare Data modules. Only the card renderer (server) imports this, so the editor's
// browser bundle, which loads the site's render.ts, never sees the font files.
import type { ShareCardFont } from '../share-card/design';

const FILES = import.meta.glob<{ default: ArrayBuffer }>('../../site/**/*.{woff,ttf,otf}.bin');

/** The fonts a site names, with their bytes; a name with no file is an error. */
export async function siteCardFonts(list: { name: string; file: string; weight?: ShareCardFont['weight']; style?: ShareCardFont['style'] }[]): Promise<ShareCardFont[]> {
  return Promise.all(
    list.map(async ({ file, ...font }) => {
      const path = Object.keys(FILES).find((p) => p.endsWith(`/${file}`));
      if (!path) throw new Error(`Share card font not found under src/site/: ${file}`);
      return { ...font, data: (await FILES[path]()).default };
    }),
  );
}
