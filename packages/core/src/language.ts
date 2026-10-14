/** BCP 47 language tag, e.g. "en", "de", "es", "uk", "pt-BR". */
export type LangCode = string;

/**
 * Hides language-specific text handling from the algorithms. Adding a language means
 * registering a new adapter; grading, stacks and coverage never branch on the language.
 */
export interface LanguageAdapter {
  readonly code: LangCode;
  /** Canonical form for strict comparison: NFC, case, whitespace, apostrophes. */
  normalize(text: string): string;
  /** Lenient form: additionally drops diacritics and language-specific variants (ß → ss). */
  fold(text: string): string;
  /** Dictionary form of a single token. Identity unless the language provides more. */
  lemmatize(token: string): string;
  /** Word tokens in reading order (used for subtitle coverage). */
  tokenize(text: string): string[];
}

const APOSTROPHES = /[\u2018\u2019\u201B\u02BC\u02B9\u0060\u00B4]/g;
const DASHES = /[\u2010-\u2015\u2212]/g;
const WORD = /[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*/gu;

/** NFC, unified apostrophes and dashes, collapsed whitespace, locale-aware lower case. */
export function baseNormalize(text: string, locale: LangCode): string {
  return text
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase(locale);
}

export function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC');
}

export interface BasicAdapterOptions {
  /** Extra replacements applied by fold() after diacritics are removed, e.g. { ß: 'ss' }. */
  foldMap?: Readonly<Record<string, string>>;
  /**
   * Leading words that may be omitted in answers (articles, the infinitive "to").
   * Stripped from both sides before comparison.
   */
  optionalPrefixes?: readonly string[];
  lemmatize?: (token: string) => string;
}

export function createBasicAdapter(code: LangCode, o: BasicAdapterOptions = {}): LanguageAdapter {
  const prefixes = (o.optionalPrefixes ?? []).map((p) => baseNormalize(p, code));
  const stripPrefix = (s: string) => {
    for (const p of prefixes) if (s.startsWith(`${p} `)) return s.slice(p.length + 1);
    return s;
  };
  const normalize = (text: string) => stripPrefix(baseNormalize(text, code));
  return {
    code,
    normalize,
    fold(text) {
      let s = stripDiacritics(normalize(text));
      for (const [from, to] of Object.entries(o.foldMap ?? {})) s = s.split(from).join(to);
      return s;
    },
    lemmatize: o.lemmatize ?? ((t) => baseNormalize(t, code)),
    tokenize: (text) => text.normalize('NFC').replace(APOSTROPHES, "'").match(WORD) ?? [],
  };
}
