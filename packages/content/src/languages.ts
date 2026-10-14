// Registry of languages known to the app. Adding a language = an adapter file + one entry here.
import { createBasicAdapter, type LangCode, type LanguageAdapter } from '@vocabx/core';
import { de } from './adapters/de';
import { en } from './adapters/en';
import { es } from './adapters/es';
import { uk } from './adapters/uk';

export interface LanguageInfo {
  code: LangCode;
  /** English name, for logs and fallbacks; the UI shows `languages.<code>` from i18n. */
  name: string;
  /** Endonym, shown in language pickers. */
  nativeName: string;
  dir: 'ltr' | 'rtl';
  /** ISO 15924 script; selects the font stack. */
  script: 'Latn' | 'Cyrl' | 'Arab' | 'Hebr' | 'Hans' | 'Jpan' | 'Kore';
  /** Tag for the Web Speech API voice. */
  speechLang: string;
  /** Can be studied (has an adapter good enough for grading and content). */
  learnable: boolean;
  /** Can be used as the language of translations. */
  translatable: boolean;
  adapter: LanguageAdapter;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dir: 'ltr',
    script: 'Latn',
    speechLang: 'en-US',
    learnable: true,
    translatable: true,
    adapter: en,
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    dir: 'ltr',
    script: 'Latn',
    speechLang: 'de-DE',
    learnable: true,
    translatable: false,
    adapter: de,
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    dir: 'ltr',
    script: 'Latn',
    speechLang: 'es-ES',
    learnable: true,
    translatable: false,
    adapter: es,
  },
  {
    code: 'uk',
    name: 'Ukrainian',
    nativeName: 'Українська',
    dir: 'ltr',
    script: 'Cyrl',
    speechLang: 'uk-UA',
    learnable: true,
    translatable: true,
    adapter: uk,
  },
];

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: LangCode): LanguageInfo | undefined {
  return byCode.get(code) ?? byCode.get(code.split('-')[0]!);
}

/** Adapter for any language; unknown languages fall back to generic normalization. */
export function adapterFor(code: LangCode): LanguageAdapter {
  return getLanguage(code)?.adapter ?? fallbackAdapter(code);
}

const fallbacks = new Map<LangCode, LanguageAdapter>();
function fallbackAdapter(code: LangCode): LanguageAdapter {
  let a = fallbacks.get(code);
  if (!a) {
    a = createBasicAdapter(code);
    fallbacks.set(code, a);
  }
  return a;
}

export const learnableLanguages = () => LANGUAGES.filter((l) => l.learnable);
export const translationLanguages = () => LANGUAGES.filter((l) => l.translatable);
