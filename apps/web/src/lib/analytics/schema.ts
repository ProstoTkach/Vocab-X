// What the analytics collects, shared by the app (sending) and /api/track (checking, writing to
// the spreadsheet). Anonymous by design: a random id per browser, no name, e-mail, IP, user agent
// or studied words — only screens, counts, times and choices.
import type { SheetCell } from '../feedback';

/** The A/B test: gamification on (g1) or off (g0) × flash cards (c) or the four-choice test (q). */
export const VARIANTS = ['g1c', 'g1q', 'g0c', 'g0q'] as const;
export type Variant = (typeof VARIANTS)[number];
export type AssignedBy = 'link' | 'random';
export const isVariant = (v: unknown): v is Variant =>
  typeof v === 'string' && (VARIANTS as readonly string[]).includes(v);

/** The starting settings of a variant (the learner may change both later). */
export function variantSettings(v: Variant): { gamification: 'max' | 'off'; quizMode: boolean } {
  return { gamification: v.startsWith('g1') ? 'max' : 'off', quizMode: v.endsWith('q') };
}

/** Event types with what each means, in Ukrainian (the spreadsheet's "Словник" sheet). */
export const EVENTS = {
  first_visit: 'Перший захід на цьому пристрої: звідки прийшов (домен реферера, utm-мітки).',
  variant_assigned: 'Варіант призначено випадково (захід без ?v=).',
  variant_conflict: 'У посиланні інший варіант, ніж уже закріплений; залишено закріплений.',
  consent_shown: 'Показано вікно згоди на аналітику.',
  consent_accepted: 'Користувач погодився надсилати статистику (у вікні або в налаштуваннях).',
  session_start: 'Початок сесії: номер дня з першого візиту, пауза з минулого візиту.',
  session_end: 'Кінець сесії: закрито вкладку або 30 хв без дій.',
  onboarding_step_shown: 'Показано крок налаштування.',
  onboarding_step_done: 'Крок налаштування пройдено; скільки часу на ньому.',
  onboarding_back: 'Натиснуто «Назад» у налаштуванні.',
  onboarding_start_choice: 'Вибір «Тест рівня» чи «Почати з нуля».',
  onboarding_goal: 'Обраний темп (ціль XP на день).',
  onboarding_langs: 'Скільки мов обрано для вивчення.',
  onboarding_restore: 'Відновлення з резервної копії на першому кроці.',
  onboarding_done: 'Налаштування завершено, відкрито головну.',
  onboarding_abandoned: 'Налаштування не завершено; останній досягнутий крок.',
  level_test_done: 'Тест рівня завершено: рівень, скільки слів, тривалість.',
  level_test_quit: 'Тест рівня покинуто до кінця.',
  screen_view: 'Відкрито розділ застосунку.',
  coming_soon_view: 'Відкрито розділ, що ще в розробці (Рейтинг, Профіль).',
  not_found: 'Відкрито неіснуючу сторінку.',
  review_start: 'Почато сесію повторення.',
  review_end: 'Сесію повторення залишено або стопку завершено.',
  review_empty: 'Відкрито повторення, але стопка порожня.',
  review_more: 'Натиснуто «Ще картки».',
  review_show_now: 'Натиснуто «Показати зараз».',
  review_intro_closed: 'Закрито вікно з поясненням оцінок.',
  answer: 'Відповідь на картку або в тесті з 4 варіантів.',
  undo: 'Скасовано останню оцінку.',
  four_grades_on: 'Увімкнено чотири оцінки.',
  four_grades_tip: 'Порада про точніші інтервали: показано / увімкнено / закрито.',
  typing_toggle: 'Перемкнуто «Вводити слово замість перевертання».',
  typed_answer: 'Перевірено введене слово.',
  quiz_skip: 'Натиснуто «Не знаю» в тесті.',
  quiz_hint: 'Підказка в тесті: літери слова або показ почутого слова.',
  quiz_next: 'Перехід до наступного питання тесту: сам чи кнопкою.',
  speak_click: 'Натиснуто кнопку озвучення.',
  voice_missing: 'На пристрої немає голосу для мови слова.',
  voice_available: 'Для яких мов є голос озвучення.',
  xp_decay_reached: 'Досягнуто 150 повторень за день: XP далі зменшуються.',
  goal_reached: 'Виконано добову ціль.',
  celebration_shown: 'Показано святкування з конфеті.',
  word_add_open: 'Відкрито вікно додавання слова.',
  word_suggest: 'Натиснуто «Знайти»: скільки перекладів і прикладів знайдено.',
  word_saved: 'Слово збережено.',
  word_add_cancel: 'Вікно додавання слова закрито без збереження.',
  word_edit: 'Слово змінено.',
  word_delete: 'Слово видалено (або прибрано з колоди).',
  word_reset: '«Показувати частіше»: прогрес слова скинуто.',
  word_learned: '«Я вивчив!»: слово перенесено до вивчених.',
  words_search: 'Пошук у списку слів.',
  words_sort: 'Змінено сортування списку слів.',
  backup_reminder: 'Нагадування про резервну копію: сховано / експорт.',
  import_parse: 'Розібрано список слів для імпорту.',
  import_save: 'Збережено слова з імпорту списком.',
  deck_create: 'Створено колоду.',
  deck_rename: 'Перейменовано колоду.',
  deck_duplicate: 'Дубльовано колоду.',
  deck_archive: 'Колоду відправлено в архів або повернуто.',
  deck_delete: 'Видалено колоду.',
  deck_copy_text: 'Картки колоди скопійовано текстом.',
  library_open_deck: 'Відкрито колоду в бібліотеці.',
  library_add_all: 'Колоду з бібліотеки додано повністю.',
  library_pick: 'Відбір слів стопкою: скільки додано й пропущено.',
  streak: 'Серія на початку сесії; чи перервалася з минулого візиту.',
  return_after_pause: 'Повернення після паузи 2+ дні.',
  streak_risk: 'Вікно «серія під загрозою»: показано / «Повторити зараз» / закрито.',
  character_tap: 'Натиснуто на персонажа.',
  wardrobe_open: 'Відкрито гардероб.',
  wardrobe_change: 'Змінено образ персонажа.',
  level_up: 'Новий рівень гравця.',
  levels_dialog_open: 'Відкрито список рівнів.',
  theme_change: 'Змінено тему оформлення.',
  gamification_enable_click: 'Натиснуто «Увімкнути гейміфікацію» на головній.',
  game_mode_change: 'Змінено ігровий режим: з якого на який, через скільки днів і сесій.',
  study_mode_change: 'Змінено режим вивчення (картки ↔ 4 варіанти).',
  setting_change: 'Змінено інше налаштування навчання.',
  ui_lang_change: 'Змінено мову інтерфейсу.',
  data_export: 'Експорт JSON.',
  data_import: 'Імпорт JSON.',
  data_reset: '«Скинути демо-дані».',
  storage_error: 'Сховище браузера переповнене.',
  feedback_open: 'Відкрито вікно відгуку; звідки.',
  feedback_kind: 'Обрано тип відгуку.',
  feedback_sent: 'Відгук надіслано.',
  feedback_abandoned: 'Вікно відгуку закрито без надсилання.',
  js_error: 'Помилка JavaScript (повідомлення й місце, без даних користувача).',
  api_error: 'Помилка запиту до сервера застосунку.',
  perf: 'Час завантаження сторінки.',
} as const;
export type EventType = keyof typeof EVENTS;
export const EVENT_TYPES = Object.keys(EVENTS) as EventType[];

