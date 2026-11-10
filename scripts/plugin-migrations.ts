// Copies the site's plugins' migrations (src/site/plugins/<plugin>/migrations/) into db/migrations, where
// wrangler applies them. Run by `npm run db:migrate` and `npm run deploy:remote`; commit what it copies.
import { copyPluginMigrations } from './lib/site-migrations';

const { copied, changed } = copyPluginMigrations('src/site/plugins', 'db/migrations');
for (const f of copied) console.log(`plugin migration copied: db/migrations/${f}`);
for (const f of changed) console.warn(`plugin migration ${f} differs from db/migrations/${f}, which is kept: a migration once applied doesn't change, so write a new one`);
