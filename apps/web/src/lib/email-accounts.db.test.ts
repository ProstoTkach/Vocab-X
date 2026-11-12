import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { users } from './db/schema';
import { removeTestUsers, testDb, testEmail } from './db/testing';
import { hashed, spendQuery } from './rate-limit';
import type { Caller } from './sessions';

const mail = vi.hoisted(() => ({ sent: [] as { to: string; link: string }[] }));
vi.mock('./email', () => ({
  siteUrl: () => 'http://localhost:3000',
  sendEmail: async (to: string, _render: unknown, link: string) => {
    mail.sent.push({ to, link });
  },
  EmailNotSent: class extends Error {},
}));

const {
  changePassword,
  checkLogin: checkLoginFrom,
  confirmEmail,
  confirmEmailChange,
  provesRegistration,
  register,
  registrationProof,
  rememberGoogleUser,
  requestEmailChange,
  requestReset,
  resendConfirmation,
  resetPassword,
  normalizeEmail,
  signInMethods,
} = await import('./email-accounts');

const db = testDb();
const SECRET = 'secret';
const MINUTE = 61_000;
const locale = 'uk';
let now = new Date('2026-11-12T10:00:00Z').getTime();

beforeAll(() => removeTestUsers(db));
afterAll(() => removeTestUsers(db));
/** Where the tries come from: a sender of each test's own, so their counts never meet. */
const newSender = () => `db-test-${randomUUID()}`;
let sender = newSender();
beforeEach(() => {
  mail.sent.length = 0;
  sender = newSender();
  // Every test starts past the wait between letters of the one before.
  now += 10 * MINUTE;
});
const checkLogin = (email: string, password: string, at = now, from = sender) =>
  checkLoginFrom(db, email, password, at, from);

/** The token of the last letter to this address. */
function lastToken(email: string): string {
  const letter = mail.sent.findLast((l) => l.to === email);
  if (!letter) throw new Error(`no letter to ${email}`);
  return /[?&#](?:token|reset)=([^&]+)/.exec(letter.link)![1]!;
}

const letters = (email: string) => mail.sent.filter((l) => l.to === email).length;
const row = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0]!;
/** Ten wrong passwords at once from this sender: the address is closed to it. */
const lock = (email: string, from = sender) =>
  Promise.all(Array.from({ length: 10 }, () => checkLogin(email, 'wrong-pass', now, from)));
const signsIn = async (email: string, password: string, from = sender) =>
  (await checkLogin(email, password, now, from)).ok;

/** An account whose address is confirmed, with the password `old-pass`. */
async function confirmed(name: string) {
  const email = testEmail(name);
  await signUp(email, 'old-pass');
  await confirmEmail(db, lastToken(email), now);
  now += MINUTE;
  return email;
}

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
    expect(await checkLogin(email, 'password-1')).toEqual({
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

  test('only the reset letter’s link sets a password, not the confirmation’s', async () => {
    const email = testEmail('reset-confirm-link');
    await signUp(email, 'old-pass');
    const confirmation = lastToken(email);
    expect(await confirmEmail(db, confirmation, now)).not.toBeNull();
    expect(
      await resetPassword(db, { token: confirmation, password: 'x-pass-123' }, now),
    ).toBeNull();
    expect(await signsIn(email, 'old-pass')).toBe(true);
    // Nor does a reset link confirm through the confirmation's route.
    now += MINUTE;
    await requestReset(db, { email, locale }, now);
    expect(await confirmEmail(db, lastToken(email), now)).toBeNull();
    expect(await reset(email, 'new-pass')).not.toBeNull();
  });

  test('lifts a lock', async () => {
    const email = await confirmed('reset-locked');
    await lock(email);
    expect(await signsIn(email, 'old-pass')).toBe(false);
    await requestReset(db, { email, locale }, now);
    await reset(email, 'new-pass');
    expect(await signsIn(email, 'new-pass')).toBe(true);
  });
});

