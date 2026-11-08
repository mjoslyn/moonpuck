import { describe, expect, it } from 'vitest';
import { ancestorsOf } from '../src/lib/puck/trail';

const zones: Record<string, string> = { section: 'root:default-zone', columns: 'section:children', column: 'columns:children', text: 'column:children' };
const zoneOf = (id: string) => zones[id];

describe('ancestorsOf', () => {
  it('lists every block a nested block sits inside, outermost first', () => {
    expect(ancestorsOf('text', zoneOf)).toEqual(['section', 'columns', 'column']);
  });
  it('is empty for a block at the top of the page', () => {
    expect(ancestorsOf('section', zoneOf)).toEqual([]);
  });
  it('stops at a block it cannot place, or a loop', () => {
    expect(ancestorsOf('missing', zoneOf)).toEqual([]);
    expect(ancestorsOf('a', (id) => (id === 'a' ? 'b:children' : 'a:children'))).toEqual(['b']);
  });
});

describe("the editor's settings panel override", () => {
  // An arrow made inside the editor's render is a new component on each render, so React remounts the
  // whole settings panel on every keystroke in it, and the field being typed in loses its focus.
  it('is a component of its own, not an arrow made in the render', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/puck/Editor.tsx', import.meta.url), 'utf8');
    const overrides = src.slice(src.indexOf('overrides={{'));
    const fields = overrides.match(/\n\s*fields:\s*([^\n]+)/)?.[1] ?? '';
    expect(fields).toMatch(/^[A-Z]\w*,$/);
  });
});
