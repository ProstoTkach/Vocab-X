import { createLookupCache, MemoryStorage } from '@vocabx/data';
import { describe, expect, test, vi } from 'vitest';
import { cachedTranslations } from './cached';
import { createFreeDictionaryProvider } from './free-dictionary';
import { createGoogleTranslateProvider } from './google-translate';
import type { FetchLike } from './http';
import { proxiedFetch } from './proxy';
import {
  contextWords,
  isSentence,
  mergedLexicon,
  mergedTranslations,
  suggestWord,
} from './suggest';
import { createTatoebaProvider } from './tatoeba';
import { createWiktionaryProvider } from './wiktionary';
import { createWiktionaryTranslations, translationsFromWikitext } from './wiktionary-translations';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

// What /api/translate answers for "journey" (en → uk).
const GOOGLE = { translations: ['Подорож.'] };

describe('Google Translate', () => {
  test('asks the app server, cleans the answer', async () => {
    const fetch = vi.fn<FetchLike>(() => json(GOOGLE));
    const p = createGoogleTranslateProvider({ fetch });
    expect(await p.translate({ text: 'journey', from: 'en', to: 'uk' })).toEqual(['подорож']);
    const url = new URL(fetch.mock.calls[0]![0], 'http://x');
    expect(url.pathname).toBe('/api/translate');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'journey', from: 'en', to: 'uk' });
  });

  test('a capitalized word keeps its case; the word itself is no translation', async () => {
    const p = createGoogleTranslateProvider({
      fetch: () => json({ translations: ['Лондон', 'London'] }),
    });
    expect(await p.translate({ text: 'London', from: 'en', to: 'uk' })).toEqual(['Лондон']);
  });

  test('HTTP and network errors and odd answers give an empty result', async () => {
    const http = createGoogleTranslateProvider({ fetch: () => json({}, 500) });
    expect(await http.translate({ text: 'a', from: 'en', to: 'uk' })).toEqual([]);
    const offline = createGoogleTranslateProvider({
      fetch: () => Promise.reject(new TypeError('offline')),
    });
    expect(await offline.translate({ text: 'a', from: 'en', to: 'uk' })).toEqual([]);
    const odd = createGoogleTranslateProvider({ fetch: () => json({ translations: 'x' }) });
    expect(await odd.translate({ text: 'a', from: 'en', to: 'uk' })).toEqual([]);
  });

  test('times out', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('abort'))),
      );
    const p = createGoogleTranslateProvider({ fetch: hang, timeoutMs: 20 });
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
    const fetch = vi.fn<FetchLike>(() => json({ translations: ['подорож', 'мандрівка'] }));
    const cache = createLookupCache<string[]>(new MemoryStorage(), 'tr', {
      maxEntries: 10,
      ttlMs: 1e9,
      now: () => 0,
    });
    const p = cachedTranslations(createGoogleTranslateProvider({ fetch }), cache);
    await p.translate({ text: 'Journey', from: 'en', to: 'uk' });
    expect(await p.translate({ text: 'journey ', from: 'en', to: 'uk' })).toEqual([
      'подорож',
      'мандрівка',
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// Shape captured from api.dictionaryapi.dev/api/v2/entries/en/hello (shortened).
const FREE_DICTIONARY = [
  {
    word: 'hello',
    phonetics: [{ text: '/həˈləʊ/' }],
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [{ definition: '"Hello!" or an equivalent greeting.', synonyms: [] }],
        synonyms: ['greeting'],
      },
      {
        partOfSpeech: 'interjection',
        definitions: [
          { definition: 'A greeting.', synonyms: ['hi'], example: 'Hello, everyone.' },
          { definition: 'Answering the telephone.', example: 'Hello? How may I help you?' },
        ],
        synonyms: [],
      },
    ],
  },
];