describe('signing in says nothing about which addresses exist', () => {
  const invalid = { ok: false, code: 'invalid' };
  const limited = { ok: false, code: 'limited' };

  test('an unknown address and a wrong password answer alike', async () => {
    const email = await confirmed('login');
    expect(await checkLogin(testEmail('nobody'), 'old-pass')).toEqual(invalid);
    expect(await checkLogin(email, 'wrong-pass')).toEqual(invalid);
    expect(await signsIn(email, 'old-pass')).toBe(true);
  });

  test('ten wrong passwords close an address to that sender only, known or not', async () => {
    const email = await confirmed('lock');
    const unknown = testEmail('nobody');
    await Promise.all([lock(email), lock(unknown)]);
    // Not even the right password gets in, and an unknown address is closed just the same.
    expect(await checkLogin(email, 'old-pass')).toEqual(limited);
    expect(await checkLogin(unknown, 'old-pass')).toEqual(limited);
    // The owner, from elsewhere, is not kept out; their way in opens it again for everyone.
    expect(await signsIn(email, 'old-pass', newSender())).toBe(true);
    expect(await signsIn(email, 'old-pass')).toBe(true);
    // A quarter of an hour later the unknown one is open again too.
    expect(await checkLogin(unknown, 'old-pass', now + 16 * 60_000)).toEqual(invalid);
  });

  test('a hundred wrong passwords from everywhere close an address for all', async () => {
    const email = await confirmed('everywhere');
    const key = `login-wrong:${hashed(normalizeEmail(email))}`;
    await spendQuery(db, [{ key, max: 100, windowMs: 3_600_000, cost: 100 }], now);
    expect(await checkLogin(email, 'old-pass')).toEqual(limited);
    expect(await checkLogin(email, 'old-pass', now, newSender())).toEqual(limited);
    expect(await signsIn(email, 'old-pass', newSender())).toBe(false);
  });

  test('thirty tries from one sender close every address to it', async () => {
    const email = await confirmed('tries');
    await spendQuery(db, [{ key: `login:${sender}`, max: 30, windowMs: 900_000, cost: 30 }], now);
    expect(await checkLogin(email, 'old-pass')).toEqual(limited);
    expect(await signsIn(email, 'old-pass', newSender())).toBe(true);
  });
});

