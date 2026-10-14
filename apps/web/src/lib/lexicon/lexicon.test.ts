import { createLookupCache, MemoryStorage } from '@vocabx/data';
import { describe, expect, test, vi } from 'vitest';
import { cachedTranslations } from './cached';
import type { FetchLike } from './http';
import { createMyMemoryProvider } from './mymemory';
import { createWiktionaryProvider } from './wiktionary';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

// Shape captured from a real api.mymemory.translated.net response (en → uk, "journey").
const MYMEMORY = {
  responseStatus: 200,
  quotaFinished: false,
  responseData: { translatedText: 'подорож ', match: 1 },
  matches: [
    { translation: 'подорож ', quality: 74, match: 1 },
    { translation: 'ПОДОРОЖ&#x0D;', quality: '74', match: 0.98 },
    { translation: 'мандрівка.', quality: 70, match: 0.95 },
    { translation: 'журнал', quality: 90, match: 0.5 },
  ],
};

describe('MyMemory', () => {
  test('cleans, dedupes and ranks translations', async () => {
    const fetch = vi.fn<FetchLike>(() => json(MYMEMORY));
    const p = createMyMemoryProvider({ fetch });
    expect(await p.translate({ text: 'journey', from: 'en', to: 'uk' })).toEqual([
      'подорож',
      'мандрівка',
    ]);
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('langpair')).toBe('en|uk');
    expect(url.searchParams.has('de')).toBe(false);
  });

  test('quota, HTTP and network errors give an empty result', async () => {
    const quota = createMyMemoryProvider({
      fetch: () => json({ ...MYMEMORY, quotaFinished: true }),
    });
    expect(await quota.translate({ text: 'a', from: 'en', to: 'uk' })).toEqual([]);
    const http = createMyMemoryProvider({ fetch: () => json({}, 500) });
    expect(await http.translate({ text: 'a', from: 'en', to: 'uk' })).toEqual([]);
    const offline = createMyMemoryProvider({
      fetch: () => Promise.reject(new TypeError('offline')),
    });
    expect(await offline.translate({ text: 'a', from: 'en', to: 'uk' })).toEqual([]);
  });

  test('times out', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('abort'))),
      );
    const p = createMyMemoryProvider({ fetch: hang, timeoutMs: 20 });
    expect(await p.translate({ text: 'a', from: 'en', to: 'uk' })).toEqual([]);
  });
});

// Shape captured from en.wiktionary.org/api/rest_v1/page/definition/journey.
const WIKTIONARY = {
  en: [
    {
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [
        {
          definition: 'A set amount of travelling; a <a href="/wiki/trip">trip</a>.',
          parsedExamples: [{ example: 'The <b>journey</b> took two days.' }],
        },
        { definition: '' },
      ],
    },
    { partOfSpeech: 'Verb', definitions: [{ definition: 'To travel.' }] },
  ],
  fr: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'day' }] }],
};

describe('Wiktionary', () => {
  test('maps sections of the requested language', async () => {
    const p = createWiktionaryProvider({ fetch: () => json(WIKTIONARY) });
    expect(await p.lookup('journey', 'en')).toEqual([
      {
        lemma: 'journey',
        pos: 'noun',
        definitions: ['A set amount of travelling; a trip.'],
        examples: [{ text: 'The journey took two days.' }],
      },
      { lemma: 'journey', pos: 'verb', definitions: ['To travel.'], examples: [] },
    ]);
    expect(await p.lookup('journey', 'de')).toEqual([]);
  });

  test('missing page gives an empty result', async () => {
    const p = createWiktionaryProvider({ fetch: () => json({ title: 'Not found' }, 404) });
    expect(await p.lookup('zzzz', 'en')).toEqual([]);
  });
});

describe('cache', () => {
  test('answers repeated lookups without the network', async () => {
    const fetch = vi.fn<FetchLike>(() => json(MYMEMORY));
    const cache = createLookupCache<string[]>(new MemoryStorage(), 'tr', {
      maxEntries: 10,
      ttlMs: 1e9,
      now: () => 0,
    });
    const p = cachedTranslations(createMyMemoryProvider({ fetch }), cache);
    await p.translate({ text: 'Journey', from: 'en', to: 'uk' });
    expect(await p.translate({ text: 'journey ', from: 'en', to: 'uk' })).toEqual([
      'подорож',
      'мандрівка',
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
