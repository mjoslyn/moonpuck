// Editor guide, first page (docs-site/src/content/docs/editors/index.md): signing in, the home screen,
// the admin bar, Go to and signing out.
import { editor, type SceneDef } from '../lib';

export default {
  name: 'index',
  signedIn: false,
  start: '/admin/login/',
  async run(s) {
    const p = s.page;
    await s.caption('Go to your site\'s address with /admin/ on the end to sign in.');
    await s.type(p.locator('input[name=email]').first(), editor.email);
    await s.type(p.locator('input[name=password]').first(), editor.password, { delay: 30 });
    await s.caption('Click Sign in.', { hold: 1200 });
    await s.click(p.getByRole('button', { name: 'Sign in' }), { after: 0 });
    await p.waitForURL(/\/admin\/$/);
    await s.clearCaption();
    await p.waitForLoadState('networkidle');
    await s.wait(500);

    await s.caption('The home screen asks what you would like to make.');
    await s.hover(p.getByRole('radio', { name: 'Post' }), 300);
    await s.hover(p.getByRole('radio', { name: 'Form' }), 300);
    await s.hover(p.getByRole('radio', { name: 'Template part' }), 300);
    await s.caption('Pick a kind of content, then describe what it is for. Compose drafts it with Claude.');
    await s.hover(p.getByRole('textbox', { name: /What should/ }), 1200);
    await s.caption('Below are the things you edited last, and your Compose conversations.');
    await s.hover(p.getByRole('main').getByRole('list').first().getByRole('link').first(), 1200);

    await s.caption('The bar along the top takes you everywhere else.');
    await s.click(s.menu('Content'), { after: 1600 });
    await s.click(s.menu('Compose'), { after: 1600 });
    await s.press('Escape', 400);
    await s.hover(s.barLink('Media'), 500);
    await s.hover(s.barLink('Stats'), 500);
    await s.click(s.menu('Forms'), { after: 1400 });
    await s.press('Escape', 400);

    await s.caption('To find anything, press Ctrl+K (Cmd+K on a Mac) or click the magnifying glass.', { top: true });
    await s.click(p.getByRole('button', { name: /Go to a screen/ }), { after: 700 });
    await p.keyboard.type('abo', { delay: 160 });
    await s.wait(900);
    await s.caption('Use the arrow keys to choose, and Enter to open.', { hold: 2200, top: true });
    await s.press('Escape', 500);

    await s.caption('Click your name to see your role, or to sign out.', { top: true });
    await s.click(s.menu('Account'), { after: 2000 });
    await s.click(p.getByRole('button', { name: 'Sign out' }), { after: 0 });
    await p.waitForURL(/login/);
    await s.wait(1200);
  },
} satisfies SceneDef;
