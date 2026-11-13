// The bundle half of `pnpm metrics` (plan 4.1/4.2): what each page's scripts weigh, and which
// packages the weight comes from. `next experimental-analyze` builds the app and keeps, for every
// route, every output file with the source modules inside it; this adds them up by package. The
// sizes of a page are the real files the page loads (gzip computed here); the split by package
// uses the analyzer's own per-module sizes (unpacked, and gzip of each module alone, which
// over-counts a little against gzip of the whole file).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) =>
  spawnSync('pnpm', ['exec', 'next', 'experimental-analyze', ...args], {
    cwd: web,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 1 << 30,
  });

const built = run(['-o']);
if (built.status !== 0) {
  console.error((built.stdout + built.stderr).split('\n').slice(-20).join('\n'));
  process.exit(1);
}
const dump = run(['export']);
if (dump.status !== 0) {
  console.error(dump.stderr);
  process.exit(1);
}
const lines = dump.stdout
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const kb = (n) => Math.round((n / 1024) * 10) / 10;
const isChunk = (name) => /\/static\/chunks\/.*\.js$/.test(name);

/** The package a source file belongs to: a library from node_modules, or a folder of ours. */
function owner(path) {
  const lib = path.match(/node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (lib) return lib[1];
  const app = path.match(/apps\/web\/src\/([^/]+)/);
  if (app) return `app: src/${app[1]}`;
  const own = path.match(/packages\/([^/]+)/);
  if (own) return `packages/${own[1]}`;
  return 'other';
}

/** A library family: every @sentry/* is one line, since it is one decision to keep or drop it. */
const family = (name) => (name.startsWith('@sentry/') ? '@sentry/*' : name);

function split(route) {
  const by = new Map();
  let raw = 0;
  for (const p of lines) {
    if (p.type !== 'part' || p.route !== route || !isChunk(p.filename)) continue;
    const key = family(owner(p.source_path));
    const row = by.get(key) ?? { raw: 0, gzipEach: 0 };
    row.raw += p.size;
    row.gzipEach += p.compressed_size;
    by.set(key, row);
    raw += p.size;
  }
  const top = [...by.entries()]
    .sort((a, b) => b[1].raw - a[1].raw)
    .slice(0, 14)
    .map(([name, v]) => ({ name, rawKb: kb(v.raw), gzipKb: kb(v.gzipEach) }));
  return { rawKb: kb(raw), top };
}

// The files a page loads first, from the build's own list, gzipped here.
const stats = JSON.parse(
  readFileSync(join(web, '.next/diagnostics/route-bundle-stats.json'), 'utf8'),
);
const files = new Map();
const gz = (path) => {
  if (!files.has(path)) {
    const b = readFileSync(join(web, path.replaceAll('\\', '/')));
    files.set(path, { raw: b.length, gz: gzipSync(b).length });
  }
  return files.get(path);
};
const routes = stats
  .filter((r) => r.firstLoadChunkPaths.length)
  .map((r) => {
    const sizes = r.firstLoadChunkPaths.map(gz);
    return {
      route: r.route,
      chunks: sizes.length,
      rawKb: kb(sizes.reduce((a, s) => a + s.raw, 0)),
      gzipKb: kb(sizes.reduce((a, s) => a + s.gz, 0)),
    };
  })
  .sort((a, b) => b.gzipKb - a.gzipKb);

const report = {
  note: 'first-load JavaScript per route (the files the build lists for it) and its split by package',
  routes,
  home: split('/[locale]'),
  review: split('/[locale]/review'),
};
mkdirSync(join(web, 'metrics-out'), { recursive: true });
writeFileSync(join(web, 'metrics-out/bundle.json'), JSON.stringify(report, null, 2));
console.log('\nfirst-load JS per route (KB, unpacked / gzip):');
for (const r of routes)
  console.log(`  ${r.route.padEnd(34)} ${r.rawKb} / ${r.gzipKb}  (${r.chunks} files)`);
for (const name of ['home', 'review']) {
  console.log(`\n${name}: biggest packages in its scripts (KB unpacked / gzip per module):`);
  for (const t of report[name].top) console.log(`  ${t.name.padEnd(36)} ${t.rawKb} / ${t.gzipKb}`);
}
console.log('\nbundle: metrics-out/bundle.json');
