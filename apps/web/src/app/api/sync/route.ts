import type { NextRequest } from 'next/server';
import { fail, NO_STORE, requestUserId } from '@/lib/api-user';
import { inTransaction } from '@/lib/db/client';
import { exchange, parseSyncRequest } from '@/lib/sync-server';

/**
 * Exchanges changes with a signed-in device (see lib/sync-server.ts). 401: not signed in, or the
 * account is gone; 409: this browser's data belongs to another account; 400: not a sync request;
 * 503: no database here.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const url = process.env.DATABASE_URL;
  if (!url) return fail(503);
  const userId = await requestUserId(request);
  if (!userId) return fail(401);

  const body = parseSyncRequest(await request.json().catch(() => null));
  if (!body) return fail(400);
  if (body.owner !== userId) return fail(409);
  try {
    const result = await inTransaction(url, (tx) => exchange(tx, userId, body));
    return result ? Response.json(result, { headers: NO_STORE }) : fail(401);
  } catch (e) {
    console.error('sync failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
