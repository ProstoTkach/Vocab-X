// Collects example sentences for the built-in words, once, from Tatoeba (CC BY 2.0 FR / CC0).
// Each word gets up to MAX_EXAMPLES in all (the deck's own sentence counts); what is found is
// written, with the sentence number and the author, to one file per deck:
//   /public/examples/<deck>.json  =  { "v": 1, "words": { "<word id>": [Example, …] } }
// The files are shipped as static files and loaded on demand (lib/lexicon/builtin-examples.ts),
// so the app asks no third party for the built-in words. The owner reads the result before it is
// committed. Run by hand, not in CI (it makes ~1 request per word):
//   pnpm dlx tsx apps/web/scripts/fetch-examples.ts [--review <file>] [--cache <file>]
// `--cache` keeps the raw answers so an interrupted run goes on where it stopped; `--review`
// writes a plain list (deck, word, sentence, author) to read through.
import { MAX_EXAMPLES, mergeExamples, type Example } from '@vocabx/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { builtinCatalog } from '../../../packages/content/src/decks';
import { contextWords, isSentence } from '../src/lib/lexicon/suggest';
import { createTatoebaProvider } from '../src/lib/lexicon/tatoeba';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const cachePath = arg('--cache');
const reviewPath = arg('--review');
const OUT = fileURLToPath(new URL('../../../public/examples/', import.meta.url));
const PAUSE_MS = 300;
const PARALLEL = 4;
/** A sentence with this many words besides the studied one shows its meaning well. */
const GOOD_CONTEXT = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const catalog = builtinCatalog();
const provider = createTatoebaProvider({
  fetch: (url, init) => fetch(url, init),
  timeoutMs: 20_000,
  maxExamples: 10,
});

const cache: Record<string, Example[]> =
  cachePath && existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, Example[]>)
    : {};

let asked = 0;
const queue = catalog.words.filter((w) => w.examples.length < MAX_EXAMPLES && !cache[w.id]);

async function work(w: (typeof queue)[number]) {
  const entries = await provider.lookup(w.term, w.lang).catch(() => []);
  asked++;
  const found = entries
    .flatMap((e) => e.examples)
    .filter(
      (e) =>
        e.text.length <= 200 && isSentence(e.text) && contextWords(e.text, w.term, w.lang) >= 1,
    )
    // Stable: sentences that show the meaning well first, otherwise Tatoeba's relevance order.
    .sort(
      (a, b) =>
        Number(contextWords(b.text, w.term, w.lang) >= GOOD_CONTEXT) -
        Number(contextWords(a.text, w.term, w.lang) >= GOOD_CONTEXT),
    );
  // Only sentences with an author can be shown with the credit CC BY asks for.
  cache[w.id] = mergeExamples(
    w,
    w.examples,
    found.filter((e) => e.credit),
  ).slice(w.examples.length);
  if (cachePath) writeFileSync(cachePath, JSON.stringify(cache));
  if (asked % 25 === 0) console.log(`${asked} of ${queue.length + asked} words asked…`);
  await sleep(PAUSE_MS);
}

// A few at a time: the API answers slowly (seconds per word), and a few are no load on it.
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let w = queue.shift(); w; w = queue.shift()) await work(w);
  }),
);

mkdirSync(OUT, { recursive: true });
const review: string[] = [];
let sentences = 0;
for (const deck of catalog.decks) {
  const words: Record<string, Example[]> = {};
  for (const id of deck.wordIds) {
    const added = cache[id];
    if (added?.length) words[id] = added;
  }
  const slug = deck.id.replace(/^builtin:/, '');
  writeFileSync(`${OUT}${slug}.json`, JSON.stringify({ v: 1, words }) + '\n');
  for (const [id, list] of Object.entries(words))
    for (const e of list) {
      sentences++;
      review.push(
        `${slug}\t${id}\t${e.text}\t${e.credit?.by}\t#${e.credit?.id}\t${e.credit?.license}`,
      );
    }
}
if (reviewPath) writeFileSync(reviewPath, review.join('\n') + '\n');
const without = catalog.words.filter((w) => w.examples.length + (cache[w.id]?.length ?? 0) < 3);
console.log(
  `${catalog.words.length} words, ${asked} asked in this run, ${sentences} sentences in ${catalog.decks.length} decks; ` +
    `${without.length} words still have fewer than 3 examples`,
);
