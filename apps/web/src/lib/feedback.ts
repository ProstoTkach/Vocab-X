/**
 * Feedback from learners: what the forms collect, how it is checked on the server and how it
 * reads in the developer's Telegram chat. Anonymous by design: no name, e-mail, IP or device
 * id is ever part of it — only the answers, the interface language and the player level.
 */

export type FeedbackKind = 'survey' | 'bug' | 'review' | 'idea';
export type Platform = 'phone' | 'desktop';

/** Survey questions, each rated 1–5; the order is the order on screen. */
export const SURVEY_QUESTIONS = ['overall', 'ease', 'usefulness', 'motivation'] as const;
export type SurveyQuestion = (typeof SURVEY_QUESTIONS)[number];

export const RATING_MAX = 5;
/** "What exactly did you not like" under a rating below 5. */
export const NOTE_MAX = 200;
/** Free comment of the survey, a bug report or an idea. */
export const TEXT_MAX = 1000;
/** A short review. */
export const REVIEW_MAX = 500;

export interface SurveyAnswer {
  rating: number;
  note?: string;
}

export type Feedback =
  | {
      kind: 'survey';
      answers: Record<SurveyQuestion, SurveyAnswer>;
      comment?: string;
      bug?: { platform: Platform; text: string };
    }
  | { kind: 'bug'; platform: Platform; text: string }
  | { kind: 'review'; text: string }
  | { kind: 'idea'; text: string };

/** What the app sends to /api/feedback. */
export interface FeedbackPayload {
  feedback: Feedback;
  locale: string;
  /** Player level, for context; null while unknown. */
  level: number | null;
}

const PLATFORMS: readonly Platform[] = ['phone', 'desktop'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trimmed text of at most `max` characters; '' when missing; null when too long or not text. */
function text(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > max ? null : s;
}

const isRating = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= RATING_MAX;
const isPlatform = (v: unknown): v is Platform => PLATFORMS.includes(v as Platform);

function parseSurvey(f: Obj): Feedback | null {
  if (!isObj(f.answers)) return null;
  const answers = {} as Record<SurveyQuestion, SurveyAnswer>;
  for (const q of SURVEY_QUESTIONS) {
    const a = f.answers[q];
    if (!isObj(a) || !isRating(a.rating)) return null;
    const note = text(a.note, NOTE_MAX);
    if (note === null) return null;
    // A note only makes sense under a rating below the top.
    answers[q] = note && a.rating < RATING_MAX ? { rating: a.rating, note } : { rating: a.rating };
  }
  const comment = text(f.comment, TEXT_MAX);
  if (comment === null) return null;
  let bug: { platform: Platform; text: string } | undefined;
  if (f.bug !== undefined) {
    if (!isObj(f.bug) || !isPlatform(f.bug.platform)) return null;
    const bugText = text(f.bug.text, TEXT_MAX);
    if (bugText === null) return null;
    if (bugText) bug = { platform: f.bug.platform, text: bugText };
  }
  return {
    kind: 'survey',
    answers,
    ...(comment ? { comment } : {}),
    ...(bug ? { bug } : {}),
  };
}

function parseFeedback(f: unknown): Feedback | null {
  if (!isObj(f)) return null;
  switch (f.kind) {
    case 'survey':
      return parseSurvey(f);
    case 'bug': {
      const s = text(f.text, TEXT_MAX);
      return s && isPlatform(f.platform) ? { kind: 'bug', platform: f.platform, text: s } : null;
    }
    case 'review': {
      const s = text(f.text, REVIEW_MAX);
      return s ? { kind: 'review', text: s } : null;
    }
    case 'idea': {
      const s = text(f.text, TEXT_MAX);
      return s ? { kind: 'idea', text: s } : null;
    }
    default:
      return null;
  }
}

/** Checks a request body; anything unexpected or over the limits gives null. */
export function parsePayload(body: unknown): FeedbackPayload | null {
  if (!isObj(body)) return null;
  const feedback = parseFeedback(body.feedback);
  if (!feedback) return null;
  const locale =
    typeof body.locale === 'string' && /^[a-z]{2,3}$/.test(body.locale) ? body.locale : '?';
  const level =
    typeof body.level === 'number' && Number.isInteger(body.level) && body.level > 0
      ? body.level
      : null;
  return { feedback, locale, level };
}

export type SendResult = 'ok' | 'rate-limited' | 'failed';

/** Sends feedback to the app's own API, which forwards it to Telegram. */
export async function sendFeedback(payload: FeedbackPayload): Promise<SendResult> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return 'ok';
    return res.status === 429 ? 'rate-limited' : 'failed';
  } catch {
    return 'failed';
  }
}

// ---------------------------------------------------------------------------------------------
// The Telegram message. It is read by the developer only, so it is not translated.

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const TITLES: Record<FeedbackKind, string> = {
  survey: '📋 Опитування',
  bug: '🐞 Баг',
  review: '💬 Відгук',
  idea: '💡 Ідея',
};
const QUESTION_LABELS: Record<SurveyQuestion, string> = {
  overall: 'Загалом',
  ease: 'Зручність',
  usefulness: 'Користь',
  motivation: 'Мотивація',
};
const PLATFORM_LABELS: Record<Platform, string> = { phone: '📱 телефон', desktop: '🖥 компʼютер' };

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(RATING_MAX - n);
const quote = (s: string) => `<blockquote>${escapeHtml(s)}</blockquote>`;

/** The message as Telegram HTML (parse_mode=HTML). */
export function formatFeedback({ feedback: f, locale, level }: FeedbackPayload): string {
  const lines = [`<b>${TITLES[f.kind]}</b> · VocabX`];
  switch (f.kind) {
    case 'survey': {
      for (const q of SURVEY_QUESTIONS) {
        const a = f.answers[q];
        lines.push(`${QUESTION_LABELS[q]}: ${stars(a.rating)} <b>${a.rating}/${RATING_MAX}</b>`);
        if (a.note) lines.push(quote(a.note));
      }
      const avg =
        SURVEY_QUESTIONS.reduce((s, q) => s + f.answers[q].rating, 0) / SURVEY_QUESTIONS.length;
      lines.push(`Середня: <b>${avg.toFixed(2)}</b>`);
      if (f.comment) lines.push('', '<b>Коментар:</b>', quote(f.comment));
      if (f.bug)
        lines.push('', `<b>Баг</b> (${PLATFORM_LABELS[f.bug.platform]}):`, quote(f.bug.text));
      break;
    }
    case 'bug':
      lines.push(`Пристрій: ${PLATFORM_LABELS[f.platform]}`, quote(f.text));
      break;
    case 'review':
    case 'idea':
      lines.push(quote(f.text));
      break;
  }
  lines.push('', `<i>мова: ${escapeHtml(locale)} · рівень: ${level ?? '—'}</i>`);
  return lines.join('\n');
}
