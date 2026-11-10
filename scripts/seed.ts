// Starter content for a new install (src/lib/admin/seed.ts): the header and footer parts, the base
// templates, a home page set as the front page, an About page and the site settings; with Events on, the
// event templates and a sample event and venue; with the shop on, its templates. Anything that already
// exists is left alone, so it is safe to run again and on a hosted project.
//   npx tsx --env-file=.env scripts/seed.ts
import { siteDb } from '../src/lib/db/site';
import { seedSite } from '../src/lib/admin/seed';
import { closeLocalBindings } from '../src/lib/local-bindings';

await seedSite(siteDb(), console.log);
await closeLocalBindings();