export const DEVICES = ['mobile', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

export type ParamValue = string | number | boolean | null;
export type Params = Record<string, ParamValue>;

/** Fields every event carries. */
export interface CommonFields {
  anon_id: string;
  session_id: string;
  variant: Variant;
  assigned_by: AssignedBy;
  internal: boolean;
  /** Where the app runs (vocabx-sigma.vercel.app, localhost…). */
  host: string;
  /** Unix ms. */
  ts: number;
  ui_lang: string;
  device: Device;
  days_since_first_visit: number;
  game_mode: string;
  study_mode: 'cards' | 'quiz';
}

export interface AnalyticsEvent extends CommonFields {
  type: EventType;
  params: Params;
}

/** One row of the "Сесії" sheet. */
export interface SessionSummary {
  session_id: string;
  anon_id: string;
  variant: Variant;
  assigned_by: AssignedBy;
  internal: boolean;
  host: string;
  device: Device;
  ui_lang: string;
  started_at: number;
  ended_at: number;
  end_reason: 'pagehide' | 'timeout' | 'recovered';
  days_since_first_visit: number;
  session_n: number;
  active_time_s: number;
  duration_s: number;
  screens_n: number;
  answers_n: number;
  correct_n: number;
  scheduled_n: number;
  scheduled_good_n: number;
  finished_stack: boolean;
  goal_reached: boolean;
  xp: number;
  settings_changes_n: number;
  game_mode_start: string;
  game_mode_end: string;
  study_mode_start: string;
  study_mode_end: string;
  return_after_pause: boolean;
  pause_days: number;
}

export interface TrackBody {
  events: AnalyticsEvent[];
  sessions: SessionSummary[];
}

// ---------------------------------------------------------------------------------------------
// Checking what comes to /api/track. Anything odd is dropped item by item.

export const BODY_MAX_BYTES = 64 * 1024;
export const EVENTS_MAX = 200;
export const SESSIONS_MAX = 10;
const PARAMS_MAX = 30;
const TEXT_MAX = 300;
const DAY_MS = 86_400_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ID = /^[A-Za-z0-9-]{8,64}$/;
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const isText = (v: unknown, max = 100): v is string => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isTime = (v: unknown, now: number): v is number =>
  isNum(v) && v > now - 60 * DAY_MS && v < now + DAY_MS;

function parseCommon(o: Obj, now: number): CommonFields | null {
  const {
    anon_id,
    session_id,
    variant,
    assigned_by,
    internal,
    host,
    ts,
    ui_lang,
    device,
    days_since_first_visit,
    game_mode,
    study_mode,
  } = o;
  if (!isId(anon_id) || !isId(session_id) || !isVariant(variant)) return null;
  if (assigned_by !== 'link' && assigned_by !== 'random') return null;
  if (!isBool(internal) || !isText(host) || !isTime(ts, now) || !isText(ui_lang, 10)) return null;
  if (device !== 'mobile' && device !== 'desktop') return null;
  if (!isNum(days_since_first_visit) || !isText(game_mode, 10)) return null;
  if (study_mode !== 'cards' && study_mode !== 'quiz') return null;
  return {
    anon_id,
    session_id,
    variant,
    assigned_by,
    internal,
    host,
    ts,
    ui_lang,
    device,
    days_since_first_visit,
    game_mode,
    study_mode,
  };
}

function parseParams(v: unknown): Params | null {
  if (v === undefined) return {};
  if (!isObj(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > PARAMS_MAX) return null;
  const out: Params = {};
  for (const [k, x] of entries) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k)) return null;
    if (x === null || isBool(x) || isNum(x)) out[k] = x;
    else if (typeof x === 'string') out[k] = x.slice(0, TEXT_MAX);
    else return null;
  }
  return out;
}

