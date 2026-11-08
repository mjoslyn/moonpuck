#!/usr/bin/env node
// Takes the latest moonpuck core into a site (README.md, Updating the core): npm run core:update
//
// Before it changes anything it checks that the site has the `upstream` remote, no uncommitted changes
// and no merge under way, fetches upstream and tries the merge in memory (git merge-tree), listing
// every file that would conflict. Conflicts only in the files a site keeps as its own (KEEP) are taken
// as the site's; any other conflict stops it with the branch as it was. Then it merges, says which
// migrations came in and installs the dependencies when package.json or the lockfile changed.
//
//   npm run core:update                    merge upstream/main
//   npm run core:update -- --check         only check: what would come in, and any conflicts
//   npm run core:update -- --remote core --branch main --no-install
import { execFileSync, spawnSync } from 'node:child_process';

/** Files a site keeps as its own when the core changes them too. */
export const KEEP = ['AGENTS.md', 'README.md', '.env.example', 'wrangler.jsonc'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const remote = option('remote', 'upstream');
const branch = option('branch', 'main');
const target = `${remote}/${branch}`;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a) => spawnSync('git', a, { encoding: 'utf8' });
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const stop = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

// 1. Where we are.
if (tryGit('rev-parse', '--is-inside-work-tree').status !== 0) stop('This isn’t a git repository. Run it in the site’s folder.');
if (!lines(git('remote')).includes(remote)) stop(`There is no "${remote}" remote. Add the core as one first:\n  git remote add ${remote} https://github.com/<owner>/moonpuck.git`);
if (tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD').status === 0) stop('A merge is already under way. Finish it (git commit) or abort it (git merge --abort) first.');
const dirty = git('status', '--porcelain');
if (dirty) stop(`There are uncommitted changes. Commit or stash them first:\n${dirty}`);
const current = git('rev-parse', '--abbrev-ref', 'HEAD');
if (current === 'HEAD') stop('No branch is checked out (a detached HEAD). Check out the site’s branch first.');

// 2. What would come in.
console.log(`Fetching ${remote}…`);
const fetched = tryGit('fetch', remote, branch);
if (fetched.status !== 0) stop(`Fetching ${target} failed:\n${fetched.stderr.trim()}`);
const incoming = lines(git('log', '--oneline', `HEAD..${target}`));
if (!incoming.length) {
  console.log(`✓ Already up to date with ${target}.`);
  process.exit(0);
}
const base = git('merge-base', 'HEAD', target);
const changed = lines(git('diff', '--name-only', base, target));
const migrations = changed.filter((f) => /^db\/migrations\/.+\.sql$/.test(f) && tryGit('cat-file', '-e', `HEAD:${f}`).status !== 0);
const depsChanged = changed.some((f) => f === 'package.json' || f === 'package-lock.json');
console.log(`${incoming.length} core commit${incoming.length === 1 ? '' : 's'} to take into ${current}:`);
for (const c of incoming.slice(0, 15)) console.log(`  ${c}`);
if (incoming.length > 15) console.log(`  … and ${incoming.length - 15} more`);

// 3. The merge, in memory: which files would conflict (git 2.38 and later).
const tree = tryGit('merge-tree', '--write-tree', '--name-only', '--no-messages', 'HEAD', target);
let conflicts = null;
if (tree.status === 0) conflicts = [];
else if (tree.status === 1) conflicts = lines(tree.stdout).slice(1);
else console.log('\n(This git can’t try the merge first; it needs git 2.38 or later. Conflicts show when merging.)');
const own = (conflicts ?? []).filter((f) => KEEP.includes(f));
const others = (conflicts ?? []).filter((f) => !KEEP.includes(f));
// Files outside src/site/ the site has changed: where conflicts come from (the core's files are best left to the core).
const siteTouched = lines(git('diff', '--name-only', base, 'HEAD')).filter((f) => !f.startsWith('src/site/') && !/^db\/migrations\/\d+_site_/.test(f) && !KEEP.includes(f));
if (conflicts) {
  if (!conflicts.length) console.log('\n✓ It merges without conflicts.');
  if (own.length) console.log(`\nThe site keeps its own ${own.join(', ')} (changed by the core too).`);
  if (others.length) {
    console.log(`\n✗ These files would conflict:\n${others.map((f) => `  ${f}`).join('\n')}`);
    console.log('\nThey are core files the site has changed. Move the site’s change into src/site/ (or send it to the core), or merge by hand:');
    console.log(`  git merge ${target}`);
  }
}
if (siteTouched.length) console.log(`\nNote: the site has changed ${siteTouched.length} core file${siteTouched.length === 1 ? '' : 's'} outside src/site/: ${siteTouched.slice(0, 10).join(', ')}${siteTouched.length > 10 ? '…' : ''}`);
if (migrations.length) console.log(`\nNew migrations:\n${migrations.map((f) => `  ${f}`).join('\n')}`);
if (flag('check')) process.exit(others.length ? 1 : 0);
if (others.length) process.exit(1);

// 4. The merge.
console.log(`\nMerging ${target}…`);
const merged = tryGit('merge', '--no-ff', '--no-edit', '-m', `Merge ${target} (core update)`, target);
if (merged.status !== 0) {
  const unmerged = lines(git('diff', '--name-only', '--diff-filter=U'));
  const notOwn = unmerged.filter((f) => !KEEP.includes(f));
  if (!unmerged.length || notOwn.length) {
    tryGit('merge', '--abort');
    stop(`The merge stopped${notOwn.length ? ` on conflicts in ${notOwn.join(', ')}` : ''}, so it was undone and the branch is as it was:\n${merged.stdout}${merged.stderr}`);
  }
  for (const f of unmerged) {
    git('checkout', '--ours', '--', f);
    git('add', '--', f);
  }
  const done = tryGit('commit', '--no-edit');
  if (done.status !== 0) {
    tryGit('merge', '--abort');
    stop(`The merge couldn’t be committed, so it was undone:\n${done.stderr}`);
  }
  console.log(`Kept the site’s own ${unmerged.join(', ')}.`);
}
console.log(`✓ Merged ${incoming.length} core commit${incoming.length === 1 ? '' : 's'}.`);

// 5. After.
if (depsChanged && !flag('no-install')) {
  console.log('\nThe dependencies changed: npm install…');
  const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], { stdio: 'inherit' });
  if (npm.status !== 0) console.log('✗ npm install failed: run it again before starting the site.');
}
console.log('\nNext:');
if (migrations.length) console.log('  npm run db:migrate                     # the local database (the deployed one: npm run deploy:remote)');
console.log('  npx tsx --env-file=.env scripts/migrate-content.ts   # if stored content needs migrating');
console.log('  npm run check && npm test');
if (depsChanged) console.log('  restart the dev server (the dependencies changed)');
console.log('  then push the site, which deploys it.');
