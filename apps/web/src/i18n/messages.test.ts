import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOCALE, LOCALES, NAMESPACES } from './locales';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

/** Argument names used by a message, e.g. {count} and {stage}. */
function argNames(message: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: ReturnType<typeof parse>) => {
    for (const n of nodes) {
      if ('value' in n && typeof n.value === 'string' && n.type !== TYPE.literal)
        names.add(n.value);
      if ('options' in n)
        for (const opt of Object.values(n.options as Record<string, { value: typeof nodes }>))
          walk(opt.value);
    }
  };
  walk(parse(message));
  return [...names].sort();
}

// Read files directly (not via the bundler's dynamic import) so a newly added locale folder
// is checked exactly as it exists on disk.
const MESSAGES_DIR = fileURLToPath(new URL('../../messages/', import.meta.url));

function load(locale: string): Map<string, string> {
  const tree: Tree = {};
  for (const ns of NAMESPACES)
    tree[ns] = JSON.parse(readFileSync(join(MESSAGES_DIR, locale, `${ns}.json`), 'utf8')) as Tree;
  return flatten(tree);
}

const reference = load(DEFAULT_LOCALE);

test('every locale folder is registered', () => {
  const folders = readdirSync(MESSAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  expect(folders).toEqual(LOCALES.map((l) => l.code).sort());
});

describe.each(LOCALES.map((l) => l.code))('locale %s', (code) => {
  const messages = load(code);

  test('has every namespace', () => {
    for (const ns of NAMESPACES)
      expect([...messages.keys()].some((k) => k.startsWith(`${ns}.`))).toBe(true);
  });
  test('has exactly the same keys as the default locale', () => {
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
  });
  test('every message is valid ICU with the same arguments', () => {
    for (const [key, msg] of messages) {
      expect(() => parse(msg), key).not.toThrow();
      expect(argNames(msg), key).toEqual(argNames(reference.get(key)!));
    }
  });
});
