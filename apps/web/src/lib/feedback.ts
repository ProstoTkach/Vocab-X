/**
 * Feedback from learners: what the forms collect, how it is checked on the server and how it
 * reads in the developer's spreadsheet or Telegram chat. No name, e-mail or IP is ever part of
 * it — only the answers, the interface language, the player level and the random analytics id
 * of the browser (to put the answers next to the usage statistics).
 */

export type FeedbackKind = 'survey' | 'bug' | 'review' | 'idea';
export type Platform = 'phone' | 'desktop';

/** Survey questions, each rated 1–5, grouped in sections; the order is the order on screen. */
export const SURVEY_SECTIONS = {
  general: ['overall', 'ease', 'recommend'],
  learning: ['usefulness', 'exercises', 'content', 'motivation'],
  tech: ['speed', 'display', 'audio'],
} as const;
export type SurveySection = keyof typeof SURVEY_SECTIONS;
export type SurveyQuestion = (typeof SURVEY_SECTIONS)[SurveySection][number];
export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = Object.values(SURVEY_SECTIONS).flat();

/** "What do you like most" and "what to improve first": up to CHOICE_MAX of each. */
export const LIKE_OPTIONS = [
  'cards',
  'exercises',
  'character',
  'streak',
  'library',
  'wordPicker',
  'audio',
  'design',
] as const;
export const IMPROVE_OPTIONS = [
  'speed',
  'moreWords',
  'translations',
  'exercises',
  'explanations',
  'character',
  'design',
  'audio',
] as const;
export type LikeOption = (typeof LIKE_OPTIONS)[number];
export type ImproveOption = (typeof IMPROVE_OPTIONS)[number];
export const CHOICE_MAX = 3;

/** Context of the answers: where and how often the learner studies (both optional). */
export const DEVICES = ['phone', 'desktop', 'both'] as const;
export const FREQUENCIES = ['daily', 'weekly', 'rarely', 'first'] as const;
export type Device = (typeof DEVICES)[number];
export type Frequency = (typeof FREQUENCIES)[number];
/** "How would you feel if you could no longer use VocabX?" (the product-market fit question). */
export const DISAPPOINTMENTS = ['very', 'somewhat', 'not', 'stopped'] as const;
export type Disappointment = (typeof DISAPPOINTMENTS)[number];

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
      likes: LikeOption[];
      improve: ImproveOption[];
      device?: Device;
      frequency?: Frequency;
      disappointment?: Disappointment;
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
  /** The random analytics id of this browser ('' when unknown). */
  anonId: string;
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
const oneOf =
  <T extends string>(list: readonly T[]) =>
  (v: unknown): v is T =>
    list.includes(v as T);

/** Distinct options from `list`, at most CHOICE_MAX; null for anything else. Missing = []. */
function choices<T extends string>(v: unknown, list: readonly T[]): T[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > CHOICE_MAX || !v.every(oneOf(list))) return null;
  return [...new Set(v)];
}

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
  const likes = choices(f.likes, LIKE_OPTIONS);
  const improve = choices(f.improve, IMPROVE_OPTIONS);
  if (!likes || !improve) return null;
  if (f.device !== undefined && !oneOf(DEVICES)(f.device)) return null;
  if (f.frequency !== undefined && !oneOf(FREQUENCIES)(f.frequency)) return null;
  if (f.disappointment !== undefined && !oneOf(DISAPPOINTMENTS)(f.disappointment)) return null;
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
    likes,
    improve,
    ...(f.device ? { device: f.device } : {}),
    ...(f.frequency ? { frequency: f.frequency } : {}),
    ...(f.disappointment ? { disappointment: f.disappointment } : {}),
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
  const anonId =
    typeof body.anonId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.anonId) ? body.anonId : '';
  return { feedback, locale, level, anonId };
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
const SECTION_LABELS: Record<SurveySection, string> = {
  general: '🌟 Загальне враження',
  learning: '📚 Навчання',
  tech: '⚙️ Технічна частина',
};
const QUESTION_LABELS: Record<SurveyQuestion, string> = {
  overall: 'Загалом',
  ease: 'Зручність',
  recommend: 'Порадив(-ла) б',
  usefulness: 'Користь для запамʼятовування',
  exercises: 'Вправи',
  content: 'Слова, переклади, приклади',
  motivation: 'Мотивація',
  speed: 'Швидкість і плавність',
  display: 'Відображення на екрані',
  audio: 'Озвучення',
};
const LIKE_LABELS: Record<LikeOption, string> = {
  cards: 'картки зі свайпами',
  exercises: 'різні вправи',
  character: 'персонаж і гардероб',
  streak: 'серія і щоденна ціль',
  library: 'бібліотека наборів',
  wordPicker: 'вибір слів стопкою',
  audio: 'озвучення',
  design: 'дизайн і теми',
};
const IMPROVE_LABELS: Record<ImproveOption, string> = {
  speed: 'швидкість роботи',
  moreWords: 'більше слів і наборів',
  translations: 'точність перекладів',
  exercises: 'більше видів вправ',
  explanations: 'зрозуміліші підказки',
  character: 'персонаж і нагороди',
  design: 'дизайн',
  audio: 'озвучення',
};
const DEVICE_LABELS: Record<Device, string> = {
  phone: '📱 телефон',
  desktop: '🖥 компʼютер',
  both: '📱+🖥 обидва',
};
const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'щодня',
  weekly: 'кілька разів на тиждень',
  rarely: 'рідко',
  first: 'вперше',
};
const PLATFORM_LABELS: Record<Platform, string> = { phone: '📱 телефон', desktop: '🖥 компʼютер' };
const DISAPPOINTMENT_LABELS: Record<Disappointment, string> = {
  very: 'дуже засмутився б',
  somewhat: 'трохи засмутився б',
  not: 'не засмутився б',
  stopped: 'вже не користується',
};

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(RATING_MAX - n);
const quote = (s: string) => `<blockquote>${escapeHtml(s)}</blockquote>`;
const average = (qs: readonly SurveyQuestion[], answers: Record<SurveyQuestion, SurveyAnswer>) =>
  (qs.reduce((s, q) => s + answers[q].rating, 0) / qs.length).toFixed(2);

