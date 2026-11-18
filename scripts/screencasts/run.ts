// Record the Editor guide's screencasts (see lib.ts). With names, only those scenes.
//   npx tsx --env-file=.env scripts/screencasts/run.ts [index pages-and-posts ...]
// Restores the demo state before each scene (reset.sh); NO_RESET=1 skips that.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { launch, record, signedInState, type SceneDef } from './lib';

const dir = new URL('./scenes/', import.meta.url);
const all = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, ''));
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : all;
const unknown = names.filter((n) => !all.includes(n));
if (unknown.length) throw new Error(`no scene: ${unknown.join(', ')} (have: ${all.join(', ')})`);

const browser = await launch();
try {
  for (const name of names) {
    // Every scene starts from the same demo state (reset.sh), so what one scene makes isn't in the next.
    if (existsSync('.screencast-state') && !process.env.NO_RESET) {
      if (spawnSync('sh', ['scripts/screencasts/reset.sh'], { stdio: 'ignore' }).status !== 0) throw new Error('reset.sh failed');
    }
    const def: SceneDef = (await import(new URL(`${name}.ts`, dir).href)).default;
    // A fresh session per scene: a scene that signs out mustn't end the next one's.
    const state = def.signedIn === false ? undefined : await signedInState(browser);
    const t = Date.now();
    const out = await record(browser, def, state);
    console.log(`${out} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
} finally {
  await browser.close();
}
