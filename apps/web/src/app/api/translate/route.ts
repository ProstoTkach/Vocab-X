import { systemClock } from '@vocabx/core';
import { and, eq, gt, lt, inArray } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NO_STORE, requestUserId } from '@/lib/api-user';
import { dbFromEnv, type Db } from '@/lib/db/client';
import { rateLimits, translationCache } from '@/lib/db/schema';
import { googleAccessToken, serviceAccountFromEnv } from '@/lib/google-auth';
import type { TranslateLimited } from '@/lib/lexicon/google-translate';
import {
  DAY_MS,
  MINUTE_MS,
  hashed,
  memoryLimiter,
  senderKey,
  spend,
  spendQuery,
  sweepQuery,
  tooMany,
  verdictOf,
  type Rule,
  type Verdict,
} from '@/lib/rate-limit';
import { RETENTION } from '@/lib/retention';
import { switchedOff } from '@/lib/kill-switch';

const API = 'https://translation.googleapis.com/language/translate/v2';
const SCOPE = 'https://www.googleapis.com/auth/cloud-translation';
const TIMEOUT_MS = 6000;
const DAY_S = 86_400;
/** A word or a short phrase: longer texts are not what the word form asks for. */
const MAX_LENGTH = 120;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/**
 * Words a day (owner, 2026-11-12: 10 uses of "Suggest" without signing in, 100 signed in). One
 * use asks for up to three words, the word and two of its synonyms (`suggestWord`), so the limits
 * are three times the uses: never fewer uses than promised, more when words repeat.
 */
const ANONYMOUS_PER_DAY = 30;
const ACCOUNT_PER_DAY = 300;
/** A burst from one sender is refused here, in memory, before it can wake the database. */
const BURST: Omit<Rule, 'key'> = { max: 20, windowMs: MINUTE_MS };
/**
 * Characters sent to Google a day, for everyone together: Google's free 500 000 a month stay
 * free at 15 000 a day (30 × 15 000 = 450 000). `TRANSLATE_DAILY_CHARS` changes it; 0 turns
 * the service off.
 */
const DAILY_CHARS = 15_000;
const CEILING_KEY = 'translate:all';
/** How long a shared answer is kept, here and by the CDN (see 6.7 on Google's terms). */
const CACHE_DAYS = RETENTION.translationDays;
const CACHE_MS = CACHE_DAYS * DAY_MS;
const SWEEP = 20;

const burst = memoryLimiter();
/** Without a database (local runs): recent answers in this instance. */
const memoryCache = new Map<string, string[]>();
const MEMORY_CACHE_SIZE = 2000;

const ceiling = () => {
  const raw = process.env.TRANSLATE_DAILY_CHARS;
  const set = raw ? Number(raw) : NaN;
  return Number.isFinite(set) && set >= 0 ? set : DAILY_CHARS;
};

const answer = (translations: string[]) =>
  Response.json(
    { translations },
    {
      headers: {
        // The same for everyone, so a CDN may keep it: a word asked there costs nothing at all,
        // not even a count. An empty answer is retried sooner.
        'Cache-Control': `public, s-maxage=${translations.length ? CACHE_DAYS * DAY_S : 600}, stale-while-revalidate=${DAY_S}`,
      },
    },
  );

/** Switched off (`KILL_TRANSLATE`): the form says so; never kept by a CDN. */
const unavailable = () =>
  Response.json({ translations: [], unavailable: true }, { status: 503, headers: NO_STORE });

const nothing = (status: number) =>
  Response.json({ translations: [] }, { status, headers: NO_STORE });

