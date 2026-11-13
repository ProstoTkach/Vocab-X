// Load tests against the preview of the load-test branch (never production: lib.mjs refuses any
// other address). The users are the ones seed.mjs made; their sessions are minted here with the
// preview's secret (LOAD_NEXTAUTH_SECRET in apps/web/.env), as Google sign-in is not set up there.
//   node run.mjs [--probe] [--routes health,open,review,first,league,track] [--levels 5,10,25,50]
//                [--seconds 15] [--users 300]
// Closed loop: at each level that many requests are in flight at all times, each for another user
// (round robin), so a user's own limits are not what is measured. Prints a table and writes
// results/<time>.json. A 429 or 5xx is counted apart and never counted as a fast answer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDb, loadEnv, percentile, sessionCookie, target } from './lib.mjs';

const env = loadEnv();
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = target(env);
const secret = env.LOAD_NEXTAUTH_SECRET;
const bypass = env.VERCEL_BYPASS_SECRET;
const seconds = Number(flag('seconds', 15));
const levels = flag('levels', '5,10,25,50').split(',').map(Number);
const count = Number(flag('users', 300));

const routes = flag('routes', 'health,open,review,first,league,track').split(',');
const needsUsers = routes.some((r) => !['health', 'track'].includes(r));
if (needsUsers && !secret)
  throw new Error('LOAD_NEXTAUTH_SECRET (the preview NEXTAUTH_SECRET) is not in apps/web/.env.');

const sql = loadDb(env);
const rows = await sql.query(
  `SELECT id, email FROM users WHERE email LIKE 'load-%@load.vocabx.test' ORDER BY email LIMIT ${count}`,
);
if (rows.length < count) throw new Error(`Only ${rows.length} load users; run seed.mjs first.`);
const secure = base.startsWith('https');
const cookieName = `${secure ? '__Secure-' : ''}next-auth.session-token`;
const users = rows.map((r) => ({
  id: r.id,
  cookie: `${cookieName}=${sessionCookie(secret ?? 'unused', r)}`,
  cursor: 0,
  n: 0,
}));

