// Which copy looks after a payment: the one it was made on (SITE_URL), or any copy when it has none.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atHome, homeHere } from '../src/lib/payments/home';

afterEach(() => vi.unstubAllEnvs());

describe('home copies', () => {
  it('records SITE_URL, and only that copy looks after the row', () => {
    vi.stubEnv('SITE_URL', 'https://example.org/');
    expect(homeHere('https://preview.example.workers.dev')).toBe('https://example.org');
    expect(atHome({ home: 'https://example.org' })).toBe(true);
    expect(atHome({ home: 'https://staging.example.org' })).toBe(false);
  });
  it('records none without SITE_URL, so any copy (and its hourly run) looks after it', () => {
    vi.stubEnv('SITE_URL', '');
    expect(homeHere('https://example.org')).toBe('');
    expect(atHome({ home: '' })).toBe(true);
  });
});
