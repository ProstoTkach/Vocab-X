import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { users } from './db/schema';
import { removeTestUsers, testDb, testEmail } from './db/testing';

const mail = vi.hoisted(() => ({ sent: [] as { to: string; link: string }[] }));
vi.mock('./email', () => ({
  siteUrl: () => 'http://localhost:3000',
  sendEmail: async (to: string, _render: unknown, link: string) => {
    mail.sent.push({ to, link });
  },
  EmailNotSent: class extends Error {},
}));

const {
  checkLogin,
  confirmEmail,
  provesRegistration,
  register,
  registrationProof,
  rememberGoogleUser,
  requestReset,
  resendConfirmation,
  resetPassword,
} = await import('./email-accounts');

const db = testDb();
const SECRET = 'secret';
const MINUTE = 61_000;
const locale = 'uk';
let now = new Date('2026-11-12T10:00:00Z').getTime();

beforeAll(() => removeTestUsers(db));
afterAll(() => removeTestUsers(db));
beforeEach(() => {
  mail.sent.length = 0;
  // Every test starts past the wait between letters of the one before.
  now += 10 * MINUTE;
});

/** The token of the last letter to this address. */
function lastToken(email: string): string {
  const letter = mail.sent.findLast((l) => l.to === email);
  if (!letter) throw new Error(`no letter to ${email}`);
  return /[?&#](?:token|reset)=([^&]+)/.exec(letter.link)![1]!;
}

const letters = (email: string) => mail.sent.filter((l) => l.to === email).length;
const row = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0]!;
const lock = (email: string) =>
  db
    .update(users)
    .set({ lockedUntil: new Date(now + 600_000) })
    .where(eq(users.email, email));
const signsIn = async (email: string, password: string) =>
  (await checkLogin(db, email, password, now)).ok;

/** Registers as one browser would: the key its proof cookie is made from comes back. */
const signUp = (email: string, password: string) => register(db, { email, password, locale }, now);
const proofOf = (email: string, key: string) => registrationProof(email, key, SECRET);
const reset = (email: string, password: string, at = now) =>
  resetPassword(db, { token: lastToken(email), password }, at);

describe('registration and its letter', () => {
  test('the link confirms the address and the password chosen with it', async () => {
    const email = testEmail('new');
    const key = await signUp(email, 'password-1');
    expect(letters(email)).toBe(1);
    // Before the link: only the owner of the password learns that it waits.
    expect(await checkLogin(db, email, 'password-1', now)).toEqual({
      ok: false,
      code: 'unverified',
    });
    expect((await row(email)).passwordHash).toBeNull();

    const user = await confirmEmail(db, lastToken(email), now);
    expect(user?.email).toBe(email);
    expect(provesRegistration(email, user!.key, proofOf(email, key), SECRET)).toBe(true);
    expect(await signsIn(email, 'password-1')).toBe(true);
  });

  test('the link still works when opened again (a mail scanner was first)', async () => {
    const email = testEmail('scanner');
    const key = await signUp(email, 'password-1');
    const token = lastToken(email);
    expect(await confirmEmail(db, token, now)).not.toBeNull();
    const again = await confirmEmail(db, token, now + 1000);
    expect(provesRegistration(email, again!.key, proofOf(email, key), SECRET)).toBe(true);
    expect(await signsIn(email, 'password-1')).toBe(true);
  });

  test('a link stops working after a day', async () => {
    const email = testEmail('old');
    await signUp(email, 'password-1');
    expect(await confirmEmail(db, lastToken(email), now + 25 * 3_600_000)).toBeNull();
  });

  test('an address already confirmed gets the other letter, and nothing changes', async () => {
    const email = testEmail('taken');
    await signUp(email, 'owner-pass');
    await confirmEmail(db, lastToken(email), now);
    const before = await row(email);
    now += MINUTE;
    const key = await signUp(email, 'attacker-pass');
    expect(mail.sent.at(-1)?.link).toBe('http://localhost:3000/uk/profile');
    const after = await row(email);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.verifyTokenHash).toBe(before.verifyTokenHash);
    expect(provesRegistration(email, after.pendingPasswordHash, proofOf(email, key), SECRET)).toBe(
      false,
    );
    expect(await signsIn(email, 'attacker-pass')).toBe(false);
  });
});

