// What a demo (src/lib/demo) refuses in visitors' saves: markup that would run script in other
// visitors' browsers (rich text is stored and shown as HTML, src/render/c/content.ts) and offensive words
// (src/lib/demo/words.ts, kept as hashes so the repository doesn't spell them out; `wordHash`). It reads
// every string a request carries, JSON or a form, decoded, so escapes don't hide them. Safe in the browser.
import { BLOCKED_HASHES, BLOCKED_STEMS } from './words';

export type Blocked = 'markup' | 'words';

/** Letters written as digits or signs, as offensive words often are. */
const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

/** Text as words are compared: lower case, without accents, digits and signs read as the letters they stand for. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[01345780@$!|]/g, (c) => SWAPS[c]);
}

/** A word as written, with letters repeated three times or more cut to two, and with every repeat cut to one
 *  ("fuuuck", "shiiit"), so stretched words match while different words never collapse into one another. */
const variants = (w: string) => [w, w.replace(/(.)\1{2,}/g, '$1$1'), w.replace(/(.)\1+/g, '$1')];
/** A word's hash as the list keeps it (cyrb53, 53 bits, as 14 hex digits): `npm run demo:words` makes the list. */
export function wordHash(word: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const EXACT = new Set(BLOCKED_HASHES);
const STEM_LENGTHS = [...new Set(BLOCKED_STEMS.map((s) => s.length))];
const STEMS = new Set(BLOCKED_STEMS.map((s) => s.hash));

/** Whether one word is blocked: itself, or starting with a blocked stem. */
const blockedWord = (w: string) => EXACT.has(wordHash(w)) || STEM_LENGTHS.some((n) => w.length >= n && STEMS.has(wordHash(w.slice(0, n))));

/** Whether the text holds a blocked word. */
export function offensive(text: string): boolean {
  for (const raw of normalize(text).split(/[^a-z]+/)) {
    if (!raw) continue;
    if (variants(raw).some(blockedWord)) return true;
  }
  return false;
}

/** HTML's character references decoded (named ones a script could hide in, and numeric ones). */
const char = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ');
function decodeRefs(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,8});?/gi, (_, h) => char(Number.parseInt(h, 16)))
    .replace(/&#(\d{1,8});?/g, (_, d) => char(Number(d)))
    .replace(/&(colon|tab|newline|lpar|rpar|sol|period|quot|apos|lt|gt|amp);?/gi, (_, n) => ({ colon: ':', tab: '\t', newline: '\n', lpar: '(', rpar: ')', sol: '/', period: '.', quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[n.toLowerCase() as 'colon'] ?? ' ');
}

const TAGS = /<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|style|link|meta|base|form|svg|math|template|noscript)\b/i;
// An event handler attribute anywhere, not only up to a tag's first `>`: a `>` inside a quoted value
// (`<img alt=">" onerror=...>`) doesn't end the tag for a browser, so no pattern may assume it does.
const HANDLER = /[\s/"'`]on[a-z]+\s*=/i;
const URL_SCHEMES = /(javascript|vbscript|livescript)\s*:|data\s*:\s*text\/html/i;

/** Whether the text is markup that could run script: script-carrying tags, event handlers, script addresses. */
export function unsafeMarkup(text: string): boolean {
  if (/srcdoc\s*=/i.test(text)) return true;
  const decoded = decodeRefs(text);
  if (TAGS.test(decoded) || HANDLER.test(decoded)) return true;
  // Addresses are read with the spaces and controls browsers skip taken out.
  return URL_SCHEMES.test(decoded.replace(/[\s\u0000-\u001f]+/g, ''));
}

/** Every string in a value (a parsed JSON body), keys included. */
export function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    out.push(k);
    stringsOf(v, out);
  }
  return out;
}

/** What is wrong with these strings for a demo, if anything. */
export function blockedText(strings: string[]): Blocked | null {
  for (const s of strings) if (unsafeMarkup(s)) return 'markup';
  for (const s of strings) if (offensive(s)) return 'words';
  return null;
}

export const BLOCKED_MESSAGE: Record<Blocked, string> = {
  markup: "This demo doesn't take scripts, frames or embedded code. Take them out and save again.",
  words: "This demo doesn't take that wording. Change it and save again.",
};