/** Telegram refuses messages over 4096 characters of text (counted without the markup). */
export const MESSAGE_MAX = 4000;

/** Length of a message as Telegram counts it: tags removed, entities as one character. */
export const visibleLength = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt);/g, '_').length;

/**
 * The feedback as Telegram HTML (parse_mode=HTML), in one or more messages. It is built from
 * blocks that are valid HTML on their own, so a long survey is split between blocks only.
 */
export function formatFeedback({ feedback: f, locale, level }: FeedbackPayload): string[] {
  const blocks = [`<b>${TITLES[f.kind]}</b> · VocabX`];
  switch (f.kind) {
    case 'survey': {
      for (const [section, qs] of Object.entries(SURVEY_SECTIONS) as [
        SurveySection,
        readonly SurveyQuestion[],
      ][]) {
        const lines = [`\n<b>${SECTION_LABELS[section]}</b> · ${average(qs, f.answers)}`];
        for (const q of qs) {
          const a = f.answers[q];
          lines.push(`${QUESTION_LABELS[q]}: ${stars(a.rating)} <b>${a.rating}</b>`);
          if (a.note) lines.push(quote(a.note));
        }
        blocks.push(lines.join('\n'));
      }
      blocks.push(`\nСередня за все: <b>${average(SURVEY_QUESTIONS, f.answers)}</b>`);
      const extra: string[] = [];
      if (f.likes.length)
        extra.push(`👍 Подобається: ${f.likes.map((x) => LIKE_LABELS[x]).join(', ')}`);
      if (f.improve.length)
        extra.push(`🛠 Покращити: ${f.improve.map((x) => IMPROVE_LABELS[x]).join(', ')}`);
      if (f.device) extra.push(`Пристрій: ${DEVICE_LABELS[f.device]}`);
      if (f.frequency) extra.push(`Займається: ${FREQUENCY_LABELS[f.frequency]}`);
      if (f.disappointment) extra.push(`Без VocabX: ${DISAPPOINTMENT_LABELS[f.disappointment]}`);
      if (extra.length) blocks.push('\n' + extra.join('\n'));
      if (f.comment) blocks.push(`\n<b>Коментар:</b>\n${quote(f.comment)}`);
      if (f.bug)
        blocks.push(`\n<b>Баг</b> (${PLATFORM_LABELS[f.bug.platform]}):\n${quote(f.bug.text)}`);
      break;
    }
    case 'bug':
      blocks.push(`Пристрій: ${PLATFORM_LABELS[f.platform]}\n${quote(f.text)}`);
      break;
    case 'review':
    case 'idea':
      blocks.push(quote(f.text));
      break;
  }
  blocks.push(`\n<i>мова: ${escapeHtml(locale)} · рівень: ${level ?? '—'}</i>`);

  const messages: string[] = [];
  let current = '';
  for (const b of blocks) {
    if (current && visibleLength(current) + 1 + visibleLength(b) > MESSAGE_MAX) {
      messages.push(current);
      current = b.replace(/^\n/, '');
    } else current = current ? `${current}\n${b}` : b;
  }
  messages.push(current);
  return messages;
}