// AUDIT A1: two registrations of an address nobody has confirmed yet, in both orders.
describe('two registrations of one address', () => {
  test('someone else first, the owner second: only the owner’s link and password count', async () => {
    const email = testEmail('first-other');
    await signUp(email, 'attacker-pass');
    const attackerLink = lastToken(email);
    now += MINUTE;
    await signUp(email, 'owner-pass');
    const ownerLink = lastToken(email);

    expect(await confirmEmail(db, attackerLink, now)).toBeNull();
    expect(await confirmEmail(db, ownerLink, now)).not.toBeNull();
    expect(await signsIn(email, 'owner-pass')).toBe(true);
    expect(await signsIn(email, 'attacker-pass')).toBe(false);
  });

  test('the owner first, someone else second: the other link does not sign the owner in', async () => {
    const email = testEmail('first-owner');
    const ownerProof = proofOf(email, await signUp(email, 'owner-pass'));
    const ownerLink = lastToken(email);
    now += MINUTE;
    await signUp(email, 'attacker-pass');
    const attackerLink = lastToken(email);

    // The owner's older letter no longer confirms anything.
    expect(await confirmEmail(db, ownerLink, now)).toBeNull();
    // Opened in the owner's browser, the newer one does not put that browser into the account.
    const user = await confirmEmail(db, attackerLink, now);
    expect(provesRegistration(email, user!.key, ownerProof, SECRET)).toBe(false);
    // A new password by letter takes the account back.
    now += MINUTE;
    await requestReset(db, { email, locale }, now);
    expect(await reset(email, 'owner-new')).not.toBeNull();
    expect(await signsIn(email, 'attacker-pass')).toBe(false);
    expect(await signsIn(email, 'owner-new')).toBe(true);
  });

  test('a registration never changes the password silently', async () => {
    const email = testEmail('silent');
    await signUp(email, 'owner-pass');
    const pending = (await row(email)).pendingPasswordHash;
    now += MINUTE;
    await signUp(email, 'attacker-pass');
    const after = await row(email);
    expect(after.passwordHash).toBeNull();
    expect(after.pendingPasswordHash).not.toBe(pending);
  });

  test('within a minute: no letter, the earlier link dies, the newer browser asks again', async () => {
    const email = testEmail('gap');
    const firstKey = await signUp(email, 'first-pass');
    const firstLink = lastToken(email);
    now += 10_000;
    const secondKey = await signUp(email, 'second-pass');
    expect(letters(email)).toBe(1);
    expect(await confirmEmail(db, firstLink, now)).toBeNull();

    now += MINUTE;
    const resend = (proof: string) =>
      resendConfirmation(
        db,
        { email, locale, proves: (key) => provesRegistration(email, key, proof, SECRET) },
        now,
      );
    // The first browser cannot have the second one's password sent for.
    await resend(proofOf(email, firstKey));
    expect(letters(email)).toBe(1);
    await resend(proofOf(email, secondKey));
    expect(letters(email)).toBe(2);
    expect(await confirmEmail(db, lastToken(email), now)).not.toBeNull();
    expect(await signsIn(email, 'second-pass')).toBe(true);
  });

  test('Google takes an address nobody confirmed: the waiting password and its link go', async () => {
    const email = testEmail('google');
    await signUp(email, 'attacker-pass');
    const link = lastToken(email);
    const id = await rememberGoogleUser(db, `sub-${email}`, email);
    expect(id).toBe((await row(email)).id);
    expect(await confirmEmail(db, link, now)).toBeNull();
    const after = await row(email);
    expect(after.passwordHash).toBeNull();
    expect(after.pendingPasswordHash).toBeNull();
    expect(await signsIn(email, 'attacker-pass')).toBe(false);
  });
});

