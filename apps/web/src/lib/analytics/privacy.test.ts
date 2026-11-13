// Privacy by test: what analytics may collect, and that it never meets the account. The list of
// forbidden fields lives here, apart from the code it guards: adding a column or a parameter
// that looks personal fails these tests until someone argues otherwise in a review.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { KEYS, resolveIdentity, type KeyValue } from './identity';
import {
  EVENT_COLUMNS,
  EVENT_PARAM_COLUMNS,
  EVENT_TYPES,
  EVENTS,
  SESSION_COLUMNS,
  parseTrackBody,
} from './schema';
import { Tracker } from './tracker';

/** Words that make a field personal when they stand as a whole part of its name (a_b_c). */
const FORBIDDEN_PARTS = [
  'email',
  'mail',
  'name',
  'nickname',
  'phone',
  'tel',
  'ip',
  'ua',
  'useragent',
  'agent',
  'word',
  'words',
  'term',
  'translation',
  'example',
  'sentence',
  'text',
  'input',
  'typed',
  'query',
  'password',
  'pass',
  'token',
  'secret',
  'cookie',
  'address',
  'lat',
  'lng',
  'geo',
  'location',
];
/** Whole names that are personal, whatever their parts. */
const FORBIDDEN_KEYS = [
  'user_id',
  'userid',
  'uid',
  'account_id',
  'sub',
  'user_agent',
  'ip_address',
];
/**
 * Parameters whose names hold a forbidden word but whose value is only a yes/no flag (checked by
 * hand: `has_example` is "the card has an example", `had_text` is "something was typed").
 */
const REVIEWED_FLAGS = ['has_example', 'had_text'];
/** Event names that would announce personal data; the names are checked more loosely. */
const FORBIDDEN_EVENT_PARTS = ['email', 'phone', 'ip', 'useragent', 'password', 'translation'];

const parts = (key: string) => key.toLowerCase().split(/[_\-\s]+/);
const personal = (key: string, forbidden = FORBIDDEN_PARTS) =>
  FORBIDDEN_KEYS.includes(key.toLowerCase()) || parts(key).some((p) => forbidden.includes(p));

describe('the forbidden list itself', () => {
  test('catches what it should and lets the anonymous fields through', () => {
    for (const bad of ['email', 'user_id', 'user_agent', 'ip', 'word_text', 'Translation', 'name'])
      expect(personal(bad), bad).toBe(true);
    for (const ok of ['anon_id', 'session_id', 'ui_lang', 'device', 'count', 'grade', 'to'])
      expect(personal(ok), ok).toBe(false);
  });
});

