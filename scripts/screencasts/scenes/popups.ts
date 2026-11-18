// Editor guide: Popups (docs-site/src/content/docs/editors/popups.md): changing what a popup says (its
// template part) and seeing it on the site.
import type { SceneDef } from '../lib';

export default {
  name: 'popups',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    await s.caption('A popup\'s content is a template part. Click Content, then Templates.', { hold: 2400 });
    await s.click(s.menu('Content'), { after: 800 });
    await s.click(p.locator('header nav[aria-label=Admin] details[open]').getByRole('link', { name: 'Templates', exact: true }), { after: 0 });
    await p.waitForURL(/templates/);
    await p.waitForLoadState('networkidle');
    await s.caption('Under Template parts, click the popup\'s part.', { hold: 1800 });
    await s.click(p.getByRole('link', { name: 'Newsletter sign-up' }).first(), { after: 0 });
    await p.waitForURL(/\/admin\/(edit|templates)\/.+/);
    await p.waitForLoadState('networkidle');
    await s.wait(1400);
    const canvas = p.frameLocator('iframe').first();

    await s.caption('Build it like any page: drag in a heading, some text, a sign-up form.', { mid: true, hold: 1200 });
    const frame = p.locator('iframe').first();
    await s.drag(p.getByRole('button', { name: 'Heading', exact: true }), frame, { dy: -255, after: 1000 });
    await s.click(p.locator('[contenteditable=true]:visible').first(), { after: 150 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('Get the town news by email', { delay: 50 });
    await s.wait(900);
    await s.drag(p.getByRole('button', { name: 'Newsletter signup', exact: true }), canvas.getByRole('button', { name: 'Get the town news by email', exact: true }).last(), { dy: 6, after: 1600 });

    await s.caption('Click Save & apply. Every page with the popup shows the change at once.', { mid: true, hold: 1400 });
    await s.click(p.getByRole('button', { name: /Save & apply/ }), { after: 0 });
    await p.getByRole('dialog').getByRole('button', { name: /Save|Apply|OK/ }).first().click({ timeout: 3000 }).catch(() => {});
    await s.wait(2200);

    await s.caption('On the site, it appears after a few seconds, as set by an admin.', { hold: 1000 });
    await s.goto('/');
    await p.getByText('Get the town news by email').first().waitFor({ timeout: 20_000 }).catch(() => {});
    await s.wait(3000);
  },
} satisfies SceneDef;
