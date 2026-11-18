// Editor guide: Accessibility (docs-site/src/content/docs/editors/accessibility.md): the A11y check, a
// problem and a warning, and fixing them from the list.
import type { Locator } from 'playwright';
import type { Scene, SceneDef } from '../lib';

/** Pick `value` in a <select>: the cursor goes to it, then the choice is made (the browser's own list
 * isn't recorded). */
async function choose(s: Scene, select: Locator, value: string) {
  await s.click(select, { after: 300 });
  await s.page.keyboard.press('Escape');
  await select.selectOption({ label: value });
  await s.wait(900);
}

export default {
  name: 'accessibility',
  start: '/admin/?type=page',
  async run(s) {
    const p = s.page;
    await s.click(p.getByRole('link', { name: 'Parks and trails' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1200);
    const canvas = p.frameLocator('iframe').first();
    const level = p.locator('select:visible').filter({ has: p.locator('option', { hasText: 'H4' }) }).first();

    await s.caption('Click A11y on the left to check the page for common accessibility problems.', { mid: true });
    await s.click(p.getByText('A11y', { exact: true }).first(), { after: 1600 });
    await s.caption('Here it finds none. Let\'s make two mistakes and watch it catch them.', { mid: true });

    await s.click(canvas.getByRole('button', { name: 'More to come', exact: true }).last(), { after: 700 });
    await s.caption('A heading two steps smaller than it should be...', { mid: true, hold: 1200 });
    await choose(s, level, 'H4');
    await s.click(canvas.getByRole('button', { name: /^Riverside Park, the river trail/ }).last(), { after: 700 });
    await s.caption('...and text too pale to read against its background.', { mid: true, hold: 1200 });
    await s.click(p.locator('button[title="Cream"]:visible').first(), { after: 900 });
    await s.click(p.getByRole('button', { name: 'Check again' }), { after: 1600 });

    await s.caption('Problems need fixing. Warnings are for you to judge. Each says what is wrong.', { mid: true });
    await s.hover(p.getByText(/contrast/i).first(), 1400);
    await s.hover(p.getByText(/skips a level/i).first(), 1400);

    await s.caption('Select the block takes you to it. Fix it on the right, and it leaves the list.', { mid: true, hold: 1600 });
    await s.click(p.getByRole('button', { name: 'Select the block' }).first(), { after: 900 });
    await s.click(p.locator('button[title="Night"]:visible').first(), { after: 0 });
    await s.wait(600);
    await s.click(p.getByRole('button', { name: 'Check again' }), { after: 0 });
    await p.getByText(/^0 problems/).waitFor({ timeout: 20_000 });
    await s.wait(1400);
    await s.click(p.getByRole('button', { name: 'Select the block' }).first(), { after: 900 });
    await choose(s, level, 'H2');
    await s.click(p.getByRole('button', { name: 'Check again' }), { after: 1400 });
    await s.caption('All clear. Publish when you are ready.', { mid: true, hold: 2400 });
  },
} satisfies SceneDef;
