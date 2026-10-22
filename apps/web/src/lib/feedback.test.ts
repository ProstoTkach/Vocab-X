import { describe, expect, test } from 'vitest';
import { formatFeedback, NOTE_MAX, parsePayload, TEXT_MAX } from './feedback';

const answers = {
  overall: { rating: 4, note: 'мало слів' },
  ease: { rating: 5, note: 'ignored under a 5' },
  usefulness: { rating: 3 },
  motivation: { rating: 5 },
};

describe('parsePayload', () => {
  test('accepts a survey and drops notes under a 5', () => {
    const p = parsePayload({ feedback: { kind: 'survey', answers }, locale: 'uk', level: 6 });
    expect(p?.feedback).toEqual({
      kind: 'survey',
      answers: {
        overall: { rating: 4, note: 'мало слів' },
        ease: { rating: 5 },
        usefulness: { rating: 3 },
        motivation: { rating: 5 },
      },
    });
    expect(p?.level).toBe(6);
  });

  test('a survey needs every rating, within 1–5', () => {
    const { motivation: _, ...three } = answers;
    expect(parsePayload({ feedback: { kind: 'survey', answers: three } })).toBeNull();
    expect(
      parsePayload({ feedback: { kind: 'survey', answers: { ...answers, ease: { rating: 6 } } } }),
    ).toBeNull();
  });

  test('rejects text over the limits', () => {
    const long = 'a'.repeat(NOTE_MAX + 1);
    expect(
      parsePayload({
        feedback: { kind: 'survey', answers: { ...answers, overall: { rating: 2, note: long } } },
      }),
    ).toBeNull();
    expect(parsePayload({ feedback: { kind: 'idea', text: 'a'.repeat(TEXT_MAX + 1) } })).toBeNull();
  });

  test('a bug needs a description and a platform', () => {
    expect(parsePayload({ feedback: { kind: 'bug', platform: 'phone', text: '  ' } })).toBeNull();
    expect(parsePayload({ feedback: { kind: 'bug', platform: 'tv', text: 'x' } })).toBeNull();
    expect(
      parsePayload({ feedback: { kind: 'bug', platform: 'desktop', text: ' broken ' } })?.feedback,
    ).toEqual({ kind: 'bug', platform: 'desktop', text: 'broken' });
  });

  test('unknown kinds and odd locales', () => {
    expect(parsePayload({ feedback: { kind: 'spam', text: 'x' } })).toBeNull();
    expect(parsePayload({ feedback: { kind: 'idea', text: 'x' }, locale: '<b>' })?.locale).toBe(
      '?',
    );
  });
});

test('formatFeedback escapes HTML and shows the average', () => {
  const p = parsePayload({
    feedback: { kind: 'survey', answers, comment: '<script>' },
    locale: 'en',
    level: 7,
  })!;
  const msg = formatFeedback(p);
  expect(msg).toContain('&lt;script&gt;');
  expect(msg).not.toContain('<script>');
  expect(msg).toContain('4.25');
  expect(msg).toContain('рівень: 7');
});
