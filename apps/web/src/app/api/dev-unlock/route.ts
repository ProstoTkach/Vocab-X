import { createHash, timingSafeEqual } from 'node:crypto';

/** A wrong code waits this long: guessing it by trying many is slow. */
const WRONG_DELAY_MS = 800;

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Checks the developer code (DEVELOPER_CODE, server only: it never reaches the browser).
 * Answers `{ ok }`; without the variable set nothing unlocks.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = process.env.DEVELOPER_CODE ?? '';
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
