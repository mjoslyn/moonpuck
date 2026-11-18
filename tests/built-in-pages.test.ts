// Built-in pages (no stored page at their address): their blocks sit in a padded column, as the cart's and
// the donation page's do, not flush against the header and footer.
import { describe, expect, it } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { renderRequest } from '../src/render/page';
import '../src/lib/mailing/page-data';

const db = siteDb();
const setSite = async (value: Record<string, unknown>) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), ...value } });
};

describe('built-in pages', () => {
  it('mailing pages and the account page put their block in a padded column', async () => {
    const { data } = await db.from('templates').select('id').eq('kind', 'template').eq('slug', 'page').maybeSingle();
    if (!data) await db.from('templates').insert({ kind: 'template', slug: 'page', title: 'Page', content: { root: { props: {} }, content: [{ type: 'entry-content', props: { id: 'pc', attrs: {} } }] } });
    await setSite({ mailing: { enabled: true, address: '1 Main St' }, members: { enabled: true, levels: [{ id: 'basic', name: 'Basic' }], signup: 'open', signupLevel: 'basic' } });
    for (const path of ['/subscribe/', '/unsubscribe/', '/email-preferences/', '/account/']) {
      const { status, html } = await renderRequest(new URL(`http://localhost${path}`), db);
      expect(status, path).toBe(200);
      // The page's content starts with a constrained section padded from the header, footer and edges.
      expect(html, path).toMatch(/<div class="c-entry-content[^"]*"><div class="c-section c-constrained[^"]*" style="padding-top:var\(--space-70\);padding-right:var\(--space-50\);padding-bottom:var\(--space-80\);padding-left:var\(--space-50\)"/);
    }
  });
});
