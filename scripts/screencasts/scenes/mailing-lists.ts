// Editor guide: Mailing lists (docs-site/src/content/docs/editors/mailing-lists.md): making a campaign,
// its settings, designing the email, previewing it and saving. (Sending is for admins.)
import type { SceneDef } from '../lib';

export default {
  name: 'mailing-lists',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    await s.caption('Click People, then Mailing Lists.', { hold: 1800 });
    await s.click(s.menu('People'), { after: 800 });
    await s.click(p.locator('header nav[aria-label=Admin] details[open]').getByRole('link', { name: 'Mailing Lists', exact: true }), { after: 0 });
    await p.waitForURL(/mailing-lists/);
    await p.waitForLoadState('networkidle');
    await s.caption('Campaigns are emails to the people on your lists. Click New campaign.', { hold: 2600 });
    await s.click(p.getByRole('button', { name: 'New campaign' }), { after: 0 });
    await p.waitForURL(/campaigns\/\d+/);
    await p.waitForLoadState('networkidle');
    await s.wait(900);

    await s.caption('Give it a name for yourself, and the subject people will see.');
    const name = p.getByRole('textbox', { name: 'Name (for you)' });
    await s.click(name, { after: 150 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('December news', { delay: 50 });
    await s.type(p.getByRole('textbox', { name: /^Subject/ }), 'What\'s on in December, {first_name|there}', { delay: 40 });
    await s.caption('Tags like {first_name|there} put in each person\'s name, or "there" if it isn\'t known.', { hold: 3600 });
    await s.caption('Pick who it goes to.', { hold: 1200 });
    await s.hover(p.getByRole('checkbox', { name: 'Town newsletter' }), 1200);

    await s.caption('Click Edit the email to write it.', { hold: 1400 });
    await s.click(p.getByRole('button', { name: 'Edit the email' }), { after: 1500 });
    const canvas = p.frameLocator('iframe').first();
    await s.caption('Click a block to change it on the right, or drag in more from the left.', { hold: 1200 });
    await s.click(canvas.getByText('Write your news here.').first(), { after: 900 });
    const text = p.locator('[contenteditable=true]:visible').first();
    await s.click(text, { after: 150 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('The holiday market is back on the 16th, and the lights go up on Main Street this weekend.', { delay: 25 });
    await s.wait(1200);

    await s.caption('Preview shows the email as people will get it, with the footer added.', { hold: 1000 });
    await s.click(p.getByRole('button', { name: 'Preview' }).or(p.getByText('Preview', { exact: true })).first(), { after: 3000 });
    await s.caption('Click Done, then Save.', { hold: 1000 });
    await s.click(p.getByRole('button', { name: /^Done$/i }), { after: 1200 });
    await s.click(p.getByRole('button', { name: 'Save', exact: true }), { after: 1600 });

    await s.caption('Send a test to yourself to check it. An admin sends it to the list.');
    await s.hover(p.getByRole('button', { name: 'Send test' }), 2000);
  },
} satisfies SceneDef;
