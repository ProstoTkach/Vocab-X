import { googleAccessToken, serviceAccountFromEnv } from '@/lib/google-auth';

const API = 'https://translation.googleapis.com/language/translate/v2';
const SCOPE = 'https://www.googleapis.com/auth/cloud-translation';
const TIMEOUT_MS = 6000;
const DAY_S = 86_400;
/** A word or a short phrase: longer texts are not what the word form asks for. */
const MAX_LENGTH = 120;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const CACHE_SIZE = 2000;

/** Recent answers, so the same word asked again costs nothing. */
const cache = new Map<string, string[]>();

/**
 * Translates a word with Google Translate as the service account (the key stays here). Answers
 * `{ translations: string[] }`, empty when the service is not set up or fails; the learner then
 * types the translation in.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!q || q.length > MAX_LENGTH || !LANG.test(from) || !LANG.test(to) || from === to)
    return Response.json({ translations: [] }, { status: 400 });

  const key = `${from}|${to}|${q}`;
  let translations = cache.get(key);
  if (!translations) {
    translations = await translate(q, from, to);
    if (translations.length > 0) {
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(key, translations);
    }
  }
  return Response.json(
    { translations },
    {
      headers: {
        // A word's translation does not change; an empty answer is retried sooner.
        'Cache-Control': `public, s-maxage=${translations.length ? 30 * DAY_S : 600}, stale-while-revalidate=${DAY_S}`,
      },
    },
  );
}

async function translate(q: string, from: string, to: string): Promise<string[]> {
  const account = serviceAccountFromEnv();
  if (!account) return [];
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await googleAccessToken(account, SCOPE)}`,
        'Content-Type': 'application/json',
        ...(process.env.GOOGLE_PROJECT_ID
          ? { 'x-goog-user-project': process.env.GOOGLE_PROJECT_ID }
          : {}),
      },
      body: JSON.stringify({ q: [q], source: from, target: to, format: 'text' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { translations?: { translatedText?: string }[] };
    };
    return (data.data?.translations ?? [])
      .map((t) => t.translatedText?.trim() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}