export function parseEvent(v: unknown, now: number): AnalyticsEvent | null {
  if (!isObj(v) || typeof v.type !== 'string' || !(v.type in EVENTS)) return null;
  const common = parseCommon(v, now);
  const params = parseParams(v.params);
  if (!common || !params) return null;
  return { ...common, type: v.type as EventType, params };
}

const SESSION_NUMBERS = [
  'days_since_first_visit',
  'session_n',
  'active_time_s',
  'duration_s',
  'screens_n',
  'answers_n',
  'correct_n',
  'scheduled_n',
  'scheduled_good_n',
  'xp',
  'settings_changes_n',
  'pause_days',
] as const;
const SESSION_FLAGS = ['internal', 'finished_stack', 'goal_reached', 'return_after_pause'] as const;
const SESSION_TEXTS = [
  'host',
  'ui_lang',
  'game_mode_start',
  'game_mode_end',
  'study_mode_start',
  'study_mode_end',
] as const;

export function parseSession(v: unknown, now: number): SessionSummary | null {
  if (!isObj(v)) return null;
  if (!isId(v.session_id) || !isId(v.anon_id) || !isVariant(v.variant)) return null;
  if (v.assigned_by !== 'link' && v.assigned_by !== 'random') return null;
  if (v.device !== 'mobile' && v.device !== 'desktop') return null;
  if (!isTime(v.started_at, now) || !isTime(v.ended_at, now)) return null;
  if (v.end_reason !== 'pagehide' && v.end_reason !== 'timeout' && v.end_reason !== 'recovered')
    return null;
  if (!SESSION_NUMBERS.every((k) => isNum(v[k]) && (v[k] as number) >= 0)) return null;
  if (!SESSION_FLAGS.every((k) => isBool(v[k]))) return null;
  if (!SESSION_TEXTS.every((k) => isText(v[k]))) return null;
  return v as unknown as SessionSummary;
}

/** The body of a /api/track request, or null when nothing in it is usable. */
export function parseTrackBody(body: unknown, now: number): TrackBody | null {
  if (!isObj(body)) return null;
  const rawEvents = Array.isArray(body.events) ? body.events.slice(0, EVENTS_MAX) : [];
  const rawSessions = Array.isArray(body.sessions) ? body.sessions.slice(0, SESSIONS_MAX) : [];
  const events = rawEvents.flatMap((e) => parseEvent(e, now) ?? []);
  const sessions = rawSessions.flatMap((s) => parseSession(s, now) ?? []);
  if (!events.length && !sessions.length) return null;
  return { events, sessions };
}

