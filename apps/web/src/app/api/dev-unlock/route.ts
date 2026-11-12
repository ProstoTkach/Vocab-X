import { createHash, timingSafeEqual } from 'node:crypto';
import { crossSite, fail } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { DAY_MS, MINUTE_MS, senderKey, spend, tooMany } from '@/lib/rate-limit';

/** A wrong code waits this long: guessing it by trying many is slow. */
const WRONG_DELAY_MS = 800;

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Tries before the code is even looked at: ten in a quarter of an hour from one sender, a hundred
 * a day from everyone (guessing from many addresses at once). Only the developer needs it, once.
 */
const rules = (sender: string) => [
  { key: `dev-unlock:${sender}`, max: 10, windowMs: 15 * MINUTE_MS },
  { key: 'dev-unlock:all', max: 100, windowMs: DAY_MS },
];

/**
 * Checks the developer code (DEVELOPER_CODE, server only: it never reaches the browser).
 * Answers `{ ok }`; without the variable set nothing unlocks. 429 past the limit.
 */
export async function POST(request: Request): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const expected = process.env.DEVELOPER_CODE ?? '';
  if (!expected) return Response.json({ ok: false }, { headers: { 'Cache-Control': 'no-store' } });
  const limit = await spend(dbFromEnv(), rules(senderKey(request)), new Date().getTime());
  if (!limit.ok) return tooMany(limit);
  let code = '';
  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code === 'string') code = body.code.slice(0, 200);
  } catch {
    // An empty or broken body is a wrong code.
  }
  const ok = !!expected && timingSafeEqual(digest(code), digest(expected));
  if (!ok) await new Promise((resolve) => setTimeout(resolve, WRONG_DELAY_MS));
  return Response.json({ ok }, { headers: { 'Cache-Control': 'no-store' } });
}
