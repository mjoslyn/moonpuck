// Editor guide: Writing with Claude (docs-site/src/content/docs/editors/writing-with-claude.md): asking
// Compose for a page from the home screen, the draft it makes, and asking for a change. Calls Claude
// for real (ANTHROPIC_API_KEY in .env); the waits are cut from the clip.
import type { SceneDef } from '../lib';

export default {
  name: 'writing-with-claude',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    await s.caption('On the home screen, pick what to make, then say what it is for.', { hold: 2600 });
    await s.click(p.getByRole('radio', { name: 'Page' }), { after: 500 });
    await s.type(
      p.getByRole('textbox', { name: /What should/ }),
      'A page for the Riverside Park cleanup on Saturday December 12th, 9am to noon: where to meet, what to bring, and a call for volunteers.',
      { delay: 22 },
    );
    await s.caption('Click Compose page. Claude writes it in the site\'s style.', { hold: 1800 });
    await s.click(p.getByRole('button', { name: 'Compose page' }), { after: 0 });
    await p.waitForURL(/\/admin\/compose\//, { timeout: 30_000 }).catch(() => {});
    await s.caption('It usually takes a minute or two. The conversation shows what Claude is doing.', { hold: 0 });
    await s.skip(async () => {
      await p.waitForURL(/\/admin\/edit\//, { timeout: 300_000 });
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(2500);
    }, 2500);
    await s.clearCaption();
    // Room for the page beside the conversation: the editor's side panels folded away.
    await p.getByRole('button', { name: 'Toggle left sidebar' }).click();
    await p.getByRole('button', { name: 'Toggle right sidebar' }).click();
    await s.wait(1200);

    await s.caption('The new page opens as a draft in the editor, with the conversation beside it.', { left: true });
    await s.hover(p.frameLocator('iframe').first().locator('body'), 1600);
    await s.caption('Nothing is published until you click Publish.', { left: true, hold: 2000 });

    await s.caption('To change something, ask in the conversation and click Send.', { left: true, hold: 1000 });
    const box = p.getByRole('textbox', { name: /message|ask|compose|what/i }).filter({ visible: true }).last();
    await s.type((await box.count()) ? box : p.locator('textarea:visible').last(), 'Make the opening paragraph shorter and friendlier.', { delay: 35 });
    const updates = await p.getByText(/Updated the page/).count();
    await s.click(p.getByRole('button', { name: 'Send' }), { after: 0 });
    await s.caption('Claude changes the sections it wrote and leaves the rest alone.', { left: true, hold: 0 });
    await s.skip(async () => {
      await p.waitForFunction((n) => (document.body.innerText.match(/Updated the page/g) ?? []).length > n, updates, { timeout: 300_000 });
      await p.waitForTimeout(2000);
    }, 2000);
    await s.wait(2600);
    await s.caption('Check what Claude wrote: you can still change anything by hand.', { left: true });
  },
} satisfies SceneDef;
