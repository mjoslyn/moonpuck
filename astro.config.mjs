// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * A hash of the core's and the site's scripts (public/assets/js/, src/site/public/assets/js/), names and
 * contents: pages put it on their script addresses (src/lib/asset-version.ts, through `assetVersionModule`), so a deploy that changes
 * a script reaches browsers holding the old one, which /assets/ caches a year.
 */
function assetVersion() {
  const hash = createHash('sha256');
  const root = path.dirname(fileURLToPath(import.meta.url));
  /** @param {string} dir */
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else hash.update(path.relative(root, file)).update(fs.readFileSync(file));
    }
  };
  walk(path.join(root, 'public/assets/js'));
  walk(path.join(root, 'src/site/public/assets/js'));
  return hash.digest('hex').slice(0, 10);
}

/**
 * The version as a module of its own, `virtual:asset-version` (src/lib/asset-version.ts), not a Vite
 * `define`: a define of our own there sends React's production JSX runtime to the dev server's islands.
 * @type {import('vite').Plugin}
 */
const assetVersionModule = {
  name: 'asset-version',
  resolveId: (id) => (id === 'virtual:asset-version' ? '\0virtual:asset-version' : undefined),
  load: (id) => (id === '\0virtual:asset-version' ? `export default ${JSON.stringify(assetVersion())};` : undefined),
};

/**
 * The site's own routes (src/site/routes.json: { pattern, entrypoint }), added beside src/pages.
 * @type {import('astro').AstroIntegration}
 */
const siteRoutes = {
  name: 'site-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      for (const route of JSON.parse(fs.readFileSync('src/site/routes.json', 'utf8'))) injectRoute(route);
    },
  },
};

const SITE_PUBLIC = 'src/site/public';
/** @type {Record<string, string>} */
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.pdf': 'application/pdf' };

/**
 * The site's own static files (src/site/public/, laid out like public/): served at the same paths as
 * public/ files, by the dev server and in the build output. A site file wins over a core one.
 * @type {import('astro').AstroIntegration}
 */
const sitePublic = {
  name: 'site-public',
  hooks: {
    'astro:server:setup': ({ server }) => {
      const root = path.resolve(SITE_PUBLIC);
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url ?? '').split('?')[0]);
        const file = path.join(root, pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    'astro:build:done': ({ dir }) => {
      if (fs.existsSync(SITE_PUBLIC)) fs.cpSync(SITE_PUBLIC, fileURLToPath(dir), { recursive: true });
    },
  },
};

let serverDir = '';
/**
 * SITE_NOINDEX for static files: Cloudflare serves them before the Worker (whose middleware marks every
 * other answer), so while the deployed config's vars (wrangler.jsonc, as built into dist/server/wrangler.json)
 * or the build's environment set it, the built _headers marks them noindex too.
 * @type {import('astro').AstroIntegration}
 */
const siteNoindex = {
  name: 'site-noindex',
  hooks: {
    'astro:config:done': ({ config }) => {
      serverDir = fileURLToPath(config.build.server);
    },
    'astro:build:done': ({ dir, logger }) => {
      let value = process.env.SITE_NOINDEX;
      try {
        value = JSON.parse(fs.readFileSync(path.join(serverDir, 'wrangler.json'), 'utf8')).vars?.SITE_NOINDEX ?? value;
      } catch {
        // No deployed config (another adapter): the build's environment only.
      }
      if (!/^(1|true)$/i.test(String(value ?? '').trim())) return;
      fs.appendFileSync(path.join(fileURLToPath(dir), '_headers'), '\n# SITE_NOINDEX\n/*\n  X-Robots-Tag: noindex\n');
      logger.info('SITE_NOINDEX: static files marked noindex in _headers.');
    },
  },
};

export default defineConfig({
  output: 'server',
  // A Cloudflare Worker (wrangler.jsonc; its entry is src/worker.ts). astro dev runs it in workerd too,
  // with local bindings (D1 in .wrangler/state, the jobs queue, Images).
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [react(), siteRoutes, sitePublic, siteNoindex],
  // Cloudflare's Workers cache keeps the pages (tagged) and purges them after edits (src/lib/cache.ts).
  cache: { provider: cacheCloudflare() },
  // The same check runs in src/middleware.ts, which lets mail apps' one-click unsubscribe through.
  security: { checkOrigin: false },
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: { plugins: [tailwindcss(), assetVersionModule] },
});
