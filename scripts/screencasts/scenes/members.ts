// Editor guide: Members (docs-site/src/content/docs/editors/members.md): making a page members-only, and
// the Members only block for part of a page.
import type { SceneDef } from '../lib';

export default {
  name: 'members',
  start: '/admin/?type=post',
  async run(s) {
    const p = s.page;
    await s.caption('Open the page (or post, or event) in the editor.', { hold: 1800 });
    await s.click(p.getByRole('link', { name: 'Notes from the November council meeting' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1200);

    await s.caption('In its settings on the right, open Members and turn on Members only.', { mid: true, hold: 1400 });
    const summary = p.locator('summary').filter({ hasText: /^\s*Members\s*$/ }).filter({ visible: true }).first();
    await s.click(summary, { after: 700 });
    await s.click(p.getByRole('checkbox', { name: 'Members only' }).filter({ visible: true }).first(), { after: 1600 });
    await s.caption('Only signed-in members see it once you publish. Everyone else is asked to sign in.', { mid: true });

    await s.caption('For just part of a page, drag in the Members only block and put blocks inside it.', { mid: true, hold: 1000 });
    await s.hover(p.getByRole('button', { name: /^Members only$/ }).filter({ visible: true }).first(), 2200);
    await s.caption('Publish, as with any change.', { mid: true, hold: 1200 });
    await s.click(p.getByRole('button', { name: /^Publish/ }), { after: 0 });
    await p.getByText(/Published \d/).first().waitFor({ timeout: 20_000 });
    await s.wait(1800);
  },
} satisfies SceneDef;
