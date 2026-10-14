import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, test } from 'vitest';
import { classify } from './class-tokens';
import plugin from './index';

RuleTester.describe = describe;
RuleTester.it = test;
RuleTester.itOnly = test.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('classify', () => {
  test.each([
    ['bg-white', 'raw-color'],
    ['text-gray-900', 'raw-color'],
    ['hover:bg-red-500/50', 'raw-color'],
    ['bg-[#fff]', 'raw-color'],
    ['border-[rgb(0,0,0)]', 'raw-color'],
    ['dark:bg-surface', 'dark'],
    ['ml-4', 'physical'],
    ['-mr-2', 'physical'],
    ['md:pl-8', 'physical'],
    ['left-0', 'physical'],
    ['text-right', 'physical'],
    ['rounded-l-lg', 'physical'],
    ['border-r', 'physical'],
  ])('%s → %s', (token, kind) => expect(classify(token)?.kind).toBe(kind));

  test.each([
    'bg-surface',
    'text-fg-muted',
    'bg-accent/20',
    'ms-4',
    'pe-2',
    'start-0',
    'text-start',
    'rounded-lg',
    'border-line',
    'bg-transparent',
    'w-[calc(100%-2rem)]',
    'pl',
    'data-[state=checked]:bg-accent',
  ])('%s is allowed', (token) => expect(classify(token)).toBeNull());
});

tester.run('design-tokens', plugin.rules!['design-tokens']!, {
  valid: [
    { code: 'const a = <div className="bg-surface text-fg ms-2" />;' },
    { code: "const v = { primary: 'bg-accent text-on-accent' };" },
    { code: "const lang = 'pl';" },
  ],
  invalid: [
    { code: 'const a = <div className="bg-white p-4" />;', errors: 1 },
    { code: "const v = { primary: 'bg-blue-600 dark:bg-blue-400' };", errors: 2 },
    { code: 'const c = `ml-2 ${x}`;', errors: 1 },
  ],
});

tester.run('no-jsx-literals', plugin.rules!['no-jsx-literals']!, {
  valid: [
    { code: 'const a = <p>{t("hello")}</p>;' },
    { code: 'const a = <p>{count} · {total}</p>;' },
    { code: 'const a = <img alt={t("logo")} className="size-4" />;' },
    { code: 'const a = <span aria-hidden data-state="open" />;' },
  ],
  invalid: [
    { code: 'const a = <p>Привіт</p>;', errors: 1 },
    { code: 'const a = <p>{"Hello"}</p>;', errors: 1 },
    { code: 'const a = <button aria-label="Close" />;', errors: 1 },
    { code: 'const a = <input placeholder={"Пошук"} />;', errors: 1 },
  ],
});
