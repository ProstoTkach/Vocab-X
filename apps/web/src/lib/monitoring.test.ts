import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { scrubEvent, sentryOptions } from './monitoring';

const event = (): ErrorEvent => ({
  type: undefined,
  message: 'word: bonjour',
  user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
  server_name: 'host',
  request: {
    url: 'https://vocabx-sigma.vercel.app/api/translate?q=bonjour',
    cookies: { s: 'secret' },
    headers: { cookie: 'secret' },
    data: { word: 'bonjour' },
    query_string: 'q=bonjour',
  },
  breadcrumbs: [{ category: 'fetch', data: { url: '/api/translate?q=bonjour' } }],
  extra: { word: 'bonjour' },
  tags: { route: 'error-boundary', email: 'a@b.c' },
  exception: {
    values: [
      { type: 'TypeError', value: 'x is not a function' },
      { type: 'Error', value: 'cannot add "bonjour"' },
    ],
  },
});

describe('scrubEvent', () => {
  it('leaves no user, address, cookies, query, body, breadcrumbs or extras', () => {
    const out = scrubEvent(event());
    const text = JSON.stringify(out);
    for (const secret of ['bonjour', 'a@b.c', '1.2.3.4', 'secret', 'host']) {
      expect(text).not.toContain(secret);
    }
    expect(out.request).toEqual({ url: '/api/translate' });
  });

  it('keeps engine messages and the allowed tags, drops other error texts', () => {
    const out = scrubEvent(event());
    expect(out.exception?.values?.[0]?.value).toBe('x is not a function');
    expect(out.exception?.values?.[1]?.value).toBeUndefined();
    expect(out.tags).toEqual({ route: 'error-boundary' });
  });
});

describe('sentryOptions', () => {
  it('is off without a DSN, and never sends PII, traces or breadcrumbs', () => {
    expect(sentryOptions(undefined).enabled).toBe(false);
    const on = sentryOptions('https://k@o1.ingest.de.sentry.io/1');
    expect(on.enabled).toBe(true);
    expect(on.sendDefaultPii).toBe(false);
    expect(on.tracesSampleRate).toBe(0);
    expect(on.beforeBreadcrumb()).toBeNull();
  });
});
