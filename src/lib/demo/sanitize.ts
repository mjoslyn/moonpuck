// An allowlist sanitizer for a demo (src/lib/demo): HTML is parsed as a browser would (htmlparser2, which
// knows that a `>` inside a quoted value doesn't end a tag) and only the formatting the editor, Compose and
// imports make is kept: known tags, known attributes on them, and links and images to web, mail, phone or
// site addresses. Everything else goes: unknown tags (their text kept), script-carrying elements with their
// content, every other attribute (`on…` handlers among them), comments. On a demo the render engine cleans
// every block's settings with it (`cleanAttrs`, src/render/engine.ts), so whatever got stored, by whatever
// path, renders without script; the demo guard's patterns (src/lib/demo/content.ts) still refuse the obvious
// at the door. Safe in the browser: the editor's canvas renders through the same engine.
import { Parser } from 'htmlparser2';

/** Tags kept, each with the attributes it may carry (besides GLOBAL). */
const TAGS: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
  abbr: [],
  b: [],
  blockquote: ['cite'],
  br: [],
  cite: [],
  code: [],
  del: [],
  div: [],
  em: [],
  figcaption: [],
  figure: [],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  hr: [],
  i: [],
  img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
  ins: [],
  kbd: [],
  li: ['value'],
  mark: [],
  ol: ['start', 'type', 'reversed'],
  p: [],
  pre: [],
  q: ['cite'],
  s: [],
  small: [],
  span: [],
  strong: [],
  sub: [],
  sup: [],
  table: [], thead: [], tbody: [], tfoot: [], tr: [],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  u: [],
  ul: [],
  wbr: [],
};
const GLOBAL = ['class', 'style', 'title', 'lang', 'dir'];
const VOID = new Set(['br', 'hr', 'img', 'wbr']);
/** Elements dropped with everything inside them (their content isn't text to keep). */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'template', 'noscript', 'noembed', 'noframes', 'textarea', 'select', 'option', 'svg', 'math', 'title', 'head', 'xmp', 'plaintext']);
const URL_ATTRS = new Set(['href', 'src', 'cite']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

/** An address a link or image may have: web, mail and phone links, and the site's own paths, anchors and
 *  queries (or a relative address with no scheme). Read as a browser would: spaces and controls ignored. */
export function safeUrl(value: string): boolean {
  const v = value.replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase();
  const scheme = v.match(/^([a-z][a-z0-9+.-]*):/);
  return !scheme || ['http', 'https', 'mailto', 'tel'].includes(scheme[1]);
}

/** A style attribute kept only when it can't load or run anything (no url(), expression(), imports or
 *  old IE behaviours), so colors, sizes and alignment the editor writes stay. */
const safeStyle = (value: string) => !/url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:/i.test(value);

/** HTML with only the allowed tags, attributes and addresses kept. */
export function sanitizeHtml(html: string): string {
  let out = '';
  let dropping = 0;
  const open: string[] = [];
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (dropping || DROP_WITH_CONTENT.has(name)) {
          if (!VOID.has(name)) dropping++;
          return;
        }
        const allowed = TAGS[name];
        if (!allowed) return;
        let attrs = '';
        for (const [k, raw] of Object.entries(attribs)) {
          const key = k.toLowerCase();
          if (!allowed.includes(key) && !GLOBAL.includes(key)) continue;
          if (URL_ATTRS.has(key) && !safeUrl(raw)) continue;
          if (key === 'style' && !safeStyle(raw)) continue;
          if (key === 'target' && !['_blank', '_self'].includes(raw)) continue;
          attrs += ` ${key}="${escAttr(raw)}"`;
        }
        // A link opened in a new tab can't reach back to this page.
        if (name === 'a' && attribs.target === '_blank' && !/\bnoopener\b/i.test(attribs.rel ?? '')) attrs = attrs.replace(/ rel="[^"]*"/, '') + ` rel="${escAttr(`${attribs.rel ? `${attribs.rel} ` : ''}noopener`)}"`;
        out += `<${name}${attrs}>`;
        if (!VOID.has(name)) open.push(name);
      },
      ontext(text) {
        if (!dropping) out += esc(text);
      },
      onclosetag(name) {
        if (VOID.has(name)) return;
        // Inside a dropped element every opened tag counts, so its closing tag ends the drop.
        if (dropping) {
          dropping--;
          return;
        }
        if (!TAGS[name]) return;
        const i = open.lastIndexOf(name);
        if (i < 0) return;
        // Close what is still open inside it too, so the output's tags always balance.
        while (open.length > i) out += `</${open.pop()}>`;
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true, recognizeSelfClosing: true },
  );
  parser.write(html);
  parser.end();
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** Settings names that hold an address, whose value a block puts in href or src as it is. */
const ADDRESS_KEY = /(^|[^a-z])(href|url|src|link|action|poster)($|[^a-z])|Url$|Href$|Link$/i;

/** A block's settings cleaned for a demo: every string holding markup sanitized, and addresses that would
 *  run script blanked. Strings without `<` are left as they are (they are text, CSS values or addresses). */
export function cleanAttrs<T>(value: T, key = ''): T {
  if (typeof value === 'string') {
    if (ADDRESS_KEY.test(key) && !safeUrl(value)) return '' as T;
    return (value.includes('<') ? sanitizeHtml(value) : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => cleanAttrs(v, key)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = cleanAttrs(v, k);
    return out as T;
  }
  return value;
}
