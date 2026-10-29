// Runs only the end-to-end tests that cover what changed, instead of the whole suite.
//
//   pnpm e2e:changed               what changed since the last run that passed (commits and
//                                  changes not yet committed alike; the first time: since the
//                                  commit before the last one)
//   pnpm e2e:changed --base main   everything that differs from a branch or commit
//   pnpm e2e:changed --list        only prints which tests would run
//
// Any other argument goes to Playwright (e.g. --project mobile). The whole suite stays
// `pnpm e2e` — run it before pushing.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '..', '..');
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

const args = process.argv.slice(2);
const take = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const [, value] = args.splice(i, 2);
  return value ?? '';
};
/**
 * The last commit all chosen tests passed on, kept in .git (never committed). The work is
 * committed before a run, so "not committed yet" alone would often be nothing.
 */
const lastPassFile = join(root, '.git', 'vocabx-e2e-last-pass');
const lastPass = existsSync(lastPassFile) ? readFileSync(lastPassFile, 'utf8').trim() : '';
const known = (rev) => {
  try {
    git('cat-file', '-e', `${rev}^{commit}`);
    return true;
  } catch {
    return false;
  }
};
const base = take('--base') ?? (lastPass && known(lastPass) ? lastPass : 'HEAD~1');
const listOnly = args.includes('--list');
const passThrough = args.filter((a) => a !== '--list');

// Paths from the repository root.
const changed = [
  ...new Set([
    ...git('diff', '--name-only', base),
    ...git('ls-files', '--others', '--exclude-standard'),
  ]),
];

const ALL = '*';
/**
 * What covers what: a changed path (from the repo root) → the spec files to run. The first
 * matching rule wins for a path; "*" runs everything.
 */
