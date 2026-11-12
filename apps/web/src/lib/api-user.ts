import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/** Who is asking, from the signed cookie alone (no database). Null: not signed in. */
export async function requestUserId(request: NextRequest): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const token = await getToken({ req: request, secret });
  return token?.sub ?? null;
}

export const NO_STORE = { 'Cache-Control': 'no-store' };
export const fail = (status: number) => new Response(null, { status, headers: NO_STORE });

/**
 * A change asked for by a page of another site, which the browser would send with the learner's
 * cookie. The cookie's SameSite=Lax keeps it out of most of them already; this is the second
 * guard, for every route that changes something (next-auth checks its own). A request without
 * Origin does not come from a page, so it carries no learner's cookie either.
 */
export function crossSite(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true;
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  try {
    return new URL(origin).host !== request.headers.get('host');
  } catch {
    // "null" and anything else that is not an address.
    return true;
  }
}

export type Body = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

/**
 * The JSON body of a request, read no further than `maxBytes` (a body that says it is bigger, or
 * proves to be, is cut off at once: 413) so a huge one never fills the function's memory.
 * 400: empty or not JSON.
 */
export async function readJson(request: Request, maxBytes: number): Promise<Body> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return { ok: false, status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}
