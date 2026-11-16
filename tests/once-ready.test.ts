import { describe, expect, it } from 'vitest';
import { onceReady } from '../src/lib/once-ready';
import { inScope } from '../src/lib/platform';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('onceReady', () => {
  it('shares the value between requests once it is ready', async () => {
    let made = 0;
    const get = onceReady(() => ++made, () => Promise.resolve());
    const first = inScope({}, get);
    await tick();
    expect(inScope({}, get)).toBe(first);
    expect(made).toBe(1);
  });

  it('gives a request its own when another request’s never became ready', async () => {
    let made = 0;
    // The first request ends before its value is ready: its promise never settles.
    const get = onceReady(() => ++made, (n) => (n === 1 ? new Promise(() => {}) : Promise.resolve()));
    const a = {};
    expect(inScope(a, get)).toBe(1);
    expect(inScope(a, get)).toBe(1);
    await tick();
    expect(inScope({}, get)).toBe(2);
    await tick();
    expect(inScope({}, get)).toBe(2);
  });

  it('keeps a request on its own value when a later request made another', () => {
    let made = 0;
    const get = onceReady(() => ++made, () => new Promise(() => {}));
    const a = {};
    expect(inScope(a, get)).toBe(1);
    expect(inScope({}, get)).toBe(2);
    expect(inScope(a, get)).toBe(1);
    expect(made).toBe(2);
  });

  it('keeps the request alive until the value is ready', () => {
    const kept: Promise<unknown>[] = [];
    const get = onceReady(() => 1, () => Promise.resolve());
    inScope({ waitUntil: (p) => kept.push(p) }, get);
    expect(kept).toHaveLength(1);
  });

  it('makes the value again after a failure', async () => {
    let made = 0;
    const get = onceReady(() => ++made, (n) => (n === 1 ? Promise.reject(new Error('no')) : Promise.resolve()));
    expect(get()).toBe(1);
    await tick();
    expect(get()).toBe(2);
  });
});
