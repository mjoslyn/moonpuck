// Editor guide: The shop (docs-site/src/content/docs/editors/shop.md): adding a product (title, price,
// picture), publishing it, and the product in the shop on the site.
import type { SceneDef } from '../lib';

export default {
  name: 'shop',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    await s.caption('Click Content, then Products.', { hold: 1800 });
    await s.click(s.menu('Content'), { after: 800 });
    await s.click(p.locator('header nav[aria-label=Admin] details[open]').getByRole('link', { name: 'Products', exact: true }), { after: 0 });
    await p.waitForURL(/type=product/);
    await p.waitForLoadState('networkidle');
    await s.caption('Click New Product.', { hold: 1400 });
    await s.click(p.getByRole('button', { name: 'New Product' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1200);

    await s.caption('Give it a title...', { mid: true, hold: 1000 });
    await s.type(p.getByRole('textbox', { name: 'Title', exact: true }), 'Example Town tote bag', { delay: 55 });
    await s.caption('...a picture...', { mid: true, hold: 900 });
    await s.click(p.getByRole('button', { name: 'Choose', exact: true }).first(), { after: 1200 });
    await s.click(p.getByText('town-hall.jpg', { exact: true }).filter({ visible: true }).first(), { after: 1400 });
    await s.caption('...and, under Shop, its price.', { mid: true, hold: 900 });
    await s.type(p.getByRole('textbox', { name: 'Price', exact: true }), '18.00', { delay: 90 });
    await s.caption('Sizes, colors, stock and sales are set here too.', { mid: true });
    await s.hover(p.getByRole('button', { name: 'Add an option' }), 1400);

    await s.caption('Describe it on the page, then click Publish.', { mid: true, hold: 1600 });
    await s.click(p.getByRole('button', { name: 'Publish', exact: true }), { after: 0 });
    await p.getByText(/Published \d/).first().waitFor({ timeout: 20_000 });
    await s.wait(1400);

    await s.caption('It is in the shop straight away, ready to add to the cart.', { hold: 1000 });
    await s.goto('/shop/');
    await s.wait(800);
    await s.hover(p.getByText('Example Town tote bag').first(), 2800);
  },
} satisfies SceneDef;