/** The browser the request is about (all items of a request come from one). */
export const anonIdOf = (b: TrackBody) => b.events[0]?.anon_id ?? b.sessions[0]?.anon_id ?? '';

// ---------------------------------------------------------------------------------------------
// The spreadsheet. Column order is fixed: new columns are only ever added at the end.

export interface Column {
  key: string;
  /** Ukrainian name; the header reads "Назва (key)". */
  label: string;
  /** What it means and in which units (the "Словник" sheet). */
  about: string;
  /** Written as a date-time (Europe/Kyiv). */
  date?: boolean;
}

export const header = (c: Column) => `${c.label} (${c.key})`;

const COMMON_COLUMNS: Column[] = [
  { key: 'anon_id', label: 'Анонімний ID', about: 'Випадковий ID браузера, без звʼязку з людиною.' },
  { key: 'session_id', label: 'ID сесії', about: 'Випадковий ID сесії.' },
  { key: 'variant', label: 'Варіант', about: 'g1c, g1q, g0c, g0q: g1/g0 — гейміфікація увімк./вимк., c/q — картки / 4 варіанти.' },
  { key: 'assigned_by', label: 'Як призначено', about: 'link — з посилання ?v=, random — випадково.' },
  { key: 'internal', label: 'Внутрішній', about: 'TRUE — візит розробника або тестувальника (?internal=1 чи localhost).' },
  { key: 'host', label: 'Сайт', about: 'Адреса, на якій відкрито застосунок.' },
  { key: 'ui_lang', label: 'Мова інтерфейсу', about: 'uk або en.' },
  { key: 'device', label: 'Пристрій', about: 'mobile або desktop.' },
  { key: 'days_since_first_visit', label: 'Днів з першого візиту', about: 'Повних днів від першого заходу, 0 — перший день.' },
];

export const EVENT_PARAM_COLUMNS: Column[] = [
  { key: 'screen', label: 'Екран', about: 'Розділ застосунку.' },
  { key: 'from', label: 'Було', about: 'Попереднє значення (екран, режим, налаштування).' },
  { key: 'to', label: 'Стало', about: 'Нове значення.' },
  { key: 'source', label: 'Джерело', about: 'Звідки дія: кнопка, налаштування, порада тощо.' },
  { key: 'step', label: 'Крок', about: 'Крок налаштування.' },
  { key: 'mode', label: 'Режим відповіді', about: 'card — картка, quiz — тест з 4 варіантів.' },
  { key: 'card_level', label: 'Рівень картки', about: 'Картки 1–3, тест 1–4.' },
  { key: 'grade', label: 'Оцінка', about: '1 Забув, 2 Важко, 3 Згадав, 4 Легко.' },
  { key: 'correct', label: 'Правильно', about: 'TRUE — відповідь правильна (оцінка 2–4).' },
  { key: 'response_ms', label: 'Час відповіді, мс', about: 'Від показу картки до відповіді, мілісекунди.' },
  { key: 'duration_s', label: 'Тривалість, с', about: 'Тривалість дії, секунди.' },
  { key: 'count', label: 'Кількість', about: 'Число, головне для події (карток, слів, рядків).' },
];

export const EVENT_COLUMNS: Column[] = [
  { key: 'ts', label: 'Час', about: 'Дата й час події (Київ).', date: true },
  { key: 'type', label: 'Подія', about: 'Тип події; опис — нижче в цьому словнику.' },
  ...COMMON_COLUMNS,
  { key: 'game_mode', label: 'Ігровий режим', about: 'max, medium або off — на момент події.' },
  { key: 'study_mode', label: 'Режим вивчення', about: 'cards або quiz — на момент події.' },
  ...EVENT_PARAM_COLUMNS,
  { key: 'params_json', label: 'Інші параметри', about: 'Решта параметрів події у JSON.' },
];

