import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { pushEndpoint, sendPush, vapidFromEnv, vapidToken } from './push';

const NOW = Date.UTC(2026, 10, 3, 16, 0);

function keys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, 'base64url'),
    Buffer.from(jwk.y!, 'base64url'),
  ]);
  return {
    env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: point.toString('base64url'), VAPID_PRIVATE_KEY: jwk.d },
    jwk,
  };
}

describe('push', () => {
  test('only the browsers’ push services are accepted as addresses', () => {
    expect(pushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(
      'https://fcm.googleapis.com/fcm/send/abc',
    );
    expect(pushEndpoint('https://web.push.apple.com/QGx')).not.toBeNull();
    expect(pushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).not.toBeNull();
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://evil.example/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'not a url',
      42,
    ])
      expect(pushEndpoint(bad)).toBeNull();
  });

  test('without keys there is no push; with them, a token the public key verifies', () => {
    expect(vapidFromEnv({})).toBeNull();
    const { env, jwk } = keys();
    const v = vapidFromEnv({ ...env, NEXTAUTH_URL: 'https://vocabx-sigma.vercel.app/' })!;
    expect(vapidFromEnv({ ...env, VAPID_SUBJECT: 'mailto:a@b.c' })!.subject).toBe('mailto:a@b.c');
    const token = vapidToken(v, 'https://fcm.googleapis.com/fcm/send/abc', NOW);
    const [header, claims, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: NOW / 1000 + 12 * 3600,
      sub: 'https://vocabx-sigma.vercel.app',
    });
    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! },
      format: 'jwk',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true);
  });

  test('an empty push with the key; an ended subscription is told apart from a failure', async () => {
    const v = vapidFromEnv(keys().env)!;
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
    const reply = (status: number) =>
      vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status })));
    const ok = reply(201);
    expect(await sendPush(v, endpoint, NOW, ok)).toBe('sent');
    const init = ok.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${v.publicKey}$`),
    );
    expect(await sendPush(v, endpoint, NOW, reply(410))).toBe('gone');
    expect(await sendPush(v, endpoint, NOW, reply(404))).toBe('gone');
    expect(await sendPush(v, endpoint, NOW, reply(500))).toBe('failed');
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new Error('offline')));
    expect(await sendPush(v, endpoint, NOW, offline)).toBe('failed');
  });
});
