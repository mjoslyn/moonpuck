// Writes src/lib/demo/words.ts, the words a demo refuses (src/lib/demo/content.ts), as hashes, from a
// plain list kept outside the repository: one word a line, `*` at the end for a stem (a word no ordinary
// word starts with), `#` for comments. Words are lower case letters a-z.
//   npm run demo:words -- path/to/words.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { wordHash } from '../src/lib/demo/content';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run demo:words -- <words.txt>');
  process.exit(1);
}
const lines = readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim().toLowerCase()).filter(Boolean);
const bad = lines.filter((l) => !/^[a-z]+\*?$/.test(l));
if (bad.length) {
  console.error(`Only letters a-z, with an optional * at the end: ${bad.join(', ')}`);
  process.exit(1);
}
const exact = [...new Set(lines.filter((l) => !l.endsWith('*')).map(wordHash))].sort();
const stems = [...new Map(lines.filter((l) => l.endsWith('*')).map((l) => l.slice(0, -1)).map((s) => [`${s.length}:${wordHash(s)}`, { length: s.length, hash: wordHash(s) }])).values()];
const rows = (items: string[]) => items.map((x) => `  ${x},`).join('\n');
writeFileSync(
  new URL('../src/lib/demo/words.ts', import.meta.url),
  `// Words a demo (src/lib/demo) refuses in what visitors save: profanity, sexual terms and slurs, kept as
// hashes (wordHash in src/lib/demo/content.ts) so the repository doesn't spell them out. Each is matched as
// a whole word after normalizing (any case, accents, common letter-for-digit swaps, stretched letters); a
// stem also matches longer words starting with it. Made by scripts/demo-words.ts from a list kept elsewhere:
//   npm run demo:words -- path/to/words.txt
export const BLOCKED_HASHES: string[] = [
${rows(exact.map((h) => `'${h}'`))}
];
export const BLOCKED_STEMS: { length: number; hash: string }[] = [
${rows(stems.map((s) => `{ length: ${s.length}, hash: '${s.hash}' }`))}
];
`,
);
console.log(`${exact.length} words and ${stems.length} stems written to src/lib/demo/words.ts`);
