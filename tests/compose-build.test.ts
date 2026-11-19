import { describe, expect, it } from 'vitest';
import { buildPage } from '../src/lib/compose/build';

const materials = () => ({ images: new Map(), videos: new Map(), tags: new Map() });

describe('buildPage', () => {
  it('makes every band full width, so a template content column does not box its background in', () => {
    const items = buildPage(
      { title: 'T', slug: 't', excerpt: '', sections: [{ kind: 'text', heading: 'A', body: 'B' }, { kind: 'cta', background: 'dark', heading: 'C', buttons: [{ label: 'Go', url: '/' }] }, { kind: 'stats', stats: [{ value: '1', label: 'One' }] }] } as any,
      materials(),
      'test',
    );
    expect(items.map((i) => [i.type, (i.props.attrs as any).width])).toEqual([
      ['section', 'full'],
      ['section', 'full'],
      ['section', 'full'],
    ]);
  });
});
