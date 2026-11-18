// Editor guide: Saving and publishing (docs-site/src/content/docs/editors/saving-and-publishing.md):
// saving by itself, Preview, Publish changes, and going back to an earlier version.
import type { SceneDef } from '../lib';

export default {
  name: 'saving-and-publishing',
  start: '/admin/?type=page',
  async run(s) {
    const p = s.page;
    await s.click(p.getByRole('link', { name: 'Visiting Example Town' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1200);
    const canvas = p.frameLocator('iframe').first();

    await s.caption('This page is published. Change something on it...', { mid: true, hold: 2400 });
    await s.click(canvas.getByRole('button', { name: 'More to come', exact: true }).last(), { after: 700 });
    await s.click(p.locator('[contenteditable=true]:visible').first(), { after: 200 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('Getting here', { delay: 70 });
    await s.caption('...and the top says Unsaved changes. A few seconds later, it saves itself.', { mid: true, hold: 1200 });
    await s.hover(p.getByText(/Unsaved changes|Saving/).first(), 0);
    await p.getByText(/Autosaved/).first().waitFor({ timeout: 20_000 });
    await s.wait(1800);
    await s.caption('Saving never publishes: visitors still see the live page until you publish.', { mid: true });

    await s.caption('Preview opens the page in a new tab, exactly as it will look once published.', { mid: true });
    await s.hover(p.getByRole('button', { name: 'Preview' }), 1400);
    await s.caption('Save draft keeps your changes and marks a checkpoint you can come back to.', { mid: true, hold: 2600 });
    await s.click(p.getByRole('button', { name: 'Save draft' }), { after: 0 });
    await p.getByText(/Draft saved \d/).first().waitFor({ timeout: 20_000 });
    await s.wait(1400);

    await s.caption('Change it once more, then click Publish changes. Visitors see it straight away.', { mid: true, hold: 1000 });
    await s.click(p.locator('[contenteditable=true]:visible').first(), { after: 200 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('How to get here', { delay: 70 });
    await s.wait(1200);
    await s.click(p.getByRole('button', { name: /^Publish/ }), { after: 0 });
    await p.getByText(/Published \d/).first().waitFor({ timeout: 20_000 });
    await s.wait(1800);

    await s.caption('Revisions on the left lists earlier versions. Checkpoints are marked.', { mid: true });
    await s.click(p.getByText('Revisions', { exact: true }).first(), { after: 1600 });
    await s.caption('Restore puts the editor back to that version. Undo takes it back, so it is safe to try.', { mid: true });
    const restore = p.getByRole('button', { name: 'Restore' });
    await s.hover(restore.nth(1), 1200);
    await s.click(restore.nth(1), { after: 0 });
    await p.getByText(/Restored the version from/).first().waitFor({ timeout: 20_000 }).catch(() => {});
    await s.wait(2400);
    await s.caption('Nothing goes live until you publish it again.', { mid: true, hold: 2400 });
  },
} satisfies SceneDef;
