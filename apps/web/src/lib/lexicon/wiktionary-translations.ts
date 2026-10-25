// Translation tables of the English Wiktionary: for an English word they list translations into
// many languages, sense by sense ("journey" → uk: поїздка, подорож, подорожувати). Read from the
// page wikitext via the MediaWiki API (CORS with origin=*). Long tables live on a
// "<word>/translations" subpage, which is fetched when the page points to it.
import type { TranslationProvider } from '@vocabx/core';
import { getJson, type FetchLike } from './http';

interface ParseResponse {
  parse?: { wikitext?: string };
}

export interface WiktionaryTranslationsOptions {
  fetch: FetchLike;
  timeoutMs?: number;
  maxResults?: number;
}

/** The "==English==" part of a page: other languages' homographs have no tables for us. */
function englishSection(wikitext: string): string {
  const start = wikitext.search(/^==\s*English\s*==\s*$/m);
  if (start < 0) return wikitext;
  const rest = wikitext.slice(start + 1);
  const end = rest.search(/^==[^=].*==\s*$/m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Stress marks (по́дорож) and wiki links are not part of the word. */
const cleanTerm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀́]/g, '')
    .normalize('NFC')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    // Whatever markup is left over (a broken link, a template) is not part of it either.
    .replace(/[[\]{}<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Translations into `to` from {{t|uk|…}}, {{t+|uk|…}}, {{tt|…}} and their -check variants. */
export function translationsFromWikitext(wikitext: string, to: string): string[] {
  const code = to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The term may hold wiki links with their own "|": {{tt|uk|[[англійський|англі́йська]] [[мо́ва]]}}.
  const re = new RegExp(
    `\\{\\{t{1,2}\\+?(?:-?check)?\\|${code}\\|((?:\\[\\[[^\\]]*\\]\\]|[^|}\\[])+)`,
    'g',
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of englishSection(wikitext).matchAll(re)) {
    const term = cleanTerm(m[1] ?? '');
    const key = term.toLocaleLowerCase(to);
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

const pointsToSubpage = (wikitext: string) => /\{\{see translation subpage/i.test(wikitext);

export function createWiktionaryTranslations(
  o: WiktionaryTranslationsOptions,
): TranslationProvider {
  const page = async (title: string, signal?: Parameters<typeof getJson>[3]) => {
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'wikitext',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    const data = (await getJson(
      o.fetch,
      `https://en.wiktionary.org/w/api.php?${params.toString()}`,
      o.timeoutMs ?? 6000,
      signal,
    )) as ParseResponse | null;
    return data?.parse?.wikitext ?? '';
  };
  return {
    id: 'wiktionary-translations',
    async translate({ text, from, to, signal }) {
      const term = text.trim();
      // Translation tables are kept on the entries of English words only.
      if (!term || from !== 'en' || from === to) return [];
      const main = await page(term, signal);
      let found = translationsFromWikitext(main, to);
      if (!found.length && pointsToSubpage(main))
        found = translationsFromWikitext(await page(`${term}/translations`, signal), to);
      return found.slice(0, o.maxResults ?? 8);
    },
  };
}
