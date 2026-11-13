// Quick look at every page in WebKit (desktop + iPhone) and Firefox (plan 6.11).
// The first time on a machine: pnpm exec playwright install webkit firefox
import { spawnSync } from 'node:child_process';

const res = spawnSync(
  'pnpm',
  [
    'exec',
    'playwright',
    'test',
    '--project',
    'webkit',
    '--project',
    'webkit-phone',
    '--project',
    'firefox',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', shell: true, env: { ...process.env, E2E_BROWSERS: '1' } },
);
process.exit(res.status ?? 1);
