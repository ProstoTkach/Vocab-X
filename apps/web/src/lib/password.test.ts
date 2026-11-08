import { describe, expect, test } from 'vitest';
import { renderAlreadyEmail, renderVerifyEmail } from './email-templates';
import { hashPassword, newToken, tokenHash, verifyPassword } from './password';

describe('passwords', () => {
  test('the right one fits, a wrong one does not, and the password itself is not stored', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).not.toContain('correct');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('correct hors', stored)).toBe(false);
  });

  test('the same password hashes differently each time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  test('something that is not a stored password fits nothing', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('links', () => {
  test('the database gets a hash, not the token', () => {
    const { token, hash } = newToken();
    expect(hash).not.toBe(token);
    expect(tokenHash(token)).toBe(hash);
  });
});

describe('emails', () => {
  const link = 'https://example.com/api/account/verify?token=a&lang=uk';

  test('the letter has a clickable link in its language, the wolf and a plain-text copy', () => {
    const uk = renderVerifyEmail('uk', link, 'cid:wolf');
    expect(uk.subject).toContain('пошту');
    expect(uk.html).toContain('href="https://example.com/api/account/verify?token=a&amp;lang=uk"');
    expect(uk.html).toContain('src="cid:wolf"');
    expect(uk.text).toContain(link);
    expect(renderVerifyEmail('en', link, null).subject).toContain('email');
  });

  test('a letter without the picture has no broken image', () => {
    expect(renderVerifyEmail('en', link, null).html).not.toContain('<img');
  });

  test('a link cannot break out of the letter', () => {
    const { html } = renderVerifyEmail('en', 'https://x/?a="><script>', null);
    expect(html).not.toContain('<script>');
  });

  test('someone already registered is told to sign in', () => {
    expect(renderAlreadyEmail('en', 'https://example.com/en/profile', null).text).toContain(
      'https://example.com/en/profile',
    );
  });
});
