// Versions for the site's scripts. Everything under /assets/ is cached a year as immutable
// (public/_headers), so a script's address has to change when the script does, or browsers that have
// it keep the old one. The build hashes the core's and the site's scripts (public/assets/js/ and
// src/site/public/assets/js/; astro.config.mjs, `virtual:asset-version`) and pages add it to every
// /assets/js/ address (`versionScripts`, in renderRequest). Without a build (tests) there is none.
import version from 'virtual:asset-version';

export const ASSET_VERSION: string = typeof version === 'string' ? version : '';

/** HTML with `?v=<version>` on each /assets/js/ script and stylesheet address that has no query of its own. */
export function versionScripts(html: string, version = ASSET_VERSION): string {
  if (!version) return html;
  return html.replace(/(\s(?:src|href)=["'])(\/assets\/js\/[^"'?#\s]+)(["'])/g, `$1$2?v=${version}$3`);
}

/** One script's address with the version (`/assets/js/x.js?v=...`). */
export const scriptUrl = (path: string, version = ASSET_VERSION): string => (version ? `${path}?v=${version}` : path);
