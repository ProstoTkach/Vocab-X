// The one-off import of the analytics spreadsheet's history into the anonymous-data database:
// pnpm analytics:import --test | --prod. The same function as the nightly copy, without its time
// limit, plus the feedback tab. The spreadsheet is only read. Run it on the test branch first;
// `--prod` is the real database (do it after making a copy of the spreadsheet). Safe to repeat.
import { copyFeedbackToDb, copySheetsToDb } from '../src/lib/analytics-store';
import { anonDbFromUrl } from '../src/lib/db/anon-client';
import { sheetsConfigFromEnv } from '../src/lib/google-sheets';

process.loadEnvFile('.env');

const target = process.argv.includes('--prod')
  ? process.env.DATABASE_URL_ANON
  : process.argv.includes('--test')
    ? process.env.DATABASE_URL_ANON_TEST
    : undefined;
if (!target) {
  console.error(
    'Usage: pnpm analytics:import --test | --prod (and the address must be set in .env).',
  );
  process.exit(1);
}
const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
if (!sheets) {
  console.error('The analytics spreadsheet is not set up (GOOGLE_* in apps/web/.env).');
  process.exit(1);
}
const db = anonDbFromUrl(target);
const copy = await copySheetsToDb(sheets, db);
const feedback = await copyFeedbackToDb(sheets, db);
console.log(JSON.stringify({ ...copy, feedbackAdded: feedback }, null, 2));
