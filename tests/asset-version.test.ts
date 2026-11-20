// Script addresses carry a version (src/lib/asset-version.ts), since /assets/ is cached a year as immutable.
import { describe, expect, it } from 'vitest';
import { scriptUrl, versionScripts } from '../src/lib/asset-version';

describe('script versions', () => {
  it('adds the version to /assets/js/ scripts and stylesheets only', () => {
    const html = `<script src="/assets/js/editor-bar.js" defer></script><link rel="stylesheet" href='/assets/js/x.css'><script src="/assets/vendor/swiper/swiper.js"></script><img src="/assets/js/no.png?v=1"><a href="/about/">`;
    expect(versionScripts(html, 'abc123')).toBe(`<script src="/assets/js/editor-bar.js?v=abc123" defer></script><link rel="stylesheet" href='/assets/js/x.css?v=abc123'><script src="/assets/vendor/swiper/swiper.js"></script><img src="/assets/js/no.png?v=1"><a href="/about/">`);
  });

  it('leaves the page as it is without a version (no build)', () => {
    const html = '<script src="/assets/js/editor-bar.js" defer></script>';
    expect(versionScripts(html, '')).toBe(html);
    expect(scriptUrl('/assets/js/a.js', 'v1')).toBe('/assets/js/a.js?v=v1');
    expect(scriptUrl('/assets/js/a.js', '')).toBe('/assets/js/a.js');
  });
});
