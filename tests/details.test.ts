// The Details block (src/render/c/content.ts details): a summary that opens to show the blocks inside;
// Compose's FAQ sections are made of them (src/lib/compose/build.ts).
import { describe, expect, it } from 'vitest';
import { details } from '../src/render/c/content';
import { buildPage } from '../src/lib/compose/build';
import { CONTENT_FIELDS } from '../src/lib/content/linked-patterns';

const env = { ctx: { loader: { media: new Map() } } } as any;
const render = (attrs: Record<string, unknown>) => details({ type: 'details', attrs, id: 'd' } as any, env, (() => '<p>Yes.</p>') as any);

describe('details', () => {
  it('renders a closed <details> with its summary and the blocks inside', () => {
    const html = render({ summary: 'Do you take <em>walk-ins</em>?' });
    expect(html).toBe('<details class="c-details"><summary class="c-details__summary">Do you take <em>walk-ins</em>?</summary><div class="c-details__body c-flow"><p>Yes.</p></div></details>');
  });

  it('starts open when asked, and takes the shared style settings', () => {
    const html = render({ summary: 'Q', open: true, className: 'faq', anchor: 'hours', style: { color: 'var(--color-text)' } });
    expect(html).toContain('open="open"');
    expect(html).toContain('id="hours"');
    expect(html).toMatch(/class="c-details faq"/);
    expect(html).toContain('color:var(--color-text)');
  });

  it('keeps its summary as content a linked pattern lets each page change', () => {
    expect(CONTENT_FIELDS.details?.map((f) => f.key)).toEqual(['summary']);
  });

  it('is what Compose builds a FAQ from', () => {
    const items = buildPage(
      { title: 'Help', sections: [{ kind: 'faq', heading: 'Questions', items: [{ question: 'When?', answer: 'Soon.' }, { question: 'Where?', answer: 'Here.' }] }] } as any,
      { images: new Map(), videos: new Map(), tags: new Map() } as any,
      't',
    );
    const found: any[] = [];
    const walk = (list: any[]) => list.forEach((i) => (i.type === 'details' ? found.push(i) : walk(i.props.children ?? [])));
    walk(items);
    expect(found.map((d) => d.props.attrs.summary)).toEqual(['When?', 'Where?']);
    expect(JSON.stringify(found[0].props.children)).toContain('Soon.');
  });
});
