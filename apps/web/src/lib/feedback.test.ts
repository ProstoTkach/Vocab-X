import { describe, expect, test } from 'vitest';
import {
  CHOICE_MAX,
  formatFeedback,
  MESSAGE_MAX,
  NOTE_MAX,
  parsePayload,
  SURVEY_QUESTIONS,
  TEXT_MAX,
  visibleLength,
} from './feedback';

/** Every question rated 5, with overrides. */
const answersWith = (over: Record<string, { rating: number; note?: string }> = {}) =>
  Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q, over[q] ?? { rating: 5 }]));

const survey = (extra: Record<string, unknown> = {}) => ({
  kind: 'survey',
  answers: answersWith({
    overall: { rating: 4, note: 'мало слів' },
    ease: { rating: 5, note: 'ignored under a 5' },
    speed: { rating: 3 },
  }),
  ...extra,
});

describe('parsePayload', () => {
  test('accepts a survey and drops notes under a 5', () => {
    const p = parsePayload({ feedback: survey(), locale: 'uk', level: 6 });
    expect(p?.feedback).toMatchObject({ kind: 'survey', likes: [], improve: [] });
    const answers = (p?.feedback as { answers: Record<string, unknown> }).answers;
    expect(answers.overall).toEqual({ rating: 4, note: 'мало слів' });
    expect(answers.ease).toEqual({ rating: 5 });
    expect(answers.speed).toEqual({ rating: 3 });
    expect(p?.level).toBe(6);
  });

  test('a survey needs every rating, within 1–5', () => {
    const { audio: _, ...missing } = answersWith();
    expect(parsePayload({ feedback: { kind: 'survey', answers: missing } })).toBeNull();
    expect(
      parsePayload({ feedback: { kind: 'survey', answers: answersWith({ ease: { rating: 6 } }) } }),
    ).toBeNull();
  });

  test('likes, improvements and context come from fixed lists', () => {
    const ok = parsePayload({
      feedback: survey({
        likes: ['cards', 'audio'],
        improve: ['speed'],
        device: 'both',
        frequency: 'daily',
      }),
    });
    expect(ok?.feedback).toMatchObject({
      likes: ['cards', 'audio'],
      improve: ['speed'],
      device: 'both',
      frequency: 'daily',
    });
    expect(parsePayload({ feedback: survey({ likes: ['hacking'] }) })).toBeNull();
    expect(
      parsePayload({
        feedback: survey({ improve: Array.from({ length: CHOICE_MAX + 1 }, () => 'speed') }),
      }),
    ).toBeNull();
    expect(parsePayload({ feedback: survey({ device: 'tv' }) })).toBeNull();
    expect(parsePayload({ feedback: survey({ frequency: 'hourly' }) })).toBeNull();
  });

  test('rejects text over the limits', () => {
    const long = 'a'.repeat(NOTE_MAX + 1);
    expect(
      parsePayload({
        feedback: { kind: 'survey', answers: answersWith({ overall: { rating: 2, note: long } }) },
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

describe('formatFeedback', () => {
  test('escapes HTML, shows averages and the chosen options', () => {
    const p = parsePayload({
      feedback: survey({ comment: '<script>', likes: ['character'], improve: ['speed'] }),
      locale: 'en',
      level: 7,
    })!;
    const [msg, ...rest] = formatFeedback(p);
    expect(rest).toEqual([]);
    expect(msg).toContain('&lt;script&gt;');
    expect(msg).not.toContain('<script>');
    expect(msg).toContain('персонаж і гардероб');
    expect(msg).toContain('швидкість роботи');
    // 4 + 3 + eight 5s over ten questions.
    expect(msg).toContain('4.70');
    expect(msg).toContain('рівень: 7');
  });

  test('a long survey is split into messages Telegram accepts, between blocks only', () => {
    const note = 'я'.repeat(NOTE_MAX);
    const p = parsePayload({
      feedback: {
        kind: 'survey',
        answers: Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q, { rating: 1, note }])),
        comment: '<'.repeat(TEXT_MAX),
        bug: { platform: 'phone', text: '&'.repeat(TEXT_MAX) },
      },
    })!;
    const messages = formatFeedback(p);
    expect(messages.length).toBeGreaterThan(1);
    for (const m of messages) {
      expect(visibleLength(m)).toBeLessThanOrEqual(MESSAGE_MAX);
      // Every tag opened in a message is closed in it.
      expect(m.split('<blockquote>').length).toBe(m.split('</blockquote>').length);
    }
  });
});
