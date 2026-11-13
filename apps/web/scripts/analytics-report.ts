// The launch metrics from the anonymous-data database: pnpm analytics:report --from 2026-10-26
// [--today 2026-11-13] [--test]. Reads only. `--test` uses the test branch (DATABASE_URL_ANON_TEST).
import { cohortRows, formatMetrics, launchMetrics } from '../src/lib/analytics-report';
import { kyivDay } from '../src/lib/analytics-store';
import { anonDbFromUrl } from '../src/lib/db/anon-client';

process.loadEnvFile('.env');

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const from = option('--from');
const today = option('--today') ?? kyivDay(new Date().getTime());
if (!from || !DAY.test(from) || !DAY.test(today)) {
  console.error('Usage: pnpm analytics:report --from YYYY-MM-DD [--today YYYY-MM-DD] [--test]');
  process.exit(1);
}
const url = args.includes('--test')
  ? process.env.DATABASE_URL_ANON_TEST
  : process.env.DATABASE_URL_ANON;
if (!url) {
  console.error('The anonymous-data database address is not set (apps/web/.env).');
  process.exit(1);
}
const rows = await cohortRows(anonDbFromUrl(url), from);
for (const line of formatMetrics(launchMetrics(rows, today), from, today)) console.log(line);
