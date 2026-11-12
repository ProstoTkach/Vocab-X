import { systemClock } from '@vocabx/core';
import { DICTIONARY_UPSTREAMS, UPSTREAM_FAILED } from '@/lib/lexicon/proxy';
import { DAY_MS, MINUTE_MS, memoryLimiter, senderKey, tooMany, type Rule } from '@/lib/rate-limit';

const TIMEOUT_MS = 6000;
const DAY_S = 86_400;
/**
 * All learners' lookups leave from our server's address, which a free service can throttle. So
 * each sender gets a share. Counted in this instance only (the owner's rule: no database wake-up
 * for a cheap route); a few instances make the real limit a little looser, which is fine here.
 */
const PER_MINUTE = 40;
const PER_DAY = 400;
const limiter = memoryLimiter();

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

  const sender = senderKey(request);
  const rules: Rule[] = [
    { key: `dictionary:m:${sender}`, max: PER_MINUTE, windowMs: MINUTE_MS },
    { key: `dictionary:d:${sender}`, max: PER_DAY, windowMs: DAY_MS },
  ];
  const verdict = limiter.spend(rules, systemClock.now());
  if (!verdict.ok) return tooMany(verdict);

  let failed = false;
  let body: unknown = null;
  try {
    const res = await fetch(target, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'VocabX (vocabulary trainer)', Accept: 'application/json' },
      next: { revalidate: DAY_S },
    });
    if (res.ok) body = (await res.json()) as unknown;
    // 404 is "no such word"; a 429 or a server error means the service is throttling or down,
    // and the app pauses its background lookups for a while.
    else if (res.status === 429 || res.status >= 500) failed = true;
  } catch {
    // Down or slow: the learner simply gets no suggestions from this dictionary.
    failed = true;
  }
  return Response.json(body, {
    headers: {
      ...(failed ? { [UPSTREAM_FAILED]: '1' } : {}),
      // Dictionary entries rarely change; a missing word is retried sooner.
      'Cache-Control': `public, s-maxage=${failed ? 60 : body === null ? 3600 : DAY_S}, stale-while-revalidate=${DAY_S}`,
    },
  });
}
