// Editor guide: Donations (docs-site/src/content/docs/editors/donations.md): adding a Donate form to a
// page, its settings, and the Donations screen.
import type { SceneDef } from '../lib';

export default {
  name: 'donations',
  start: '/admin/?type=page',
  async run(s) {
    const p = s.page;
    await s.caption('Open the page that should take gifts.', { hold: 1600 });
    await s.click(p.getByRole('link', { name: 'Parks and trails' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1200);
    const canvas = p.frameLocator('iframe').first();

    await s.caption('In Blocks, open Donations and drag Donate onto the page.', { mid: true, hold: 1200 });
    await s.drag(p.getByRole('button', { name: 'Donate', exact: true }), canvas.getByRole('button', { name: /^Riverside Park, the river trail/ }).last(), { dy: 4, after: 1600 });

    await s.caption('Click it to change its heading, amounts and button on the right.', { mid: true, hold: 1000 });
    const heading = p.getByRole('textbox', { name: /^Heading/ }).first();
    await s.type(heading, 'Help us plant 100 trees', { delay: 50 });
    await s.wait(1200);
    await s.caption('Every setting is optional: the amounts come from Settings unless you set them here.', { mid: true });

    await s.caption('Publish the page, and visitors can give once or monthly.', { mid: true, hold: 1400 });
    await s.click(p.getByRole('button', { name: /^Publish/ }), { after: 0 });
    await p.getByText(/Published \d/).first().waitFor({ timeout: 20_000 });
    await s.wait(1200);

    await s.caption('Donations in the top bar shows every gift, and what each goal has raised.', { hold: 1000 });
    await s.goto('/admin/donations/');
    await s.wait(2800);
  },
} satisfies SceneDef;