describe('Free Dictionary', () => {
  test('maps meanings to examples and synonyms', async () => {
    const fetch = vi.fn<FetchLike>(() => json(FREE_DICTIONARY));
    const p = createFreeDictionaryProvider({ fetch });
    const entries = await p.lookup('hello', 'en');
    expect(fetch.mock.calls[0]![0]).toBe('https://api.dictionaryapi.dev/api/v2/entries/en/hello');
    expect(entries.flatMap((e) => e.examples.map((x) => x.text))).toEqual([
      'Hello, everyone.',
      'Hello? How may I help you?',
    ]);
    expect(entries.flatMap((e) => e.synonyms)).toEqual(['greeting', 'hi']);
  });

  test('other languages, "not found" and an outage give nothing', async () => {
    const fetch = vi.fn<FetchLike>(() => json(FREE_DICTIONARY));
    expect(await createFreeDictionaryProvider({ fetch }).lookup('hallo', 'de')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    const missing = createFreeDictionaryProvider({
      fetch: () => json({ title: 'No Definitions Found' }, 404),
    });
    expect(await missing.lookup('zzz', 'en')).toEqual([]);
    const down = createFreeDictionaryProvider({ fetch: () => json('error code: 1033', 530) });
    expect(await down.lookup('run', 'en')).toEqual([]);
  });
});

describe('suggestWord', () => {
  const translations = {
    id: 'fake',
    translate: vi.fn(({ text }: { text: string }) =>
      Promise.resolve(
        (
          { hello: ['привіт', 'вітаю'], greeting: ['вітання', 'привіт'], hi: ['привіт'] } as Record<
            string,
            string[]
          >
        )[text] ?? [],
      ),
    ),
  };
  const dictionary = mergedLexicon([
    createFreeDictionaryProvider({ fetch: () => json(FREE_DICTIONARY) }),
    // A dictionary that fails must not spoil the others.
    { id: 'broken', lookup: () => Promise.reject(new Error('down')) },
    {
      id: 'more',
      lookup: () =>
        Promise.resolve([
          {
            lemma: 'hello',
            definitions: [],
            examples: [{ text: 'She waved a greeting.' }, { text: 'Hello, everyone.' }],
          },
        ]),
    },
  ]);

  test('several translations (also via synonyms) and examples with the word first', async () => {
    const s = await suggestWord(
      { translations, dictionary },
      { term: ' hello ', from: 'en', to: 'uk' },
    );
    expect(s.translations).toEqual(['привіт', 'вітаю', 'вітання']);
    expect(s.examples).toEqual([
      'Hello, everyone.',
      'Hello? How may I help you?',
      'She waved a greeting.',
    ]);
  });

  test('an empty word asks nothing', async () => {
    translations.translate.mockClear();
    expect(
      await suggestWord({ translations, dictionary }, { term: ' ', from: 'en', to: 'uk' }),
    ).toEqual({
      translations: [],
      examples: [],
    });
    expect(translations.translate).not.toHaveBeenCalled();
  });
});

// Lines captured from the wikitext of en.wiktionary.org/wiki/journey and run/translations.
const JOURNEY_WIKITEXT = [
  '==English==',
  '===Noun===',
  '{{trans-top|a set amount of travelling}}',
  '* Ukrainian: {{t|uk|пої́здка|f}}, {{t+|uk|по́дорож|f}}',
  '* Russian: {{t+|ru|пое́здка|f}}',
  '{{trans-top|to travel, to make a trip or voyage}}',
  '* Ukrainian: {{t|uk|подорожувати}}, {{tt+check|uk|[[мандрувати]]}}',
  '==French==',
  '* Ukrainian: {{t|uk|день}}',
].join('\n');

describe('Wiktionary translation tables', () => {
  test('every sense of the English entry, without stress marks or other languages', () => {
    expect(translationsFromWikitext(JOURNEY_WIKITEXT, 'uk')).toEqual([
      'поїздка',
      'подорож',
      'подорожувати',
      'мандрувати',
    ]);
    expect(translationsFromWikitext(JOURNEY_WIKITEXT, 'de')).toEqual([]);
  });

  test('follows a translation subpage; only English words are looked up', async () => {
    const fetch = vi.fn<FetchLike>((url) =>
      json({
        parse: {
          wikitext: url.includes('run%2Ftranslations')
            ? '* Ukrainian: {{t+|uk|бі́гти|impf}}, {{t+|uk|біг|m}}'
            : '==English==\n{{see translation subpage|Verb}}',
        },
      }),
    );
    const p = createWiktionaryTranslations({ fetch });
    expect(await p.translate({ text: 'run', from: 'en', to: 'uk' })).toEqual(['бігти', 'біг']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await p.translate({ text: 'laufen', from: 'de', to: 'uk' })).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('joined with Google Translate: its variant first, no repeats, a failing source skipped', async () => {
    const merged = mergedTranslations([
      createGoogleTranslateProvider({
        fetch: () => json({ translations: ['подорож', 'мандрівка'] }),
      }),
      createWiktionaryTranslations({
        fetch: () => json({ parse: { wikitext: JOURNEY_WIKITEXT } }),
      }),
      { id: 'down', translate: () => Promise.reject(new Error('down')) },
    ]);
    expect(await merged.translate({ text: 'journey', from: 'en', to: 'uk' })).toEqual([
      'подорож',
      'мандрівка',
      'поїздка',
      'подорожувати',
      'мандрувати',
    ]);
  });
});

describe('dictionary proxy', () => {
  test('dictionaries go through /api/dictionary, other addresses straight', async () => {
    const fetch = vi.fn<FetchLike>(() => json(null));
    const p = proxiedFetch(fetch);
    await p('https://api.dictionaryapi.dev/api/v2/entries/en/hello');
    await p('/api/translate?q=hello');
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      '/api/dictionary?url=https%3A%2F%2Fapi.dictionaryapi.dev%2Fapi%2Fv2%2Fentries%2Fen%2Fhello',
      '/api/translate?q=hello',
    ]);
  });

  test('a word the dictionary does not know comes back as nothing', async () => {
    const p = createFreeDictionaryProvider({ fetch: proxiedFetch(() => json(null)) });
    expect(await p.lookup('zzz', 'en')).toEqual([]);
  });
});

describe('cleaning up what the sources give', () => {
  test('a wiki link with its own "|" stays one translation', () => {
    const wikitext = [
      '==English==',
      '* Ukrainian: {{tt+|uk|англі́йський}}, {{tt|uk|[[англійський|англі́йська]] [[мо́ва]]|f}}',
    ].join('\n');
    expect(translationsFromWikitext(wikitext, 'uk')).toEqual(['англійський', 'англійська мова']);
  });

  test('examples: a sentence of little words and the word itself tells nothing', () => {
    expect(contextWords('When is convenient for you?', 'convenient', 'en')).toBe(0);
    expect(contextWords("It doesn't seem convenient.", 'convenient', 'en')).toBe(0);
    expect(contextWords('The bus stop is convenient for the office.', 'convenient', 'en')).toBe(3);
    expect(contextWords('Ми їдемо в подорож улітку.', 'подорож', 'uk')).toBe(2);
  });

  test('examples: sentences are kept, bare phrases are not', () => {
    expect(isSentence('the old reliables')).toBe(false);
    expect(isSentence('Is Tom reliable?')).toBe(true);
    expect(isSentence('She is a very reliable friend')).toBe(true);
    expect(isSentence('信頼できる人です')).toBe(true);
  });

  test('Tatoeba: sentences of a readable length, unapproved ones left out', async () => {
    const fetch = vi.fn<FetchLike>(() =>
      json({
        data: [
          { text: 'I wonder whether Tom is reliable.' },
          { text: 'Tom is  not  reliable at all.', is_unapproved: false },
          { text: 'Reliable bad sentence here.', is_unapproved: true },
        ],
      }),
    );
    const p = createTatoebaProvider({ fetch });
    const [entry] = await p.lookup('reliable', 'en');
    expect(entry?.examples.map((e) => e.text)).toEqual([
      'I wonder whether Tom is reliable.',
      'Tom is not reliable at all.',
    ]);
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('lang')).toBe('eng');
    expect(url.searchParams.get('word_count')).toBe('6-16');
    expect(await p.lookup('reliable', 'xx')).toEqual([]);
  });
});
