import { describe, expect, test, vi } from 'vitest';

vi.mock('./email', () => ({ siteUrl: () => '', sendEmail: async () => {} }));
vi.mock('./email-templates', () => ({ emailLocale: () => 'uk' }));

const { provesRegistration, registrationProof } = await import('./email-accounts');

describe('the proof that a browser asked for the letter', () => {
  const proof = registrationProof('Olena@Example.com', 'secret');

  test('holds for the same address, whatever the case', () => {
    expect(provesRegistration('olena@example.com', proof, 'secret')).toBe(true);
  });

  test('does not hold for another address, another secret or no cookie', () => {
    expect(provesRegistration('other@example.com', proof, 'secret')).toBe(false);
    expect(provesRegistration('olena@example.com', proof, 'other')).toBe(false);
    expect(provesRegistration('olena@example.com', undefined, 'secret')).toBe(false);
    expect(provesRegistration('olena@example.com', 'short', 'secret')).toBe(false);
  });
});
