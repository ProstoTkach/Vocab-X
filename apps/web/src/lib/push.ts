// Web Push from the server (no library): a push without a payload, signed with the app's VAPID
// key. A push carries nothing: the phone's service worker writes the reminder itself from what
// the app left on the device, so no words or progress ever leave it. The push service keeps
// a push for a phone that is offline and delivers it once the phone is back online.
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

/** Push services of the browsers: subscriptions pointing anywhere else are refused. */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

/** A subscription's endpoint, if it is one of the browsers' push services (https only). */
export function pushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname;
    return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? url.href : null;
  } catch {
    return null;
  }
}

export interface VapidConfig {
  /** The public key, base64url of the uncompressed P-256 point (also given to the browser). */
  publicKey: string;
  key: KeyObject;
  /** Who sends: a mailto: or https: address the push services can reach. */
  subject: string;
}

const b64url = (b: Buffer) => b.toString('base64url');

/** The VAPID keys from the environment, or null when push is not set up. */
export function vapidFromEnv(env: Record<string, string | undefined> = process.env) {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const d = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !d) return null;
  const point = Buffer.from(publicKey, 'base64url');
  if (point.length !== 65 || point[0] !== 4) return null;
  const key = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d,
      x: b64url(point.subarray(1, 33)),
      y: b64url(point.subarray(33)),
    },
    format: 'jwk',
  });
  return {
    publicKey,
    key,
    subject: env.VAPID_SUBJECT || 'https://vocabx-sigma.vercel.app',
  } satisfies VapidConfig;
}

/** The signed token for one push service (ES256 JWT, valid for 12 hours). */
export function vapidToken(v: VapidConfig, endpoint: string, now: number): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: v.subject,
      }),
    ),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: v.key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${claims}.${b64url(signature)}`;
}

/** How long a push service keeps a push for a phone that is offline, seconds. */
const TTL_S = 20 * 3600;

export type PushResult = 'sent' | 'gone' | 'failed';

/** One push, no payload. "gone": the subscription has ended (unsubscribed, app removed). */
export async function sendPush(
  v: VapidConfig,
  endpoint: string,
  now: number,
  doFetch: typeof fetch = fetch,
): Promise<PushResult> {
  try {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${vapidToken(v, endpoint, now)}, k=${v.publicKey}`,
        TTL: String(TTL_S),
        Urgency: 'normal',
        'Content-Length': '0',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
