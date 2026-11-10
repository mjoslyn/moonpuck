// A site's own migrations: db/migrations/<14 digits>_site_<name>.sql (the core's never are, except
// the four below, named before this rule), and its plugins' (src/site/plugins/<plugin>/migrations/,
// named the same way), which wrangler can't read there: `copyPluginMigrations` copies them into
// db/migrations (`npm run db:migrate` and `npm run deploy:remote` run it first).
import fs from 'node:fs';
import path from 'node:path';

/** Core migrations whose names look like a site's. */
export const CORE_SITE_NAMED = ['20261028200000_site_keys.sql', '20261104120000_site_stats.sql', '20261104160000_site_stats_cookie.sql', '20261104170000_site_stats_campaigns.sql'];

const SITE_NAME = /^\d{14}_site_[a-z0-9_]+\.sql$/;

/** Whether a migration file is the site's (or a plugin's). */
export const isSiteMigration = (file: string) => SITE_NAME.test(file) && !CORE_SITE_NAMED.includes(file);

/** The tables a migration's SQL makes. */
export const tablesMadeBy = (sql: string): string[] =>
  [...sql.replace(/--[^\n]*/g, '').matchAll(/create\s+(?:virtual\s+)?table\s+(?:if\s+not\s+exists\s+)?["`[]?(\w+)/gi)].map((m) => m[1]);

/** The tables the site's own migrations in `dir` make. */
export function siteTables(dir: string): Set<string> {
  const out = new Set<string>();
  for (const f of fs.readdirSync(dir).filter(isSiteMigration)) for (const t of tablesMadeBy(fs.readFileSync(path.join(dir, f), 'utf8'))) out.add(t);
  return out;
}

/**
 * Copy every plugin's migrations (`<plugins>/<plugin>/migrations/*.sql`) into `dir` that aren't there.
 * A file there with other content is left as it is and reported (a migration once applied mustn't change);
 * a name that isn't a site migration's is refused, so a plugin can't add a core-looking migration.
 */
export function copyPluginMigrations(plugins: string, dir: string): { copied: string[]; changed: string[] } {
  const copied: string[] = [];
  const changed: string[] = [];
  if (!fs.existsSync(plugins)) return { copied, changed };
  for (const plugin of fs.readdirSync(plugins).sort()) {
    const from = path.join(plugins, plugin, 'migrations');
    if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) continue;
    for (const f of fs.readdirSync(from).filter((f) => f.endsWith('.sql')).sort()) {
      if (!isSiteMigration(f)) throw new Error(`${path.join(from, f)}: plugin migrations are named <14 digits>_site_<name>.sql`);
      const sql = fs.readFileSync(path.join(from, f), 'utf8');
      const to = path.join(dir, f);
      if (!fs.existsSync(to)) {
        fs.writeFileSync(to, sql);
        copied.push(f);
      } else if (fs.readFileSync(to, 'utf8') !== sql) changed.push(f);
    }
  }
  return { copied, changed };
}
