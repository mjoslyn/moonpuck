// Editor guide: Forms (docs-site/src/content/docs/editors/forms.md): making a form, adding fields,
// changing a field's settings, the builder's tabs and saving.
import type { SceneDef } from '../lib';

export default {
  name: 'forms',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    // "New form" asks for the name in the browser's own box, which a recording doesn't show: the caption
    // says what happens, and the name is filled in here.
    p.on('dialog', (d) => void d.accept('Volunteer sign-up'));

    await s.caption('Click Forms in the top bar, then Forms.', { hold: 2000 });
    await s.click(s.menu('Forms'), { after: 800 });
    await s.click(p.locator('header nav[aria-label=Admin] details[open]').getByRole('link', { name: 'Forms', exact: true }), { after: 0 });
    await p.waitForURL(/\/admin\/forms\//);
    await p.waitForLoadState('networkidle');
    await s.wait(600);

    await s.caption('Click New form, type its name (here, "Volunteer sign-up") and click OK.', { hold: 3000 });
    await s.click(p.getByRole('button', { name: 'New form' }), { after: 0 });
    await p.waitForURL(/\/admin\/forms\/\d+\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1000);

    await s.caption('The form builder opens. Click a field type on the left to add it.');
    await s.click(p.getByRole('button', { name: 'Name', exact: true }), { after: 900 });
    await s.click(p.getByRole('button', { name: 'Email', exact: true }), { after: 900 });
    await s.click(p.getByRole('button', { name: 'Checkboxes', exact: true }), { after: 1200 });

    await s.caption('The new field is selected. Change its label and other settings on the right.');
    const panel = p.getByRole('complementary').last();
    const label = panel.getByRole('textbox').first();
    await s.click(label, { after: 150 });
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type('Which days can you help?', { delay: 55 });
    await s.wait(900);
    await s.caption('Type the choices people can tick.');
    for (const [from, to] of [['First choice', 'Saturday mornings'], ['Second choice', 'Sunday afternoons'], ['Third choice', 'Weekday evenings']]) {
      await s.click(panel.locator(`input[value="${from}"]`), { after: 100, pause: 200 });
      await p.keyboard.press('ControlOrMeta+A');
      await p.keyboard.type(to, { delay: 40 });
      await s.wait(300);
    }
    await s.wait(600);
    const required = panel.getByRole('checkbox', { name: /Required/i });
    if (await required.count()) await s.click(required.first(), { after: 900 });

    await s.caption('The middle shows the form as visitors will see it.');
    await s.hover(p.locator('main iframe').first(), 1600);

    await s.caption('The tabs set what happens after someone sends it, and who gets an email.');
    await s.click(p.getByRole('button', { name: 'Confirmation' }), { after: 1800 });
    await s.click(p.getByRole('button', { name: /^Notifications/ }), { after: 1800 });
    await s.click(p.getByRole('button', { name: 'Fields' }), { after: 600 });

    await s.caption('Click Save. Then put the form on a page with the Form block.', { hold: 1400 });
    await s.click(p.getByRole('button', { name: 'Save', exact: true }), { after: 0 });
    await p.getByText('Saved', { exact: true }).first().waitFor({ timeout: 20_000 }).catch(() => {});
    await s.wait(2400);
  },
} satisfies SceneDef;