// AUDIT A8.
describe('a new password by letter', () => {
  async function confirmed(name: string) {
    const email = testEmail(name);
    await signUp(email, 'old-pass');
    await confirmEmail(db, lastToken(email), now);
    now += MINUTE;
    return email;
  }

  test('sets the password once, and the old one stops working', async () => {
    const email = await confirmed('reset');
    await requestReset(db, { email, locale: 'en' }, now);
    expect(mail.sent.at(-1)?.link).toMatch(/^http:\/\/localhost:3000\/en\/profile#reset=/);
    const token = lastToken(email);
    expect(await resetPassword(db, { token, password: 'new-pass' }, now)).toMatchObject({ email });
    expect(await resetPassword(db, { token, password: 'other-pass' }, now)).toBeNull();
    expect(await signsIn(email, 'old-pass')).toBe(false);
    expect(await signsIn(email, 'new-pass')).toBe(true);
  });

  test('the link lives an hour', async () => {
    const email = await confirmed('reset-old');
    await requestReset(db, { email, locale }, now);
    expect(await reset(email, 'new-pass', now + 61 * 60_000)).toBeNull();
  });

  test('a newer letter kills the older link; one a minute at most', async () => {
    const email = await confirmed('reset-twice');
    await requestReset(db, { email, locale }, now);
    const first = lastToken(email);
    const sent = letters(email);
    await requestReset(db, { email, locale }, now + 1000);
    expect(letters(email)).toBe(sent);
    now += MINUTE;
    await requestReset(db, { email, locale }, now);
    expect(letters(email)).toBe(sent + 1);
    expect(await resetPassword(db, { token: first, password: 'new-pass' }, now)).toBeNull();
    expect(await reset(email, 'new-pass')).not.toBeNull();
  });

  test('nothing is sent for an unknown address', async () => {
    const email = testEmail('nobody');
    await requestReset(db, { email, locale }, now);
    expect(letters(email)).toBe(0);
  });

  test('confirms an address still waiting, and drops the registration that waited', async () => {
    const email = testEmail('reset-waiting');
    await signUp(email, 'attacker-pass');
    const registrationLink = lastToken(email);
    now += MINUTE;
    await requestReset(db, { email, locale }, now);
    expect(await confirmEmail(db, registrationLink, now)).toBeNull();
    expect(await reset(email, 'owner-pass')).not.toBeNull();
    expect(await signsIn(email, 'owner-pass')).toBe(true);
    expect(await signsIn(email, 'attacker-pass')).toBe(false);
  });

  test('lifts a lock', async () => {
    const email = await confirmed('reset-locked');
    await lock(email);
    await requestReset(db, { email, locale }, now);
    await reset(email, 'new-pass');
    expect(await signsIn(email, 'new-pass')).toBe(true);
  });
});

describe('signing in says nothing about which addresses exist', () => {
  test('an unknown address, a wrong password and a locked account answer alike', async () => {
    const email = testEmail('login');
    await signUp(email, 'correct-pass');
    await confirmEmail(db, lastToken(email), now);
    const invalid = { ok: false, code: 'invalid' };
    expect(await checkLogin(db, testEmail('nobody'), 'correct-pass', now)).toEqual(invalid);
    expect(await checkLogin(db, email, 'wrong-pass', now)).toEqual(invalid);
    expect((await row(email)).loginFailures).toBe(1);
    await lock(email);
    // Not even the right password learns about the lock.
    expect(await checkLogin(db, email, 'correct-pass', now)).toEqual(invalid);
    expect((await checkLogin(db, email, 'correct-pass', now + 601_000)).ok).toBe(true);
    expect((await row(email)).loginFailures).toBe(0);
  });

  test('ten wrong passwords lock the account', async () => {
    const email = testEmail('lock');
    await signUp(email, 'correct-pass');
    await confirmEmail(db, lastToken(email), now);
    await db.update(users).set({ loginFailures: 9 }).where(eq(users.email, email));
    await checkLogin(db, email, 'wrong-pass', now);
    expect((await row(email)).lockedUntil?.getTime()).toBe(now + 15 * 60_000);
  });
});