const RULES = [
  // The test setup itself, dependencies and the build: everything.
  [
    /^apps\/web\/(e2e\/(fixtures\.ts|storage-state\.json)|playwright\.config\.ts|next\.config\.ts|package\.json)$/,
    [ALL],
  ],
  [/^(pnpm-lock\.yaml|package\.json)$/, [ALL]],
  [/^apps\/web\/e2e\/(.+)\.spec\.ts$/, (m) => [`${m[1]}.spec.ts`]],
  // Logic shared by the review, the decks and onboarding (unit tests check it in detail).
  [/^packages\/core\/src\/placement/, ['onboarding']],
  [
    /^packages\/core\/src\/(quiz|scheduler|session|study|xp|grades?)/,
    ['review', 'quiz', 'sentences', 'study-settings'],
  ],
  [/^packages\/core\/src\/(decks|words|library)/, ['decks']],
  [/^packages\/core\/src\/.*\.test\.ts$/, []],
  [/^packages\/core\//, ['review', 'quiz', 'sentences', 'decks', 'onboarding']],
  [/^packages\/content\//, ['onboarding', 'decks']],
  [/^packages\/data\//, ['onboarding', 'decks', 'review']],
  // The app, by area.
  [/^apps\/web\/src\/components\/review\//, ['review', 'quiz', 'sentences', 'study-settings']],
  [/^apps\/web\/src\/components\/onboarding\//, ['onboarding', 'install']],
  [/^apps\/web\/src\/components\/home\//, ['tour', 'install', 'shell']],
  [/^apps\/web\/src\/components\/(decks|library|words)\//, ['decks']],
  [/^apps\/web\/src\/components\/settings\//, ['study-settings', 'shell']],
  [/^apps\/web\/src\/components\/analytics\//, ['analytics']],
  [/^apps\/web\/src\/components\/shell\//, ['shell', 'tour']],
  [/^apps\/web\/src\/components\/character\//, ['review', 'tour']],
  [/^apps\/web\/src\/components\/feedback\//, ['quiz', 'sentences', 'shell']],
  [/^apps\/web\/src\/components\/dev\//, ['quiz', 'sentences']],
  [/^apps\/web\/src\/components\/ui\//, ['shell', 'review', 'decks']],
  [/^apps\/web\/src\/lib\/analytics\/|^apps\/web\/src\/app\/api\/track\//, ['analytics']],
  [/^apps\/web\/src\/lib\/(home-tour|gamification|player)/, ['tour', 'review']],
  [/^apps\/web\/src\/lib\/speech/, ['review', 'study-settings']],
  [/^apps\/web\/src\/lib\/(study|clock)/, ['review', 'quiz', 'sentences']],
  [/^apps\/web\/src\/lib\/(speech|lexicon)/, ['sentences', 'decks']],
  [/^apps\/web\/src\/lib\//, ['shell', 'review', 'decks', 'onboarding']],
  [/^apps\/web\/src\/(themes\/|app\/globals\.css)/, ['shell']],
  [/^apps\/web\/src\/app\/\[locale\]\/onboarding\//, ['onboarding']],
  [/^apps\/web\/src\/app\/\[locale\]\/\(app\)\/review\//, ['review', 'quiz', 'sentences']],
  [/^apps\/web\/src\/app\/\[locale\]\/\(app\)\/decks\//, ['decks']],
  [/^apps\/web\/src\/app\/\[locale\]\/\(app\)\/settings\//, ['study-settings', 'shell']],
  [/^apps\/web\/src\/app\/\[locale\]\/\(app\)\/page\.tsx$/, ['tour', 'shell']],
  [/^apps\/web\/src\/app\/api\//, []],
  [/^apps\/web\/src\//, ['shell']],
  [/^apps\/web\/messages\/[^/]+\/(review)\.json$/, ['review', 'quiz', 'sentences']],
  [/^apps\/web\/messages\/[^/]+\/onboarding\.json$/, ['onboarding']],
  [/^apps\/web\/messages\/[^/]+\/pages\.json$/, ['tour', 'install', 'shell']],
  [/^apps\/web\/messages\/[^/]+\/(decks|words|library)\.json$/, ['decks']],
  [/^apps\/web\/messages\/[^/]+\/settings\.json$/, ['study-settings', 'shell']],
  [/^apps\/web\/messages\/[^/]+\/analytics\.json$/, ['analytics']],
  [/^apps\/web\/messages\//, ['shell']],
  [/^apps\/web\/public\//, ['shell', 'install']],
];
/** Anything the learner sees: the quick look at every page (smoke) runs too. */
const UI = /^apps\/web\/(src\/.*\.(tsx|css)|messages\/|public\/)/;

const specs = new Set();
const why = [];
for (const path of changed) {
  for (const [re, to] of RULES) {
    const m = re.exec(path);
    if (!m) continue;
    const list = typeof to === 'function' ? to(m) : to;
    for (const s of list) specs.add(s);
    why.push(`  ${path} → ${list.length ? list.join(', ') : '(unit tests only)'}`);
    break;
  }
  if (UI.test(path)) specs.add('smoke');
}

const runAll = specs.has(ALL);
const files = [...specs]
  .filter((s) => s !== ALL)
  .map((s) => (s.endsWith('.spec.ts') ? s : `${s}.spec.ts`))
  .filter((f) => existsSync(join(web, 'e2e', f)) && f !== 'screenshots.spec.ts')
  .sort();

console.log(
  why.length ? `Changed:\n${why.join('\n')}\n` : 'No changes that end-to-end tests cover.',
);
if (!runAll && files.length === 0) process.exit(0);
console.log(runAll ? 'Running: all tests\n' : `Running: ${files.join(', ')}\n`);
if (listOnly) process.exit(0);

const projects = passThrough.some((a) => a.startsWith('--project'))
  ? []
  : ['--project', 'mobile', '--project', 'desktop'];
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'playwright',
    'test',
    ...(runAll ? [] : files.map((f) => `e2e/${f}`)),
    ...projects,
    ...passThrough,
  ],
  { cwd: web, stdio: 'inherit', shell: process.platform === 'win32' },
);
// Passed: the next run starts from here.
if (result.status === 0 && !listOnly) writeFileSync(lastPassFile, git('rev-parse', 'HEAD')[0]);
process.exit(result.status ?? 1);