/**
 * The four-choice test is new: after this many answers in it, the learner is asked once what
 * they think (in the session, between two cards).
 */
export const QUIZ_INVITE_AFTER = 15;
export const QUIZ_INVITE_TIP = 'feedback-invite-quiz';

// ---------------------------------------------------------------------------------------------
// The spreadsheet row: one row per sent form, the columns below in this order. Read by the
// developer only, so it is not translated.

/** Labels without the leading emoji, for plain spreadsheet cells. */
const plain = (label: string) => label.replace(/^[^\p{L}\p{N}]+/u, '');

/** A cell: text, number, TRUE/FALSE, or a date-time (Unix ms, shown in Kyiv time). */
export type SheetCell = string | number | boolean | { date: number };

/** Columns of the feedback sheets: a Ukrainian name and the technical one, in this order. */
export const FEEDBACK_FIELDS: readonly { key: string; label: string }[] = [
  { key: 'date', label: 'Дата (Київ)' },
  { key: 'kind', label: 'Тип' },
  { key: 'ui_lang', label: 'Мова інтерфейсу' },
  { key: 'level', label: 'Рівень гравця' },
  ...SURVEY_QUESTIONS.flatMap((q) => [
    { key: q, label: QUESTION_LABELS[q] },
    { key: `${q}_note`, label: `${QUESTION_LABELS[q]}: що не так` },
  ]),
  ...(Object.keys(SURVEY_SECTIONS) as SurveySection[]).map((sec) => ({
    key: `${sec}_avg`,
    label: `${plain(SECTION_LABELS[sec])}: середня`,
  })),
  { key: 'all_avg', label: 'Середня за все' },
  { key: 'likes', label: 'Подобається' },
  { key: 'improve', label: 'Покращити' },
  { key: 'device', label: 'Пристрій' },
  { key: 'frequency', label: 'Як часто займається' },
  { key: 'comment', label: 'Коментар' },
  { key: 'bug_platform', label: 'Баг: пристрій' },
  { key: 'bug_text', label: 'Баг: опис' },
  { key: 'text', label: 'Відгук або ідея' },
  // Added later: only ever at the end.
  { key: 'disappointment', label: 'Якби не міг більше користуватися' },
  // The former A/B test's variant: always empty now, kept so the columns after it stay put.
  { key: 'variant', label: 'Варіант' },
  { key: 'anon_id', label: 'Анонімний ID' },
];

/** Header row: "Назва (key)". */
export const FEEDBACK_COLUMNS: readonly string[] = FEEDBACK_FIELDS.map(
  (f) => `${f.label} (${f.key})`,
);
/** The date-time column, for its cell format. */
export const FEEDBACK_DATE_COLUMNS: readonly number[] = [0];

/** The feedback as one spreadsheet row, matching FEEDBACK_COLUMNS (empty cells as ''). */
export function feedbackRow(
  { feedback: f, locale, level, anonId }: FeedbackPayload,
  at: Date,
): SheetCell[] {
  const survey = f.kind === 'survey' ? f : null;
  const bug = f.kind === 'bug' ? f : (survey?.bug ?? null);
  return [
    { date: at.getTime() },
    plain(TITLES[f.kind]),
    locale,
    level ?? '',
    ...SURVEY_QUESTIONS.flatMap((q) =>
      survey ? [survey.answers[q].rating, survey.answers[q].note ?? ''] : ['', ''],
    ),
    ...(Object.values(SURVEY_SECTIONS) as readonly (readonly SurveyQuestion[])[]).map((qs) =>
      survey ? Number(average(qs, survey.answers)) : '',
    ),
    survey ? Number(average(SURVEY_QUESTIONS, survey.answers)) : '',
    survey ? survey.likes.map((x) => LIKE_LABELS[x]).join(', ') : '',
    survey ? survey.improve.map((x) => IMPROVE_LABELS[x]).join(', ') : '',
    survey?.device ? plain(DEVICE_LABELS[survey.device]) : '',
    survey?.frequency ? FREQUENCY_LABELS[survey.frequency] : '',
    survey?.comment ?? '',
    bug ? plain(PLATFORM_LABELS[bug.platform]) : '',
    bug?.text ?? '',
    f.kind === 'review' || f.kind === 'idea' ? f.text : '',
    survey?.disappointment ? DISAPPOINTMENT_LABELS[survey.disappointment] : '',
    '',
    anonId,
  ];
}