export const SESSION_COLUMNS: Column[] = [
  { key: 'started_at', label: 'Початок', about: 'Початок сесії (Київ).', date: true },
  { key: 'ended_at', label: 'Кінець', about: 'Кінець сесії (Київ).', date: true },
  ...COMMON_COLUMNS,
  { key: 'end_reason', label: 'Як завершилася', about: 'pagehide — закрито вкладку, timeout — 30 хв без дій, recovered — обірвалася, зібрано при наступному заході.' },
  { key: 'session_n', label: 'Номер сесії', about: 'Котра це сесія на пристрої, з 1.' },
  { key: 'active_time_s', label: 'Активний час, с', about: 'Секунди, коли вкладка видима й була дія за останні 60 с.' },
  { key: 'duration_s', label: 'Тривалість, с', about: 'Від початку до кінця сесії, секунди.' },
  { key: 'screens_n', label: 'Переходів між екранами', about: 'Скільки разів відкрито розділ.' },
  { key: 'answers_n', label: 'Відповідей', about: 'Скільки карток або питань тесту відповідено.' },
  { key: 'correct_n', label: 'Правильних', about: 'Скільки з них правильні (оцінка 2–4).' },
  { key: 'accuracy', label: 'Точність', about: 'Частка правильних, 0–1.' },
  { key: 'scheduled_n', label: 'За розкладом (1+ день)', about: 'Відповіді на картки з інтервалом від 1 дня.' },
  { key: 'scheduled_good_n', label: 'З них «Згадав»/«Легко»', about: 'Відповіді за розкладом з оцінкою 3 або 4.' },
  { key: 'scheduled_good_share', label: 'Частка «Згадав»/«Легко» за розкладом', about: 'scheduled_good_n / scheduled_n, 0–1; порожньо, якщо не було.' },
  { key: 'finished_stack', label: 'Дійшов до кінця стопки', about: 'TRUE — у сесії стопку повторено до кінця.' },
  { key: 'goal_reached', label: 'Ціль виконано', about: 'TRUE — у сесії виконано добову ціль.' },
  { key: 'xp', label: 'XP', about: 'Скільки XP отримано за сесію.' },
  { key: 'settings_changes_n', label: 'Змін налаштувань', about: 'Скільки разів змінено ігровий режим, режим вивчення чи налаштування навчання.' },
  { key: 'game_mode_start', label: 'Ігровий режим на початку', about: 'max, medium або off.' },
  { key: 'game_mode_end', label: 'Ігровий режим наприкінці', about: 'max, medium або off.' },
  { key: 'study_mode_start', label: 'Режим вивчення на початку', about: 'cards або quiz.' },
  { key: 'study_mode_end', label: 'Режим вивчення наприкінці', about: 'cards або quiz.' },
  { key: 'return_after_pause', label: 'Повернення після паузи', about: 'TRUE — перед сесією була пауза 2+ дні.' },
  { key: 'pause_days', label: 'Пауза, днів', about: 'Днів від попередньої сесії.' },
];

const PARAM_KEYS = new Set(EVENT_PARAM_COLUMNS.map((c) => c.key));

const cell = (v: ParamValue | undefined): SheetCell => (v === null || v === undefined ? '' : v);

export function eventRow(e: AnalyticsEvent): SheetCell[] {
  const rest = Object.fromEntries(Object.entries(e.params).filter(([k]) => !PARAM_KEYS.has(k)));
  const fields: Record<string, SheetCell> = {
    ...e,
    ts: { date: e.ts },
    params_json: Object.keys(rest).length ? JSON.stringify(rest) : '',
  } as unknown as Record<string, SheetCell>;
  return EVENT_COLUMNS.map((c) =>
    PARAM_KEYS.has(c.key) ? cell(e.params[c.key]) : (fields[c.key] ?? ''),
  );
}

export function sessionRow(s: SessionSummary): SheetCell[] {
  const fields: Record<string, SheetCell> = {
    ...s,
    started_at: { date: s.started_at },
    ended_at: { date: s.ended_at },
    accuracy: s.answers_n ? Math.round((s.correct_n / s.answers_n) * 1000) / 1000 : '',
    scheduled_good_share: s.scheduled_n
      ? Math.round((s.scheduled_good_n / s.scheduled_n) * 1000) / 1000
      : '',
  } as unknown as Record<string, SheetCell>;
  return SESSION_COLUMNS.map((c) => fields[c.key] ?? '');
}

export const DICTIONARY_COLUMNS = ['Лист', 'Що', 'Технічна назва', 'Назва', 'Опис і одиниці'];

/** The "Словник" sheet: every column of every sheet and every event type, described. */
export function dictionaryRows(feedbackColumns: readonly string[]): SheetCell[][] {
  const columns = (sheet: string, cols: Column[]) =>
    cols.map((c) => [sheet, 'колонка', c.key, c.label, c.about]);
  return [
    ...columns('Події', EVENT_COLUMNS),
    ...Object.entries(EVENTS).map(([k, about]) => ['Події', 'подія', k, k, about]),
    ...columns('Сесії', SESSION_COLUMNS),
    ...feedbackColumns.map((c) => ['Відгуки', 'колонка', '', c, 'Відповідь із форми відгуку.']),
  ];
}
