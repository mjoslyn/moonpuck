// A site's plugins from their own repositories (CORE.md, Plugins; README.md, Plugins). Each is a squashed
// git subtree at src/site/plugins/<name>/, its repository and branch in src/site/plugins.json, so its
// files are committed in the site (deploys need nothing else). The core's update (npm run core:update)
// never touches them; this updates them.
//
//   npm run plugins:add -- <repository> [--name <name>] [--ref <branch or tag>]
//   npm run plugins:update                    every plugin to its branch's latest
//   npm run plugins:update -- square-sync     only some
//   npm run plugins:update -- --check         only check: what would come in
//   npm run plugins:list
//
// Each stops before changing anything if there are uncommitted changes or a merge under way. After an
// add or update, the plugins' new migrations are copied into db/migrations and committed.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { copyPluginMigrations } from './lib/site-migrations';
import { lastSplit, MANIFEST, nameFromRepo, pluginDir, PLUGINS_DIR, readManifest, validName, writeManifest } from './lib/plugin-repos';

const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--name', '--ref'].includes(args[i - 1])));

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a: string[]) => spawnSync('git', a, { encoding: 'utf8' });
const stop = (message: string): never => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

function ready() {
  if (tryGit('rev-parse', '--is-inside-work-tree').status !== 0) stop('This isn’t a git repository. Run it in the site’s folder.');
  if (tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD').status === 0) stop('A merge is already under way. Finish it (git commit) or abort it (git merge --abort) first.');
  const dirty = git('status', '--porcelain');
  if (dirty) stop(`There are uncommitted changes. Commit or stash them first:\n${dirty}`);
}

/** The plugins' new migrations copied into db/migrations and committed. */
function copyMigrations() {
  const { copied, changed } = copyPluginMigrations(PLUGINS_DIR, 'db/migrations');
  for (const f of changed) console.warn(`! ${f} differs from db/migrations/${f}, which is kept: a migration once applied doesn't change, so the plugin should add a new one.`);
  if (!copied.length) return [];
  git('add', '--', ...copied.map((f) => `db/migrations/${f}`));
  git('commit', '-m', `Copy plugin migrations: ${copied.join(', ')}`);
  console.log(`New migrations:\n${copied.map((f) => `  db/migrations/${f}`).join('\n')}`);
  return copied;
}

function next(migrations: string[]) {
  console.log('\nNext:');
  if (migrations.length) console.log('  npm run db:migrate                     # the local database (the deployed one: npm run deploy:remote)');
  console.log('  npx tsx scripts/db-schema.ts           # if a plugin\'s tables changed');
  console.log('  npm run check && npm test');
  console.log('  then push the site, which deploys it.');
}

function add() {
  const repo = positional[0] ?? stop('Name the plugin’s repository: npm run plugins:add -- https://github.com/<owner>/<repo>.git');
  const name = option('name') ?? nameFromRepo(repo);
  const ref = option('ref') ?? 'main';
  if (!validName(name)) stop(`"${name}" isn’t a plugin name (lower case letters, digits and dashes). Give one with --name.`);
  const manifest = readManifest();
  if (manifest[name]) stop(`${name} is already installed (${manifest[name].repo}). Update it with npm run plugins:update -- ${name}.`);
  if (fs.existsSync(pluginDir(name))) stop(`${pluginDir(name)} already exists.`);
  ready();
  console.log(`Adding ${repo} (${ref}) at ${pluginDir(name)}…`);
  const done = tryGit('subtree', 'add', `--prefix=${pluginDir(name)}`, repo, ref, '--squash', '-m', `Add plugin ${name} from ${repo} ${ref}`);
  if (done.status !== 0) stop(`git subtree add failed:\n${done.stdout}${done.stderr}`);
  writeManifest({ ...manifest, [name]: { repo, ref } });
  git('add', '--', MANIFEST);
  git('commit', '-m', `List plugin ${name} in ${MANIFEST}`);
  console.log(`✓ Added ${name}.`);
  const migrations = copyMigrations();
  console.log(`\nWire it in (see the plugin's README): its server part in src/site/server.ts, its blocks and panels in render.ts and editor.tsx, its policies in src/site/db.ts, its pages in routes.json.`);
  next(migrations);
}

function update() {
  const manifest = readManifest();
  const names = positional.length ? positional : Object.keys(manifest);
  if (!names.length) {
    console.log(`No plugins are installed (${MANIFEST}).`);
    return;
  }
  for (const n of names) if (!manifest[n]) stop(`${n} isn’t installed. Installed: ${Object.keys(manifest).join(', ') || 'none'}.`);
  if (!flag('check')) ready();
  const log = git('log', '-z', '--format=%B', '--grep=git-subtree-dir:');
  let changedAny = false;
  for (const name of names) {
    const { repo, ref } = manifest[name];
    const fetched = tryGit('fetch', '--quiet', repo, ref);
    if (fetched.status !== 0) stop(`Fetching ${repo} ${ref} failed:\n${fetched.stderr.trim()}`);
    const latest = git('rev-parse', 'FETCH_HEAD');
    const had = lastSplit(log, pluginDir(name));
    if (had && (had === latest || latest.startsWith(had))) {
      console.log(`✓ ${name} is up to date (${ref}).`);
      continue;
    }
    const incoming = had && tryGit('cat-file', '-e', `${had}^{commit}`).status === 0 ? git('log', '--oneline', `${had}..${latest}`).split('\n').filter(Boolean) : [];
    console.log(`${name}: ${incoming.length ? `${incoming.length} commit${incoming.length === 1 ? '' : 's'}` : 'new commits'} from ${repo} ${ref}`);
    for (const c of incoming.slice(0, 15)) console.log(`  ${c}`);
    if (flag('check')) continue;
    const pulled = tryGit('subtree', 'pull', `--prefix=${pluginDir(name)}`, repo, ref, '--squash', '-m', `Update plugin ${name} from ${repo} ${ref}`);
    if (pulled.status !== 0) {
      const merging = tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD').status === 0;
      stop(`Updating ${name} stopped${merging ? ' on conflicts: the site has changed its files. Resolve them and git commit, or git merge --abort to leave it as it was' : ''}:\n${pulled.stdout}${pulled.stderr}`);
    }
    console.log(`✓ Updated ${name}.`);
    changedAny = true;
  }
  if (flag('check') || !changedAny) return;
  next(copyMigrations());
}

function list() {
  const manifest = readManifest();
  const log = git('log', '-z', '--format=%B', '--grep=git-subtree-dir:');
  const names = Object.keys(manifest);
  if (!names.length) return console.log(`No plugins are installed (${MANIFEST}).`);
  for (const n of names) console.log(`${n}  ${manifest[n].repo} ${manifest[n].ref}  at ${(lastSplit(log, pluginDir(n)) ?? '?').slice(0, 12)}`);
}

if (command === 'add') add();
else if (command === 'update') update();
else if (command === 'list') list();
else stop('Use: npm run plugins:add -- <repository> | npm run plugins:update [-- <name>...] [--check] | npm run plugins:list');
