import { describe, expect, test, vi } from 'vitest';

vi.mock('./email', () => ({ siteUrl: () => '', sendEmail: async () => {} }));
vi.mock('./email-templates', () => ({ emailLocale: () => 'uk' }));

const { provesRegistration, registrationProof } = await import('./email-accounts');

describe('the proof that a browser made the registration', () => {
  const proof = registrationProof('Olena@Example.com', 'key-1', 'secret');

  test('holds for the same address and registration, whatever the case', () => {
    expect(provesRegistration('olena@example.com', 'key-1', proof, 'secret')).toBe(true);
  });

  test('does not hold for another address, registration, secret or no cookie', () => {
    expect(provesRegistration('other@example.com', 'key-1', proof, 'secret')).toBe(false);
    expect(provesRegistration('olena@example.com', 'key-2', proof, 'secret')).toBe(false);
    expect(provesRegistration('olena@example.com', null, proof, 'secret')).toBe(false);
    expect(provesRegistration('olena@example.com', 'key-1', proof, 'other')).toBe(false);
    expect(provesRegistration('olena@example.com', 'key-1', undefined, 'secret')).toBe(false);
    expect(provesRegistration('olena@example.com', 'key-1', 'short', 'secret')).toBe(false);
  });
});