/**
 * Translates a word with Google Translate as the service account (the key stays here). Answers
 * `{ translations: string[] }`, empty when the service is not set up or fails; the learner then
 * types the translation in. 429 `{ limited }` past the day's limit of this sender (not signed in)
 * or account; 503 `{ unavailable }` when switched off (`KILL_TRANSLATE`); 503 when the day's ceiling for everyone is reached or the database is not there.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!q || q.length > MAX_LENGTH || !LANG.test(from) || !LANG.test(to) || from === to)
    return nothing(400);
  // Before the sender is counted or the database opened: a flag costs nothing. (A word the CDN
  // already holds is still served from it.)
  if (switchedOff('translate')) return unavailable();
  const account = serviceAccountFromEnv();
  if (!account) return answer([]);

  const now = systemClock.now();
  const sender = senderKey(request);
  const quick = burst.spend([{ key: sender, ...BURST }], now);
  if (!quick.ok) return tooMany(quick);
  const userId = await requestUserId(request);
  const who: TranslateLimited = userId ? 'account' : 'anonymous';
  const rule: Rule = userId
    ? { key: `translate:u:${hashed(userId)}`, max: ACCOUNT_PER_DAY, windowMs: DAY_MS }
    : { key: `translate:s:${sender}`, max: ANONYMOUS_PER_DAY, windowMs: DAY_MS };
  const limited = (v: Verdict & { ok: false }) => tooMany(v, { translations: [], limited: who });
  const key = `${from}|${to}|${q}`;

  const db = dbFromEnv();
  if (!db) {
    const v = await spend(null, [rule], now);
    if (!v.ok) return limited(v);
    let translations = memoryCache.get(key);
    if (!translations) {
      translations = await translate(account, q, from, to);
      if (translations.length) {
        if (memoryCache.size >= MEMORY_CACHE_SIZE)
          memoryCache.delete(memoryCache.keys().next().value!);
        memoryCache.set(key, translations);
      }
    }
    return answer(translations);
  }

  try {
    // One request to the database: the count, the shared answer, the day's total.
    const [counts, cached, total] = await db.batch([
      spendQuery(db, [rule], now),
      db
        .select({ translations: translationCache.translations })
        .from(translationCache)
        .where(
          and(
            eq(translationCache.key, key),
            gt(translationCache.createdAt, new Date(now - CACHE_MS)),
          ),
        ),
      db
        .select({ count: rateLimits.count, resetAt: rateLimits.resetAt })
        .from(rateLimits)
        .where(eq(rateLimits.key, CEILING_KEY)),
    ]);
    const v = verdictOf(counts, [rule], now);
    if (!v.ok) return limited(v);
    if (cached[0]) return answer(cached[0].translations);
    const day = total[0];
    const sent = day && day.resetAt.getTime() > now ? day.count : 0;
    if (sent + q.length > ceiling()) return nothing(503);

    const translations = await translate(account, q, from, to);
    // Google counts what was sent, found or not.
    await db.batch([
      spendQuery(db, [{ key: CEILING_KEY, max: ceiling(), windowMs: DAY_MS, cost: q.length }], now),
      ...(translations.length ? [remember(db, key, translations, now)] : []),
      forgetOld(db, now),
      sweepQuery(db, now),
    ]);
    return answer(translations);
  } catch (e) {
    // Without the count nothing goes to Google: a bill must not grow while the limit is blind.
    console.error('translate: database', e instanceof Error ? e.message : 'unknown');
    return nothing(503);
  }
}

const remember = (db: Db, key: string, translations: string[], now: number) =>
  db
    .insert(translationCache)
    .values({ key, translations, createdAt: new Date(now) })
    .onConflictDoUpdate({
      target: translationCache.key,
      set: { translations, createdAt: new Date(now) },
    });

/** A few answers past their time go with every new one. */
const forgetOld = (db: Db, now: number) => {
  const before = new Date(now - CACHE_MS);
  return db
    .delete(translationCache)
    .where(
      and(
        lt(translationCache.createdAt, before),
        inArray(
          translationCache.key,
          db
            .select({ key: translationCache.key })
            .from(translationCache)
            .where(lt(translationCache.createdAt, before))
            .limit(SWEEP),
        ),
      ),
    );
};

async function translate(
  account: NonNullable<ReturnType<typeof serviceAccountFromEnv>>,
  q: string,
  from: string,
  to: string,
): Promise<string[]> {
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
