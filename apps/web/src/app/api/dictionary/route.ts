import { DICTIONARY_UPSTREAMS } from '@/lib/lexicon/proxy';

const TIMEOUT_MS = 6000;
const DAY_S = 86_400;

/**
 * Relays a lookup to one of the free dictionaries. They answer an unknown word with 404 (and
 * Free Dictionary is often down without CORS headers), which browsers log as errors; here every
 * answer comes back as 200 with the dictionary's JSON, or `null` when it found nothing.
 * Only the fixed dictionary addresses are allowed, so this is not an open proxy.
 */
export async function GET(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get('url') ?? '';
  if (!DICTIONARY_UPSTREAMS.some((prefix) => target.startsWith(prefix)) || target.length > 400)
    return Response.json(null, { status: 400 });

  let body: unknown = null;
  try {
    const res = await fetch(target, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'VocabX (vocabulary trainer)', Accept: 'application/json' },
      next: { revalidate: DAY_S },
    });
    if (res.ok) body = (await res.json()) as unknown;
  } catch {
    // Down or slow: the learner simply gets no suggestions from this dictionary.
  }
  return Response.json(body, {
    headers: {
      // Dictionary entries rarely change; a missing word is retried sooner.
      'Cache-Control': `public, s-maxage=${body === null ? 3600 : DAY_S}, stale-while-revalidate=${DAY_S}`,
    },
  });
}
