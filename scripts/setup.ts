// A new local copy in one step: `npm run setup`. Writes .env from .env.example with a new AUTH_SECRET (or
// fills an empty one; nothing else in an existing .env is touched), makes or updates the local database
// (npm run db:migrate), then starts the dev server. The first visit to /admin/ makes the first admin and
// can add the starter content (src/lib/admin/first-run.ts). `--no-dev` stops before the dev server.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { withAuthSecret } from './lib/setup-env';

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const had = existsSync('.env');
const before = had ? readFileSync('.env', 'utf8') : readFileSync('.env.example', 'utf8');
const after = withAuthSecret(before, randomBytes(32).toString('hex'));
if (!had || after !== before) writeFileSync('.env', after);
console.log(!had ? '.env: made from .env.example, with a new AUTH_SECRET' : after !== before ? '.env: AUTH_SECRET filled in' : '.env: kept as it is');

console.log('\nThe local database:');
run('npm', ['run', 'db:migrate']);

console.log('\nNext: open http://localhost:4321/admin/ to make your admin account (and add the starter content).');
if (process.argv.includes('--no-dev')) process.exit(0);
run('npx', ['astro', 'dev']);
