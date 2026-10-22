// Copies media from /public at the repository root into apps/web/public, which is the only
// folder Next.js serves. The root folder is the one to edit; the copy is generated and ignored by
// git. Runs before `dev` and `build`; run it by hand after adding pictures while dev is running.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../../public/', import.meta.url));
const target = fileURLToPath(new URL('../public/', import.meta.url));

if (!existsSync(source)) {
  // Without it the app would deploy with no character pictures; fail the build instead. On
  // Vercel keep "Include files outside the Root Directory" on (the default for monorepos).
  console.error(`media: ${source} not found — the character pictures would be missing`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log('media: synced /public → apps/web/public');
