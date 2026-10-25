import { describe, expect, test } from 'vitest';
import {
  CHOICE_MAX,
  FEEDBACK_COLUMNS,
  FEEDBACK_FIELDS,
  feedbackRow,
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

/** A cell of a feedback row by its technical column name. */
const cellOf = (row: unknown[], key: string) =>
  row[FEEDBACK_FIELDS.findIndex((f) => f.key === key)];

describe('feedbackRow', () => {
  const at = new Date('2026-07-01T10:30:00Z');
  test('a survey fills its columns, in order, one cell per column', () => {
    const payload = parsePayload({
      feedback: survey({
        likes: ['cards'],
        device: 'phone',
        comment: '=1+1',
        disappointment: 'very',
      }),
      locale: 'uk',
      level: 3,
      variant: 'g1q',
      anonId: '6f1c2a9e-0000-4000-8000-000000000001',
    })!;
    const row = feedbackRow(payload, at);
    expect(row).toHaveLength(FEEDBACK_COLUMNS.length);
    const cell = (key: string) => cellOf(row, key);
    expect(cell('kind')).toBe('Опитування');
    expect(cell('date')).toEqual({ date: at.getTime() });
    expect(cell('level')).toBe(3);
    expect(cell('overall')).toBe(4);
    expect(cell('overall_note')).toBe('мало слів');
    expect(cell('likes')).toBe('картки зі свайпами');
    expect(cell('device')).toBe('телефон');
    // Stored as text, never as a formula (the sheet is written RAW).
    expect(cell('comment')).toBe('=1+1');
    expect(typeof cell('all_avg')).toBe('number');
    expect(cell('disappointment')).toBe('дуже засмутився б');
    expect(cell('variant')).toBe('g1q');
    expect(cell('anon_id')).toBe('6f1c2a9e-0000-4000-8000-000000000001');
    // Headers name both the Ukrainian label and the technical key.
    expect(FEEDBACK_COLUMNS[0]).toBe('Дата (Київ) (date)');
  });

  test('a bug or an idea leaves the survey columns empty', () => {
    const bug = feedbackRow(
      parsePayload({
        feedback: { kind: 'bug', platform: 'desktop', text: 'Падає' },
        locale: 'en',
        level: null,
        variant: 'nope',
      })!,
      at,
    );
    expect(cellOf(bug, 'bug_text')).toBe('Падає');
    expect(cellOf(bug, 'overall')).toBe('');
    expect(cellOf(bug, 'level')).toBe('');
    // A variant that is not one of the four is left out.
    expect(cellOf(bug, 'variant')).toBe('');
    const idea = feedbackRow(
      parsePayload({ feedback: { kind: 'idea', text: 'Темна тема' }, locale: 'uk', level: 1 })!,
      at,
    );
    expect(cellOf(idea, 'text')).toBe('Темна тема');
  });

  test('the disappointment answer comes from a fixed list', () => {
    expect(
      parsePayload({ feedback: survey({ disappointment: 'maybe' }), locale: 'uk' }),
    ).toBeNull();
  });
});
