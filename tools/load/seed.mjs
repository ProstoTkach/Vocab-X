// Fills the LOAD branch of Neon (never the main or the test database, see lib.mjs) with load users
// and data of a realistic size, so the queries are timed on tables that are not empty.
//   node seed.mjs [--users 300] [--words 200] [--events 1000] [--ghosts 5000] [--heavy] [--reset]
// Active users (load-0001@load.vocabx.test ...) get words, cards, answers and a league profile.
// Ghosts only fill the league tables, so the group search has the table of a real league to read.
import { loadDb, loadEmail } from './lib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const users = arg('users', 300);
const wordsEach = arg('words', 200);
const eventsEach = arg('events', 1000);
const ghosts = arg('ghosts', 5000);

const sql = loadDb();
const q = (text, params = []) => sql.query(text, params);

if (process.argv.includes('--reset')) {
  await q(`DELETE FROM users WHERE email LIKE '%@load.vocabx.test'`);
  console.log('Load users removed (their rows go with them).');
}

const time = Date.now();
await q(
  `INSERT INTO users (email, email_verified_at)
   SELECT 'load-' || lpad(n::text, 4, '0') || '@load.vocabx.test', now() FROM generate_series(1, $1) n
   ON CONFLICT DO NOTHING`,
  [users],
);
await q(
  `INSERT INTO users (email, email_verified_at)
   SELECT 'ghost-' || lpad(n::text, 6, '0') || '@load.vocabx.test', now() FROM generate_series(1, $1) n
   ON CONFLICT DO NOTHING`,
  [ghosts],
);
console.log(`Users: ${users} active, ${ghosts} ghosts.`);

// Only users that have no words yet get data: running again adds nothing twice.
const fresh = `u.email LIKE 'load-%@load.vocabx.test' AND NOT EXISTS (SELECT 1 FROM words w WHERE w.user_id = u.id)`;
await q(
  `INSERT INTO words (user_id, id, lang, term, data)
   SELECT u.id, 'w' || i, 'en', 'word' || i,
     jsonb_build_object('id', 'w' || i, 'lang', 'en', 'term', 'word' || i, 'lemma', 'word' || i,
       'translations', jsonb_build_object('uk', jsonb_build_array('слово ' || i)),
       'examples', jsonb_build_array(jsonb_build_object('text', 'An example sentence for word number ' || i || '.')),
       'source', 'builtin', 'createdAt', 1700000000000, 'updatedAt', 1700000000000)
   FROM users u, generate_series(1, $1) i WHERE ${fresh}`,
  [wordsEach],
);
await q(
  `INSERT INTO card_progress (user_id, word_id, lang, card, due_at, last_event_id)
   SELECT w.user_id, w.id, 'en',
     jsonb_build_object('stability', 4.5, 'difficulty', 5.2, 'lastReviewAt', 1760000000000,
       'level', 1, 'levelStreak', 2, 'lapses', 0, 'reps', 3),
     now() + ((random() * 30 - 10) || ' days')::interval, 'e-seed'
   FROM words w JOIN users u ON u.id = w.user_id
   WHERE u.email LIKE 'load-%@load.vocabx.test'
     AND NOT EXISTS (SELECT 1 FROM card_progress c WHERE c.user_id = w.user_id AND c.word_id = w.id)`,
);
await q(
  `INSERT INTO review_events (user_id, id, word_id, at, grade, format, response_ms, was_new, retention, xp)
   SELECT u.id, 'e' || i, 'w' || (1 + i % $1), now() - ((i * 90.0 / $2) || ' days')::interval,
     1 + i % 4, 'REC', 2500, false, 0.9, 10
   FROM users u, generate_series(1, $2) i
   WHERE u.email LIKE 'load-%@load.vocabx.test'
     AND NOT EXISTS (SELECT 1 FROM review_events e WHERE e.user_id = u.id AND e.id = 'e1')`,
  [wordsEach, eventsEach],
);
await q(
  `INSERT INTO user_state (user_id, profile, settings, gamification)
   SELECT u.id, '{}'::jsonb, '{}'::jsonb, '{"xpTotal":1000,"streakDays":5,"streakFreezes":0}'::jsonb
   FROM users u WHERE u.email LIKE 'load-%@load.vocabx.test' ON CONFLICT DO NOTHING`,
);
// Everyone is in the league: the active users joined three weeks ago (so they are in the race).
await q(
  `INSERT INTO league_profiles (user_id, name, look, frame, tier, joined_at)
   SELECT u.id, split_part(u.email, '@', 1), '{"avatar":"a1","worn":[],"accessories":[]}'::jsonb,
     '{"bg":"plain","ring":"none"}'::jsonb, 0, now() - interval '21 days'
   FROM users u WHERE u.email LIKE '%@load.vocabx.test' ON CONFLICT DO NOTHING`,
);
// Ghosts: full groups of ten in this and the two weeks before (the table a league leaves behind).
await q(
  `INSERT INTO league_members (week, user_id, group_id, tier, xp, xp_at)
   SELECT w.week, g.id, gen_random_uuid(), 0, (random() * 500)::int, now()
   FROM (SELECT date_trunc('week', now())::date - (k * 7) AS week FROM generate_series(0, 2) k) w,
        (SELECT id FROM users WHERE email LIKE 'ghost-%@load.vocabx.test') g
   ON CONFLICT DO NOTHING`,
);
// Ten per group, the way the app fills them.
await q(
  `UPDATE league_members m SET group_id = x.gid FROM (
     SELECT week, user_id, md5(week::text || ((row_number() OVER (PARTITION BY week ORDER BY user_id) - 1) / 10)::text)::uuid AS gid
     FROM league_members) x
   WHERE m.week = x.week AND m.user_id = x.user_id AND m.user_id IN (SELECT id FROM users WHERE email LIKE 'ghost-%')`,
);
// One learner of many years (100 000 answers): the heaviest account the quota lets through.
if (process.argv.includes('--heavy'))
  await q(
    `INSERT INTO review_events (user_id, id, word_id, at, grade, format, response_ms, was_new, retention, xp)
     SELECT u.id, 'h' || i, 'w' || (1 + i % $1), now() - ((i * 1800.0 / 100000) || ' days')::interval,
       1 + i % 4, 'REC', 2500, false, 0.9, 10
     FROM users u, generate_series(1, 100000) i WHERE u.email = 'load-0001@load.vocabx.test'
     ON CONFLICT DO NOTHING`,
    [wordsEach],
  );
// The shared translation answers (kept 30 days): the table the cached path reads.
await q(
  `INSERT INTO translation_cache (key, translations) SELECT 'en|uk|word' || i, '["слово"]'::jsonb FROM generate_series(1, 20000) i ON CONFLICT DO NOTHING`,
);
await q('ANALYZE');
const [n] = await q(
  `SELECT (SELECT count(*) FROM words) AS words, (SELECT count(*) FROM card_progress) AS cards,
          (SELECT count(*) FROM review_events) AS events, (SELECT count(*) FROM league_members) AS members,
          pg_size_pretty(pg_database_size(current_database())) AS size`,
);
console.log(n, `in ${((Date.now() - time) / 1000).toFixed(0)} s`);
console.log(`First load user: ${loadEmail(1)}`);
