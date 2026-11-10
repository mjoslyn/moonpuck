// A site's installed plugins (src/site/plugins.json): each one's own git repository and the branch or tag
// it follows, kept as a squashed git subtree at src/site/plugins/<name>/ (scripts/plugins.ts). Separate
// from the core's update (scripts/update-core.mjs), which never touches them.
import fs from 'node:fs';

export const PLUGINS_DIR = 'src/site/plugins';
export const MANIFEST = 'src/site/plugins.json';

export interface PluginSource {
  repo: string;
  ref: string;
}
export type Manifest = Record<string, PluginSource>;

const NAME = /^[a-z][a-z0-9-]{0,39}$/;

/** The folder name for a plugin from its repository's address: `moonpuck-plugin-square-sync` → `square-sync`. */
export function nameFromRepo(repo: string): string {
  const last = repo.replace(/\/+$/, '').split(/[/:]/).pop() ?? '';
  return last.replace(/\.git$/, '').toLowerCase().replace(/^moonpuck-plugin-/, '').replace(/[^a-z0-9-]/g, '-');
}

export const validName = (name: string) => NAME.test(name);
export const pluginDir = (name: string) => `${PLUGINS_DIR}/${name}`;

/** The manifest as saved (none: empty); an entry without a repository is an error. */
export function readManifest(file = MANIFEST): Manifest {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Partial<PluginSource>>;
  const out: Manifest = {};
  for (const [name, p] of Object.entries(raw ?? {})) {
    if (!validName(name) || typeof p?.repo !== 'string' || !p.repo) throw new Error(`${file}: "${name}" needs a lower-case name and a repo`);
    out[name] = { repo: p.repo, ref: typeof p.ref === 'string' && p.ref ? p.ref : 'main' };
  }
  return out;
}

export function writeManifest(m: Manifest, file = MANIFEST) {
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** The plugin's commit the subtree last took in, from the squash commit messages `git subtree` writes. */
export function lastSplit(log: string, dir: string): string | null {
  for (const message of log.split('\x00')) {
    if (!message.includes(`git-subtree-dir: ${dir}\n`) && !message.trimEnd().endsWith(`git-subtree-dir: ${dir}`)) continue;
    const m = message.match(/git-subtree-split: ([0-9a-f]{7,40})/);
    if (m) return m[1];
  }
  return null;
}
