import type { NextRequest } from 'next/server';
import { crossSite, fail, NO_STORE, readJson, requestUserId } from '@/lib/api-user';
import { dbFromEnv, inTransaction } from '@/lib/db/client';
import { HOUR_MS, MINUTE_MS, hashed, spend, tooMany } from '@/lib/rate-limit';
import { exchange, parseSyncRequest } from '@/lib/sync-server';

/**
 * The biggest request: 1000 rows in each of the four lists (the most one sends), the words with all
 * their examples and translations being the heaviest. The platform's own limit is 4.5 MB.
 */
const BODY_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Requests per account: 300 in ten minutes is far above what a device does (one every ten minutes
 * and after each session; a long history goes up 1000 rows at a time, 150 requests for 150 000
 * answers), and 1000 an hour stops a script that loops at a gentler pace. Checked before the transaction opens, so
 * a flood costs one short statement each, not a connection.
 */
const rules = (userId: string) => [
  { key: `sync:${hashed(userId)}`, max: 300, windowMs: 10 * MINUTE_MS },
  { key: `sync-hour:${hashed(userId)}`, max: 1000, windowMs: HOUR_MS },
];

/**
 * Exchanges changes with a signed-in device (see lib/sync-server.ts). 401: not signed in, or the
 * account is gone; 409: this browser's data belongs to another account; 400: not a sync request;
 * 413: too big, or the account already holds all the rows it may keep; 429: too many requests;
 * 503: no database here.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const url = process.env.DATABASE_URL;
  if (!url) return fail(503);
  const userId = await requestUserId(request);
  if (!userId) return fail(401);
  const limit = await spend(dbFromEnv(), rules(userId), new Date().getTime());
  if (!limit.ok) return tooMany(limit);

  const read = await readJson(request, BODY_MAX_BYTES);
  if (!read.ok) return fail(read.status);
  const body = parseSyncRequest(read.value);
  if (!body) return fail(400);
  if (body.owner !== userId) return fail(409);
  try {
    const result = await inTransaction(url, (tx) => exchange(tx, userId, body));
    if (!result) return fail(401);
    if ('quota' in result) return fail(413);
    return Response.json(result, { headers: NO_STORE });
  } catch (e) {
    console.error('sync failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