describe('what is collected', () => {
  test('event types: no personal data in the names', () => {
    for (const type of EVENT_TYPES) expect(personal(type, FORBIDDEN_EVENT_PARTS), type).toBe(false);
    expect(EVENT_TYPES).toEqual(Object.keys(EVENTS));
  });

  test('EVENT_COLUMNS, EVENT_PARAM_COLUMNS, SESSION_COLUMNS: no personal fields', () => {
    for (const c of [...EVENT_COLUMNS, ...EVENT_PARAM_COLUMNS, ...SESSION_COLUMNS])
      expect(personal(c.key), c.key).toBe(false);
  });

  test('the account is not a column: no user id anywhere in the sheets', () => {
    const keys = [...EVENT_COLUMNS, ...SESSION_COLUMNS].map((c) => c.key);
    expect(keys.filter((k) => /user|account|auth/.test(k))).toEqual([]);
  });

  test('what the tracker really sends carries no personal field', async () => {
    const storage = memory();
    const identity = resolveIdentity({
      search: new URLSearchParams(),
      hostname: 'vocabx-sigma.vercel.app',
      referrer: 'https://t.me/chat?secret=1',
      pathname: '/uk',
      storage,
      tab: memory(),
      now: Date.UTC(2026, 9, 25),
      uuid: nextUuid,
    });
    const send = vi.fn(async (_body: string, _beacon: boolean) => true);
    const t = new Tracker({
      identity,
      storage,
      now: () => Date.UTC(2026, 9, 25, 10),
      uuid: nextUuid,
      send,
      log: () => {},
    });
    t.start();
    t.track('screen_view', { screen: 'home' });
    t.track('answer', { correct: true, grade: 3, interval_days: 2, xp: 10 });
    t.setConsent(true);
    t.endSession('pagehide');
    await t.flush();
    const bodies = send.mock.calls.map(([b]) => JSON.parse(b) as unknown);
    expect(bodies.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    bodies.forEach(walk);
    expect(keys.has('anon_id')).toBe(true);
    for (const k of keys) expect(personal(k), k).toBe(false);
    // The raw text of a request: no address, e-mail or user agent shape either.
    const text = JSON.stringify(bodies);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/Mozilla\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  test('the server drops a parameter whose name is not a plain key', () => {
    const now = Date.UTC(2026, 9, 25, 10);
    const event = {
      anon_id: 'aaaaaaaa-1',
      session_id: 'bbbbbbbb-1',
      event_id: 'cccccccc-1',
      internal: false,
      host: 'x.app',
      ts: now,
      ui_lang: 'uk',
      device: 'mobile',
      days_since_first_visit: 0,
      game_mode: 'max',
      study_mode: 'mixed',
      type: 'screen_view',
    };
    const bad = { ...event, params: { 'e-mail': 'a@b.c' } };
    expect(parseTrackBody({ events: [bad], sessions: [] }, now)).toBeNull();
  });
});

// ---- every track() call site -------------------------------------------------------------

const SRC = join(import.meta.dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path,
  rel: relative(SRC, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

/** Index of the bracket closing the one at `open`, skipping strings and template texts. */
function closing(text: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === '}' || c === ']') {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  return -1;
}

/** The top-level comma-separated parts of `text`. */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

interface Call {
  file: string;
  types: string[];
  keys: string[];
}

function callsOf(file: { rel: string; text: string }): Call[] {
  const calls: Call[] = [];
  // Comments may mention track(); they are not calls.
  const code = file.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of code.matchAll(/(?<![.\w])track\(/g)) {
    const open = m.index + m[0].length - 1;
    const end = closing(code, open);
    if (end < 0) continue;
    const [type = '', params] = splitTop(code.slice(open + 1, end));
    const types = [...type.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    const keys =
      params?.startsWith('{') && params.endsWith('}')
        ? splitTop(params.slice(1, -1)).flatMap((part) => {
            const key = /^(?:'([^']+)'|([A-Za-z_]\w*))\s*(?::|$)/.exec(part);
            return key ? [(key[1] ?? key[2])!] : [];
          })
        : [];
    calls.push({ file: file.rel, types, keys });
    // A non-literal event name or non-literal params would escape the check: refuse them.
    if (!types.length) calls.push({ file: file.rel, types: ['<not a literal>'], keys: [] });
    if (params && !params.startsWith('{'))
      calls.push({ file: file.rel, types, keys: ['<not an object literal>'] });
  }
  return calls;
}

// The definitions of track() itself are not call sites.
const callSites = files
  .filter((f) => !/^lib\/analytics\/(index|tracker)\.ts$/.test(f.rel))
  .flatMap(callsOf);

describe('every track() call in the app', () => {
  test('the scan finds the calls (not an empty pass)', () => {
    expect(callSites.length).toBeGreaterThan(80);
    expect(callSites.some((c) => c.keys.includes('count'))).toBe(true);
  });

  test('event names are known and parameter names are plain and not personal', () => {
    const problems: string[] = [];
    for (const c of callSites) {
      for (const type of c.types)
        if (!(type in EVENTS)) problems.push(`${c.file}: unknown event ${type}`);
      for (const key of c.keys)
        if ((personal(key) && !REVIEWED_FLAGS.includes(key)) || !/^[a-z][a-z0-9_]{0,39}$/.test(key))
          problems.push(`${c.file}: ${c.types.join('/')} has parameter "${key}"`);
    }
    expect(problems).toEqual([]);
  });
});

// ---- the analytics id and the account never meet -------------------------------------------

/** Routes of the account: signed-in requests. */
const ACCOUNT_ROUTES = /\/api\/(sync|account|league|push|reminders)\b/;
/** Ways to reach the analytics id from the code. */
const ANON_ID_USE = /anonId|anon_id|analyticsIds|getTracker|analytics\/identity|KEYS\.anonId/;
/** Ways to reach the account from the code. */
const ACCOUNT_USE =
  /userId|user_id|next-auth|session-cookie|email-accounts|from '@\/lib\/(auth|sync|league)|getUser|currentUser/;

describe('anon_id and the account', () => {
  const client = (rel: string) => !rel.startsWith('app/api/') && !rel.endsWith('.d.ts');

  test('code that talks to the account never reads the analytics id', () => {
    const bad = files
      .filter((f) => client(f.rel) && !f.rel.startsWith('lib/analytics/'))
      .filter((f) => ACCOUNT_ROUTES.test(f.text) && ANON_ID_USE.test(f.text))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  test('account routes never mention the analytics id', () => {
    const routes = files.filter((f) =>
      /^app\/api\/(sync|account|league|push|reminders)\//.test(f.rel),
    );
    expect(routes.length).toBeGreaterThan(3);
    expect(routes.filter((f) => ANON_ID_USE.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  test('the analytics code and /api/track never reach for the account', () => {
    const analytics = files.filter(
      (f) => f.rel.startsWith('lib/analytics/') || f.rel === 'app/api/track/route.ts',
    );
    expect(analytics.length).toBeGreaterThan(4);
    expect(analytics.filter((f) => ACCOUNT_USE.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  test('the database schema has no analytics id', () => {
    const schema = files.find((f) => f.rel === 'lib/db/schema.ts')!;
    expect(schema.text).not.toMatch(/anon/i);
  });

  test('the only server code that stores an analytics id: the sheets, their copy in the anonymous database, the report', () => {
    const users = files
      .filter((f) => f.rel.startsWith('app/api/') || f.rel.startsWith('lib/'))
      .filter((f) => !f.rel.startsWith('lib/analytics/'))
      .filter((f) => ANON_ID_USE.test(f.text))
      .map((f) => f.rel)
      .sort();
    expect(users).toEqual([
      'app/api/track/route.ts',
      'lib/analytics-report.ts',
      'lib/analytics-store.ts',
      'lib/db/anon-schema.ts',
      'lib/feedback.ts',
    ]);
    // Neither the feedback route nor its library knows who is signed in.
    for (const rel of ['app/api/feedback/route.ts', 'lib/feedback.ts'])
      expect(files.find((f) => f.rel === rel)!.text).not.toMatch(ACCOUNT_USE);
  });
});

// ---- the anonymous-data database (step 3.1) ----------------------------------------------------

/** Server code that may open the anonymous-data database (analytics, feedback, push). */
const ANON_DB_USERS = [
  'app/api/account/route.ts',
  'app/api/cleanup/route.ts',
  'app/api/feedback/route.ts',
  'app/api/push/route.ts',
  'lib/db/anon-client.ts',
  'lib/db/testing.ts',
];

describe('the anonymous-data database', () => {
  const schema = () => files.find((f) => f.rel === 'lib/db/anon-schema.ts')!;

  test('its schema has no user id, e-mail or other personal column', () => {
    const kinds = 'text|boolean|integer|smallint|jsonb|date|timestamp|bigserial';
    const columns = [...schema().text.matchAll(new RegExp(`(?:${kinds})\\('([a-z_]+)'`, 'g'))].map(
      (m) => m[1]!,
    );
    expect(columns.length).toBeGreaterThan(40);
    for (const c of columns) expect(personal(c), c).toBe(false);
    expect(schema().text).not.toMatch(/user_id|userId|email|references\(/i);
  });

  test('the schema of the accounts database still has no analytics id', () => {
    expect(files.find((f) => f.rel === 'lib/db/schema.ts')!.text).not.toMatch(/anon/i);
  });

  test('only analytics, feedback and push code opens it', () => {
    const users = files
      .filter((f) => /anonDbFromEnv|anonDbFromUrl/.test(f.text))
      .map((f) => f.rel)
      .sort();
    expect(users).toEqual(ANON_DB_USERS);
  });

  test('the code that writes to it never reaches for the account', () => {
    const own = [
      'lib/analytics-store.ts',
      'lib/analytics-report.ts',
      'lib/db/anon-schema.ts',
      'lib/db/anon-client.ts',
    ];
    for (const rel of own)
      expect(files.find((f) => f.rel === rel)!.text, rel).not.toMatch(ACCOUNT_USE);
  });

  test('the accounts database client and the accounts schema stay out of the analytics store', () => {
    for (const rel of [
      'lib/analytics-store.ts',
      'lib/analytics-report.ts',
      'lib/reminder-store.ts',
    ]) {
      const text = files.find((f) => f.rel === rel)!.text;
      expect(text, rel).not.toMatch(/from '[.][/]db[/](client|schema)'|dbFromEnv/);
    }
  });

  test('the account routes only ever remove a push address from it, and know no analytics id', () => {
    const route = files.find((f) => f.rel === 'app/api/account/route.ts')!.text;
    expect(route).not.toMatch(/insertEvents|upsertSessions|insertFeedback|copySheetsToDb/);
  });
});

describe('refusal', () => {
  test('a refusing browser drops what an earlier visit left in the outbox, and sends nothing', async () => {
    const storage = memory();
    storage.setItem(KEYS.consent, 'denied');
    const leftover = { events: [{ type: 'screen_view' }], sessions: [] };
    storage.setItem(KEYS.outbox, JSON.stringify(leftover));
    const identity = resolveIdentity({
      search: new URLSearchParams(),
      hostname: 'vocabx-sigma.vercel.app',
      referrer: '',
      pathname: '/uk',
      storage,
      tab: memory(),
      now: Date.UTC(2026, 9, 25),
      uuid: nextUuid,
    });
    const send = vi.fn(async (_body: string, _beacon: boolean) => true);
    const t = new Tracker({
      identity,
      storage,
      now: () => Date.UTC(2026, 9, 25, 10),
      uuid: nextUuid,
      send,
      log: () => {},
    });
    t.start();
    t.track('answer', { correct: true });
    t.endSession('pagehide');
    await t.flush();
    await t.flush(true);
    expect(send).not.toHaveBeenCalled();
    expect(t.pending()).toEqual({ events: [], sessions: [] });
    expect(storage.getItem(KEYS.outbox)).toBeNull();
  });
});

function memory(): KeyValue {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

let ids = 0;
function nextUuid() {
  return `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
}
