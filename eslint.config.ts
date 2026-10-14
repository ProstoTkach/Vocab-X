import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import vocabx from 'eslint-plugin-vocabx';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  {
    ignores: [
      'reference/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // With noUncheckedIndexedAccess, '!' marks indices proven in range by the surrounding loop.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // Repository interfaces are async for future backends; sync implementations are fine.
      '@typescript-eslint/require-await': 'off',
      // Typed JSON reads (read<T>()) intentionally use a single-use type parameter.
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Use the injected Rng instead of Math.random.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use the injected Clock instead of Date.now().',
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks, vocabx },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      'vocabx/design-tokens': 'error',
      'vocabx/no-jsx-literals': 'error',
      // UI must go through repositories, never straight to storage.
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use repositories from useRepos().' },
        { name: 'sessionStorage', message: 'Use repositories from useRepos().' },
      ],
    },
    settings: { next: { rootDir: 'apps/web' } },
  },
  {
    // Tests, e2e and tooling may use literals and storage to set up state.
    files: ['apps/web/e2e/**', 'apps/web/**/*.test.ts'],
    rules: { 'vocabx/no-jsx-literals': 'off', 'no-restricted-globals': 'off' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false, program: null },
      globals: globals.node,
    },
  },
  prettier,
);