describe('changes while signed in', () => {
  /** A session of this account that signed in at `at`. */
  const me = (id: string, at = now): Caller => ({ id, email: null, authAt: at });
  /** The token and the address of the last address-change letter to `email`. */
  const changeLink = (email: string) => {
    const link = mail.sent.findLast((l) => l.to === email)!.link;
    const params = new URLSearchParams(link.split('#')[1]);
    return { token: params.get('email')!, email: params.get('to')! };
  };

  test('a new password needs the current one; old reset links die', async () => {
    const email = await confirmed('change-pass');
    const { id } = await row(email);
    expect(await signInMethods(db, me(id))).toEqual({ password: true, google: false });
    await requestReset(db, { email, locale }, now);
    const resetToken = lastToken(email);
    const input = (current: string) => ({ current, password: 'new-pass-1' });
    expect(await changePassword(db, me(id), input('wrong-pass'), now)).toBe('wrong');
    expect(await changePassword(db, me(id), input('old-pass'), now)).toBe('ok');
    expect(await signsIn(email, 'new-pass-1')).toBe(true);
    expect(await signsIn(email, 'old-pass')).toBe(false);
    expect(await resetPassword(db, { token: resetToken, password: 'x-pass-123' }, now)).toBeNull();
  });

  test('ten tries in a quarter of an hour, then limited even with the right password', async () => {
    const email = await confirmed('change-limit');
    const { id } = await row(email);
    const input = (current: string) => ({ current, password: 'new-pass-1' });
    await Promise.all(
      Array.from({ length: 10 }, () => changePassword(db, me(id), input('wrong-pass'), now)),
    );
    expect(await changePassword(db, me(id), input('old-pass'), now)).toBe('limited');
  });

  test('an account with Google only has no password to change', async () => {
    const email = testEmail('change-google');
    const id = await rememberGoogleUser(db, `sub-${randomUUID()}`, email);
    expect(await signInMethods(db, me(id))).toEqual({ password: false, google: true });
    expect(await changePassword(db, me(id), { current: 'x', password: 'new-pass-1' }, now)).toBe(
      'none',
    );
    const ask = { email: testEmail('elsewhere'), password: '', locale };
    expect(await requestEmailChange(db, me(id), ask, now)).toBe('google');
  });

  test('a new address counts only through the link sent to it', async () => {
    const email = await confirmed('change-mail');
    const { id } = await row(email);
    const next = testEmail('change-mail-new');
    const ask = (password: string, to = next) => ({ email: to, password, locale: 'en' });
    expect(await requestEmailChange(db, me(id), ask('wrong-pass'), now)).toBe('wrong');
    expect(await requestEmailChange(db, me(id), ask('old-pass', email.toUpperCase()), now)).toBe(
      'same',
    );
    expect(await requestEmailChange(db, me(id), ask('old-pass'), now)).toBe('sent');
    expect(mail.sent.at(-1)?.link).toMatch(/^http:\/\/localhost:3000\/en\/profile#email=/);
    const link = changeLink(next);
    expect((await row(email)).email).toBe(email);
    // The link is bound to its address: another one does not go through.
    const other = testEmail('change-mail-other');
    expect(await confirmEmailChange(db, { ...link, email: other }, now)).toBeNull();
    expect(await confirmEmailChange(db, link, now + 25 * 3_600_000)).toBeNull();
    expect(await confirmEmailChange(db, link, now)).toEqual({ id, email: next });
    expect(await confirmEmailChange(db, link, now)).toBeNull();
    expect(await signsIn(next, 'old-pass')).toBe(true);
    // Nor is a reset link made from it.
    expect(await resetPassword(db, { token: link.token, password: 'x-pass-123' }, now)).toBeNull();
  });

  test('an address another account has gets no letter, and the answer is the same', async () => {
    const email = await confirmed('change-taken');
    const taken = await confirmed('change-taken-other');
    const { id } = await row(email);
    const before = letters(taken);
    expect(
      await requestEmailChange(db, me(id), { email: taken, password: 'old-pass', locale }, now),
    ).toBe('sent');
    expect(letters(taken)).toBe(before);
  });

  test('an address taken while the letter waited: the link says so', async () => {
    const email = await confirmed('change-race');
    const { id } = await row(email);
    const next = testEmail('change-race-new');
    await requestEmailChange(db, me(id), { email: next, password: 'old-pass', locale }, now);
    const link = changeLink(next);
    await rememberGoogleUser(db, `sub-${randomUUID()}`, next);
    expect(await confirmEmailChange(db, link, now)).toBe('taken');
  });

  test('a new password ends the sessions signed in before it, not the one made with it', async () => {
    const email = await confirmed('change-ends');
    const { id } = await row(email);
    const before = me(id, now - MINUTE);
    expect(
      await changePassword(db, me(id), { current: 'old-pass', password: 'new-pass-1' }, now),
    ).toBe('ok');
    expect(await signInMethods(db, before)).toBeNull();
    const ask = { email: testEmail('change-ends-new'), password: 'new-pass-1', locale };
    expect(await requestEmailChange(db, before, ask, now)).toBe('gone');
    // The browser that changed it is signed in again as of that moment, and new sign-ins count.
    expect(await signInMethods(db, me(id))).toEqual({ password: true, google: false });
    expect(await signInMethods(db, me(id, now + MINUTE))).not.toBeNull();
  });

  test('a new password by letter ends the sessions signed in before it', async () => {
    const email = await confirmed('reset-ends');
    const { id } = await row(email);
    const before = me(id, now - MINUTE);
    expect(await signInMethods(db, before)).not.toBeNull();
    await requestReset(db, { email, locale }, now);
    await reset(email, 'new-pass');
    expect(await signInMethods(db, before)).toBeNull();
    expect(await signInMethods(db, me(id))).not.toBeNull();
  });
});
