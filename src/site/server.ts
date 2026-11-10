// The site's server side: the plugins it installs (their server parts; see CORE.md, Plugins). Each plugin
// lives in src/site/plugins/<name>/; its blocks and editor panels go in render.ts and editor.tsx, its
// table policies in db.ts, its migrations are copied into db/migrations by `npm run db:migrate`.
import { defineServer } from '../lib/site/plugins';

export default defineServer({
  plugins: [],
});
