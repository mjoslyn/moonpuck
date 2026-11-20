// The blocks of a page's content or an email design, for comments on them (src/lib/share/comments.ts) and
// for marking them on a page (RenderCtx.markBlocks). Safe in the browser: the renderer, which the editor's
// bundle loads too, reads them.

/** The most words of a block kept with a comment on it. */
export const QUOTE_MAX = 200;

type Item = { type: string; props?: Record<string, any> };

/** Every block of a page's content (its blocks, those inside them and in its root's slots) or an email
 * design (its blocks and those in Sections and Columns), by id with its type and a few words of it. */
export function blocksOf(doc: any): Map<string, { type: string; words: string }> {
  const out = new Map<string, { type: string; words: string }>();
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items as Item[]) {
      if (!item || typeof item !== 'object' || !item.props) continue;
      const id = item.props.id;
      if (id != null && id !== '') out.set(String(id), { type: String(item.type ?? ''), words: wordsOf(item) });
      walk(item.props.children);
      for (const v of Object.values(item.props.attrs ?? {})) walk(v);
      // Email blocks keep their settings, and their inner blocks, on props itself.
      for (const v of Object.values(item.props)) walk(v);
    }
  };
  walk(doc?.content);
  for (const v of Object.values(doc?.root?.props ?? {})) walk(v);
  return out;
}

/** The ids of a page's blocks: those a preview marks for comments. */
export const blockIdsOf = (doc: any): Set<string> => new Set(blocksOf(doc).keys());

/** A few words of a block's own text, for showing which block a comment is on. */
function wordsOf(item: Item): string {
  const p = item.props ?? {};
  const a = p.attrs ?? {};
  const raw = [a.content, a.text, a.title, a.heading, a.label, a.caption, p.text, p.html, p.label, p.heading].find((v) => typeof v === 'string' && v.trim()) ?? '';
  return plain(String(raw)).slice(0, QUOTE_MAX);
}

/** Text with its markup and runs of spaces taken out. */
export const plain = (s: string) => s.replace(/<[^>]*>?/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

