// Editor guide: Using the page editor, Collections (docs-site/src/content/docs/editors/page-editor.md):
// adding a Collection block, what it shows, its layout, card design and paging, and the list on the site.
import type { SceneDef } from '../lib';

export default {
  name: 'collections',
  start: '/admin/?type=page',
  async run(s) {
    const p = s.page;
    await s.caption('A Collection block lists your posts, events or other content, and keeps itself up to date.', { hold: 3200 });
    await s.click(p.getByRole('link', { name: 'About', exact: true }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1500);
    const canvas = p.frameLocator('iframe').first();

    await s.caption('Drag Collection from the blocks on the left onto the page.', { mid: true, hold: 1800 });
    const after = canvas.getByRole('button', { name: 'Tell visitors about the organisation.', exact: true }).last();
    // A short page, so the list stays in view: the canvas goes back to the top as settings change.
    await s.drag(p.getByRole('button', { name: 'Collection', exact: true }), after, { dy: 8, after: 1800 });

    await s.caption('Its settings are on the right. Show: the latest entries, ones you pick, or the page\'s own list.', { mid: true });
    await s.hover(p.getByRole('button', { name: 'Latest', exact: true }), 600);
    await s.hover(p.getByRole('button', { name: 'Hand-picked', exact: true }), 600);
    await s.caption('Tick the kinds of content to list, then say how many.', { mid: true, hold: 1600 });
    await s.hover(p.getByRole('checkbox', { name: 'Posts', exact: true }), 900);
    const many = p.getByRole('textbox', { name: 'How many', exact: true });
    await s.click(many, { after: 150 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('3', { delay: 120 });
    await s.wait(1800);

    await s.caption('Layout: a grid, a list or a slider, and how many columns.', { mid: true, hold: 1400 });
    await s.click(p.getByRole('button', { name: 'List', exact: true }).last(), { after: 1700 });
    await s.click(p.getByRole('button', { name: 'Grid', exact: true }).last(), { after: 1700 });

    await s.caption('Card design: how each entry looks. Every card follows it.', { mid: true, hold: 1400 });
    const card = p.getByRole('combobox', { name: 'Card design' });
    await s.moveTo(card);
    await s.wait(400);
    await card.selectOption({ label: 'Title and date' });
    await s.wait(2000);
    await card.selectOption({ label: 'Image, title and excerpt' });
    await s.wait(1800);

    await s.caption('Paging: page numbers or a Load more button, for long lists.', { mid: true, hold: 1400 });
    const paging = p.getByRole('combobox', { name: 'Pagination' });
    await s.moveTo(paging);
    await s.wait(400);
    await paging.selectOption({ label: 'Load more button' });
    await s.wait(1800);

    await s.caption('Click Publish changes.', { mid: true, hold: 1200 });
    // At this width the header's notes push Publish changes partly off the right edge, where a click at
    // its middle lands on Save draft: point at its visible part and press it from the keyboard.
    const publish = p.getByRole('button', { name: /^Publish/ });
    const saveDraft = p.getByRole('button', { name: 'Save draft' });
    // Autosave redraws the header now and then; try again if it did so mid-move.
    await s.moveTo(saveDraft, 110).catch(() => s.moveTo(saveDraft, 110));
    await s.wait(400);
    await publish.focus();
    await p.keyboard.press('Enter');
    await p.getByText('Unpublished changes').waitFor({ state: 'hidden', timeout: 20_000 });
    await s.wait(1200);
    await s.goto('/about/');
    await s.caption('The list is on the page, newest first. New posts join it by themselves.', { top: true, hold: 600 });
    await s.hover(p.getByRole('heading', { name: 'Volunteers clean up Riverside Park' }).first(), 3600);
  },
} satisfies SceneDef;
