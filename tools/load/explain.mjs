// Step 3.2: the plan and the time of every query the hot routes run, on the LOAD branch after
// seed.mjs. Prints, per query, how it reads each table (index or whole table) and how long it
// took; a whole-table read of a big table is marked. Reads only; the queries are the ones in
// lib/sync-server.ts, lib/league-server.ts and lib/rate-limit.ts, written out by hand here.
import { loadDb } from './lib.mjs';

const sql = loadDb();
const q = (text) => sql.query(text);
const [{ id: u }] = await q(`SELECT id FROM users WHERE email = 'load-0001@load.vocabx.test'`);
const [{ id: v }] = await q(`SELECT id FROM users WHERE email = 'load-0002@load.vocabx.test'`);
const [{ max }] = await q(
  `SELECT max(server_seq) AS max FROM review_events WHERE user_id = '${v}'`,
);
const [{ week }] = await q(`SELECT to_char(date_trunc('week', now()), 'YYYY-MM-DD') AS week`);
const [{ group }] = await q(
  `SELECT group_id AS group FROM league_members WHERE week = '${week}' AND user_id = '${v}'`,
).then((r) =>
  r.length ? r : q(`SELECT group_id AS group FROM league_members WHERE week = '${week}' LIMIT 1`),
);

const cases = {
  'sync: account is live': `SELECT id FROM users WHERE id = '${v}' AND (sessions_since IS NULL OR sessions_since <= now())`,
  'sync open (cursor = latest): events': `SELECT * FROM review_events WHERE user_id = '${v}' AND server_seq > ${max} ORDER BY server_seq LIMIT 501`,
  'sync open: words': `SELECT * FROM words WHERE user_id = '${v}' AND server_seq > ${max} ORDER BY server_seq LIMIT 501`,
  'sync open: cards': `SELECT * FROM card_progress WHERE user_id = '${v}' AND server_seq > ${max} ORDER BY server_seq LIMIT 501`,
  'sync new device (cursor 0): events': `SELECT * FROM review_events WHERE user_id = '${v}' AND server_seq > 0 ORDER BY server_seq LIMIT 501`,
  'sync heavy account (100k answers), cursor = latest': `SELECT * FROM review_events WHERE user_id = '${u}' AND server_seq > (SELECT max(server_seq) FROM review_events WHERE user_id = '${u}') ORDER BY server_seq LIMIT 501`,
  'sync quota: count answers (1k)': `SELECT count(*)::int FROM review_events WHERE user_id = '${v}'`,
  'sync quota: count answers (heavy, 100k)': `SELECT count(*)::int FROM review_events WHERE user_id = '${u}'`,
  'league credit: answers of the day': `SELECT id, word_id, at, deleted_at FROM review_events WHERE user_id = '${v}' AND at >= now() - interval '1 day' AND at <= now()`,
  'league: own member row': `SELECT * FROM league_members WHERE week = '${week}' AND user_id = '${v}'`,
  'league: last week of this user': `SELECT * FROM league_members WHERE user_id = '${v}' AND week < '${week}' ORDER BY week DESC LIMIT 1`,
  'league: open group of the tier (join)': `SELECT group_id FROM league_members WHERE week = '${week}' AND tier = 0 GROUP BY group_id HAVING count(*) < 10 ORDER BY min(xp_at) LIMIT 1`,
  'league: scores of a group': `SELECT m.*, p.* FROM league_members m JOIN league_profiles p ON p.user_id = m.user_id WHERE m.week = '${week}' AND m.group_id = '${group}'`,
  'limits: spend (upsert by key)': `INSERT INTO rate_limits (key, count, reset_at) VALUES ('sync:load-explain', 1, now() + interval '10 minutes') ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1`,
  'limits: sweep expired': `DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE reset_at < now() LIMIT 20)`,
  'translate: cached answer': `SELECT translations FROM translation_cache WHERE key = 'en|uk|word500' AND created_at > now() - interval '30 days'`,
};

const BIG = ['review_events', 'words', 'card_progress', 'league_members'];
let flagged = 0;
for (const [name, text] of Object.entries(cases)) {
  const rows = await q(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${text}`);
  const plan = rows.map((r) => r['QUERY PLAN']);
  const time = /Execution Time: ([\d.]+) ms/.exec(plan.join('\n'))?.[1];
  const reads = plan
    .map((l) =>
      /(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan) (?:using (\S+) )?on (\S+)/.exec(l),
    )
    .filter(Boolean)
    .map((m) => `${m[1]} ${m[2] ? `[${m[2]}] ` : ''}${m[3]}`);
  const whole = plan.some(
    (l) => /Seq Scan on (\S+)/.exec(l) && BIG.includes(/Seq Scan on (\S+)/.exec(l)[1]),
  );
  if (whole) flagged++;
  console.log(
    `${whole ? '!! ' : '   '}${name}: ${time} ms\n      ${reads.join('; ') || '(no table read)'}`,
  );
}
await q(`DELETE FROM rate_limits WHERE key = 'sync:load-explain'`);
console.log(
  flagged
    ? `\n${flagged} query(ies) read a whole big table.`
    : '\nNo query reads a whole big table.',
);