const headers = (u) => ({
  'content-type': 'application/json',
  origin: base,
  ...(bypass && secure ? { 'x-vercel-protection-bypass': bypass } : {}),
  ...(u ? { cookie: u.cookie } : {}),
});
const call = (path, u, body, method = 'POST') =>
  fetch(base + path, {
    method,
    headers: headers(u),
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

const noChanges = () => ({
  words: [],
  decks: [],
  cards: [],
  events: [],
  deleted: { words: [], decks: [], cards: [], events: [] },
});
const syncBody = (u, changes = noChanges()) => ({
  protocol: 1,
  owner: u.id,
  cursor: u.cursor,
  changes,
});
const reviewChanges = (u, k = 20) => {
  const now = Date.now();
  const changes = noChanges();
  for (let i = 0; i < k; i++) {
    const id = `l${now}-${++u.n}-${i}`;
    const wordId = `w${1 + ((u.n * 7 + i) % 200)}`;
    changes.events.push({
      id,
      wordId,
      at: now - i * 3000,
      grade: 3,
      format: 'REC',
      responseMs: 2500,
      wasNew: false,
      retention: 0.9,
      xp: 10,
    });
    changes.cards.push({
      wordId,
      lang: 'en',
      card: {
        stability: 5,
        difficulty: 5,
        lastReviewAt: now,
        level: 1,
        levelStreak: 1,
        lapses: 0,
        reps: 4,
      },
      dueAt: now + 86_400_000,
      lastEventId: id,
    });
  }
  return changes;
};
/** Sends a sync and keeps the user's cursor, as a device does. */
async function sync(u, changes) {
  const res = await call('/api/sync', u, syncBody(u, changes));
  if (res.ok) {
    const j = await res.json();
    u.cursor = j.cursor;
    return { res, more: j.more };
  }
  await res.arrayBuffer();
  return { res, more: false };
}

const SCENARIOS = {
  // One query over HTTP: the floor of the platform. The database is asked only with the token
  // (`HEALTH_DB_TOKEN`, the same in apps/web/.env and on the preview); without it, the site alone.
  health: () =>
    call(
      env.HEALTH_DB_TOKEN
        ? `/api/health?db=${encodeURIComponent(env.HEALTH_DB_TOKEN)}`
        : '/api/health',
      null,
      undefined,
      'GET',
    ),
  // A device opens the app: nothing to send, nothing new to read.
  open: async (u) => (await sync(u)).res,
  // After a review: 20 answers and their 20 cards go up.
  review: async (u) => (await sync(u, reviewChanges(u))).res,
  // A new device: reads everything the account has, 500 rows of each table a page.
  first: async (u) => {
    u.cursor = 0;
    return (await sync(u)).res;
  },
  league: (u) => call('/api/league', u, { join: false }),
  // The spreadsheet is not set up on the preview: this is the route's own cost up to that point.
  track: () =>
    call('/api/track', null, {
      events: [
        { event_id: crypto.randomUUID(), anon_id: 'load', type: 'screen_view', ts: Date.now() },
      ],
      sessions: [],
    }),
};

async function level(name, concurrency) {
  const fn = SCENARIOS[name];
  const lat = [];
  const bad = {};
  let ok = 0;
  let next = Math.floor(Math.random() * users.length);
  const stop = Date.now() + seconds * 1000;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < stop) {
        const u = users[next++ % users.length];
        const t = performance.now();
        try {
          const res = await fn(u);
          const ms = performance.now() - t;
          if (res.status === 200 || res.status === 204) {
            ok++;
            lat.push(ms);
          } else bad[res.status] = (bad[res.status] ?? 0) + 1;
          if (!res.bodyUsed) await res.arrayBuffer();
        } catch (e) {
          const code = e.cause?.code ?? 'network';
          bad[code] = (bad[code] ?? 0) + 1;
        }
      }
    }),
  );
  lat.sort((a, b) => a - b);
  const secondsRun = (Date.now() - started) / 1000;
  return {
    route: name,
    concurrency,
    rps: +(ok / secondsRun).toFixed(1),
    p50: Math.round(percentile(lat, 50)),
    p95: Math.round(percentile(lat, 95)),
    p99: Math.round(percentile(lat, 99)),
    max: Math.round(lat.at(-1) ?? 0),
    ok,
    bad,
  };
}

const forgetLimits = () =>
  sql.query(
    `DELETE FROM rate_limits WHERE key LIKE 'sync:%' OR key LIKE 'sync-hour:%' OR key LIKE 'league:%'`,
  );

// One sync before anything is loaded: a wrong secret would be a 401 everywhere.
const probe = needsUsers ? await sync(users[0]) : { res: { status: 200 } };
console.log(`Target ${base}; probe sync -> ${needsUsers ? probe.res.status : 'not needed'}`);
if (probe.res.status !== 200) {
  console.error('The probe did not get 200: the secret, the bypass or the address is wrong.');
  process.exit(1);
}
if (process.argv.includes('--probe')) process.exit(0);

// Every user to the latest cursor first (a new device's full read is its own scenario).
if (needsUsers)
  for (const u of users) for (let i = 0; i < 20; i++) if (!(await sync(u)).more) break;
await forgetLimits();

const results = [];
for (const name of routes) {
  for (const c of levels) {
    const r = await level(name, c);
    results.push(r);
    console.log(
      `${name.padEnd(7)} c=${String(c).padEnd(3)} ${String(r.rps).padStart(6)} rps  p50 ${String(r.p50).padStart(5)}  p95 ${String(r.p95).padStart(5)}  p99 ${String(r.p99).padStart(5)}  max ${String(r.max).padStart(5)} ms  ok ${r.ok}  bad ${JSON.stringify(r.bad)}`,
    );
    // Only the load branch holds these counters.
    await forgetLimits();
    if (r.ok === 0) break;
  }
}
const dir = resolve(import.meta.dirname, 'results');
mkdirSync(dir, { recursive: true });
const file = resolve(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ base, seconds, results }, null, 2));
console.log(`Written ${file}`);
