// Dev aid: aria snapshot and screenshot of an admin path, signed in as the screencast editor (AS=admin: the admin).
//   npx tsx --env-file=.env scripts/screencasts/explore.ts /admin/ out.png
import { admin, editor, launch, signedInState, ORIGIN, SIZE } from './lib';
const [path = '/admin/', out = 'explore.png'] = process.argv.slice(2);
const b = await launch();
const ctx = await b.newContext({ viewport: SIZE, storageState: await signedInState(b, process.env.AS === 'admin' ? admin : editor) });
const p = await ctx.newPage();
await p.goto(ORIGIN + path, { waitUntil: 'networkidle' });
console.log(await p.locator(process.env.SEL ?? 'body').first().ariaSnapshot());
if (out !== '-') await p.screenshot({ path: out });
await b.close();
