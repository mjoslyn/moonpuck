// Editor guide: Using the page editor (docs-site/src/content/docs/editors/page-editor.md): its four
// parts, changing a block, its toolbar, adding a block by dragging, and phone width.
import type { SceneDef } from '../lib';

export default {
  name: 'page-editor',
  start: '/admin/?type=page',
  async run(s) {
    const p = s.page;
    await s.caption('Click a page in the list to open it in the editor.', { hold: 2200 });
    await s.click(p.getByRole('link', { name: 'Parks and trails' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1500);
    const canvas = p.frameLocator('iframe').first();

    await s.caption('Along the top: whether the page is published, Preview, and Save and Publish.', { hold: 3600 });
    await s.hover(p.getByRole('button', { name: 'Preview' }), 500);
    await s.hover(p.getByRole('button', { name: /^Publish/ }), 1200);
    await s.caption('On the left: the blocks you can add, patterns, an outline of the page, and its history.');
    await s.hover(p.getByText('Blocks', { exact: true }).first(), 500);
    await s.hover(p.getByText('Outline', { exact: true }).first(), 500);
    await s.hover(p.getByText('Revisions', { exact: true }).first(), 900);
    await s.caption('In the middle is the page as visitors will see it.');
    await s.hover(canvas.getByRole('heading', { name: 'Parks and trails' }), 1400);

    await s.caption('Click a block to select it. Its settings show on the right.');
    await s.click(canvas.getByRole('button', { name: 'More to come', exact: true }).last(), { after: 1500 });
    await s.caption('Change its text in the box on the right. The page updates as you type.', { mid: true });
    const text = p.locator('[contenteditable=true]:visible').first();
    await s.click(text, { after: 200 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('Walking the river trail', { delay: 60 });
    await s.wait(1400);

    await s.caption('The bar above a selected block selects what it sits in, copies it or deletes it.', { mid: true });
    await s.hover(canvas.getByRole('button', { name: /parent/i }).or(p.getByRole('button', { name: /parent/i })).first(), 900);
    await s.hover(canvas.getByRole('button', { name: /duplicate/i }).or(p.getByRole('button', { name: /^duplicate$/i })).last(), 900);
    await s.hover(canvas.getByRole('button', { name: /delete/i }).or(p.getByRole('button', { name: /^delete$/i })).last(), 900);

    await s.caption('To add a block, drag it from the left onto the page. A line shows where it will land.', { mid: true });
    await s.drag(p.getByRole('button', { name: 'Paragraph', exact: true }), canvas.getByRole('button', { name: 'Walking the river trail', exact: true }).last(), { dy: 5, after: 1400 });
    await s.caption('The new block is selected. Write in it on the right.', { mid: true });
    await s.click(p.locator('[contenteditable=true]:visible').first(), { after: 200 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('The trail is three miles long, and flat enough for strollers.', { delay: 40 });
    await s.wait(1200);

    await s.caption('Made a mistake? Undo takes back the last change.', { mid: true });
    await s.hover(p.getByRole('button', { name: 'undo' }), 1400);

    await s.caption('Check how the page looks on a phone with the buttons above it.');
    await s.click(p.getByRole('button', { name: 'Switch to Small viewport' }), { after: 2600 });
    await s.click(p.getByRole('button', { name: 'Switch to Large viewport' }), { after: 1200 });
  },
} satisfies SceneDef;
