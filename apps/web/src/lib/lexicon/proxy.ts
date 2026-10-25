import type { FetchLike } from './http';

/** Dictionaries asked through our /api/dictionary route instead of straight from the browser. */
export const DICTIONARY_UPSTREAMS = [
  'https://api.dictionaryapi.dev/api/v2/entries/',
  'https://en.wiktionary.org/api/rest_v1/page/definition/',
] as const;

/**
 * Sends lookups of those dictionaries through the route, which turns "not found" and outages
 * into a quiet `null` (no red network errors in the console). Other addresses go out as they are.
 */
export function proxiedFetch(fetchFn: FetchLike): FetchLike {
  return (url, init) =>
    DICTIONARY_UPSTREAMS.some((prefix) => url.startsWith(prefix))
      ? fetchFn(`/api/dictionary?url=${encodeURIComponent(url)}`, init)
      : fetchFn(url, init);
}
