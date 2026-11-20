// A demo's allowlist sanitizer (src/lib/demo/sanitize.ts): the editor's formatting kept, everything that
// could run script removed however it is written, and every block's settings cleaned as a demo renders them.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanAttrs, safeUrl, sanitizeHtml } from '../src/lib/demo/sanitize';
import { register, renderItem } from '../src/render/engine';

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe('sanitizeHtml', () => {
  it('keeps the formatting the editor makes', () => {
    expect(sanitizeHtml('<p><strong>Hi</strong> <em>there</em>, <a href="https://example.org/a?b=1&amp;c=2">a link</a></p>')).toBe('<p><strong>Hi</strong> <em>there</em>, <a href="https://example.org/a?b=1&amp;c=2">a link</a></p>');
    expect(sanitizeHtml('<ul><li>One</li><li>Two</li></ul><h3 class="x" style="color:red">Head</h3>')).toBe('<ul><li>One</li><li>Two</li></ul><h3 class="x" style="color:red">Head</h3>');
    expect(sanitizeHtml('<a href="/visit/" target="_blank">Go</a>')).toBe('<a href="/visit/" target="_blank" rel="noopener">Go</a>');
  });
  it('removes handlers, wherever a quoted > puts them', () => {
    expect(sanitizeHtml('<p><code><img alt=">" onerror="alert(1)" src=x></code></p>')).toBe('<p><code><img alt="&gt;" src="x"></code></p>');
    expect(sanitizeHtml('<img src=x onerror=alert(1)><b onclick="x()">b</b>')).toBe('<img src="x"><b>b</b>');
  });
  it('drops script-carrying elements with their content, and unknown tags but their text', () => {
    expect(sanitizeHtml('a<script>alert(1)</script>b<style>*{}</style>c')).toBe('abc');
    expect(sanitizeHtml('<svg onload=alert(1)><g><text>x</text></g></svg>ok')).toBe('ok');
    expect(sanitizeHtml('<iframe src="https://example.org"></iframe><marquee>hi</marquee>')).toBe('hi');
  });
  it('drops addresses that would run script, however they are spelled', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:x', 'java&#x09;script:x', '&#106;avascript:x', ' javascript:x', 'data:text/html,<b>', 'vbscript:x']) {
      expect(sanitizeHtml(`<a href="${href}">x</a>`), href).toBe('<a>x</a>');
    }
    expect(safeUrl('mailto:a@b.org')).toBe(true);
    expect(safeUrl('#top')).toBe(true);
  });
  it('drops styles that load or run anything, and balances tags', () => {
    expect(sanitizeHtml('<span style="background:url(javascript:x)">a</span>')).toBe('<span>a</span>');
    expect(sanitizeHtml('<p><strong>open')).toBe('<p><strong>open</strong></p>');
    expect(sanitizeHtml('a < b & c')).toBe('a &lt; b &amp; c');
  });
});

describe('cleanAttrs', () => {
  it('sanitizes markup in any setting, blanks script addresses, and leaves other values alone', () => {
    const attrs = { content: '<p onclick="x()">Hi</p>', style: { color: 'var(--color-sky)', linkColor: 'red' }, href: 'javascript:alert(1)', url: '/visit/', items: [{ text: '<img src=x onerror=y()>' }], level: 2 };
    expect(cleanAttrs(attrs)).toEqual({ content: '<p>Hi</p>', style: { color: 'var(--color-sky)', linkColor: 'red' }, href: '', url: '/visit/', items: [{ text: '<img src="x">' }], level: 2 });
  });
});

describe('the render engine on a demo', () => {
  it('renders every block from cleaned settings', () => {
    register({ 'demo-test': (b) => `<div>${b.attrs.content}</div>` });
    const item = { type: 'demo-test', props: { id: 'x', attrs: { content: '<img alt=">" onerror="alert(1)" src=x>' } } } as any;
    const env = { ctx: { rendered: [] } } as any;
    expect(renderItem(item, env)).toContain('onerror');
    process.env.DEMO_MODE = '1';
    expect(renderItem(item, env)).toBe('<div><img alt="&gt;" src="x"></div>');
  });
});
