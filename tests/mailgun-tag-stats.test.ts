import { afterEach, describe, expect, it, vi } from 'vitest';
import { tagStats } from '../src/lib/mailing/mailgun';

// "Compare with Mailgun's totals" reads Mailgun's Metrics API: the tags API's stats are deprecated and
// answered 404 "Tag not found" for a campaign's tag on a live account.
describe('tagStats', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const setup = (answer: unknown) => {
    vi.stubEnv('MAILGUN_API_KEY', 'key-test');
    vi.stubEnv('MAILGUN_DOMAIN', 'mail.example.org');
    vi.stubEnv('MAILGUN_REGION', 'us');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    return calls;
  };

  it('asks the Metrics API for the tag on the sending domain', async () => {
    const calls = setup({ items: [], aggregates: { metrics: { accepted_count: 1, delivered_count: 1, unique_opened_count: 1 } } });
    const now = new Date('2026-11-18T16:00:00Z');
    const totals = await tagStats('campaign-1', now);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.mailgun.net/v1/analytics/metrics');
    expect(calls[0].init?.method).toBe('POST');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.filter.AND).toEqual([
      { attribute: 'domain', comparator: '=', values: [{ label: 'mail.example.org', value: 'mail.example.org' }] },
      { attribute: 'tag', comparator: '=', values: [{ label: 'campaign-1', value: 'campaign-1' }] },
    ]);
    expect(body.end).toBe(now.toUTCString());
    expect(body.start).toBe(new Date('2026-08-20T16:00:00Z').toUTCString());
    expect(body.resolution).toBe('day');
    expect(body.include_aggregates).toBe(true);
    expect(totals).toEqual({ accepted: 1, delivered: 1, opened: 1 });
  });

  it('adds up the days when there are no aggregates', async () => {
    setup({ items: [{ metrics: { delivered_count: 2, unique_clicked_count: 1 } }, { metrics: { delivered_count: 3, unsubscribed_count: 1 } }] });
    expect(await tagStats('campaign-2')).toEqual({ delivered: 5, clicked: 1, unsubscribed: 1 });
  });

  it('nothing at Mailgun is no totals', async () => {
    setup({ items: [] });
    expect(await tagStats('campaign-3')).toEqual({});
  });
});
