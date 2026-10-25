// A pasted word list: one word per line, fields split by a separator — the word being learned,
// its translation, then an optional example sentence.

export const FIELD_SEPARATORS = ['tab', 'dash', 'semicolon'] as const;
export type FieldSeparator = (typeof FIELD_SEPARATORS)[number];

export interface WordListRow {
  term: string;
  translation: string;
  example: string;
}

export interface ParsedWordList {
  rows: WordListRow[];
  separator: FieldSeparator;
}

/** Separators between fields; whitespace around them is part of the separator. */
const PATTERNS: Record<FieldSeparator, RegExp> = {
  // Two or more spaces count as a tab: tabs often turn into spaces when copied.
  tab: /\s*(?:\t| {2,})\s*/g,
  // A dash with spaces around it, so hyphenated words ("well-known") stay whole.
  dash: /\s+[-–—]\s+/g,
  semicolon: /\s*;\s*/g,
};

/** Splits into at most `n` parts: the last part keeps any further separators (an example). */
function splitN(line: string, re: RegExp, n: number): string[] {
  const parts: string[] = [];
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (parts.length === n - 1) break;
    parts.push(line.slice(last, m.index));
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));
  return parts;
}

/**
 * Non-empty lines. Only spaces are trimmed: a leading tab is an empty first field (a row
 * without a word).
 */
const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[ \u00a0]+|[ \u00a0]+$/g, ''))
    .filter((l) => l.trim());

/**
 * The separator a pasted text most likely uses: real tabs (spreadsheets) first, then whichever
 * of " - ", ";" and double spaces more lines have. Tabs when nothing matches.
 */
export function detectSeparator(text: string): FieldSeparator {
  const lines = linesOf(text);
  const count = (re: RegExp) => lines.filter((l) => new RegExp(re.source).test(l)).length;
  if (count(/\t/) > 0) return 'tab';
  const dash = count(PATTERNS.dash);
  const semicolon = count(PATTERNS.semicolon);
  const spaces = count(/ {2,}/);
  if (dash >= semicolon && dash > spaces) return 'dash';
  if (semicolon > dash && semicolon > spaces) return 'semicolon';
  return 'tab';
}

/**
 * One row per non-empty line; missing fields are empty strings for the learner to fill in.
 * Words and translations are lowercased (lists often start each line with a capital); the
 * example is a sentence and keeps its case.
 */
export function parseWordList(text: string, separator: FieldSeparator): ParsedWordList {
  const rows = linesOf(text).map((line) => {
    const [term = '', translation = '', example = ''] = splitN(line, PATTERNS[separator], 3).map(
      (s) => s.trim(),
    );
    return {
      term: term.toLocaleLowerCase(),
      translation: translation.toLocaleLowerCase(),
      example,
    };
  });
  return { rows, separator };
}

/** Translation variants written in one field: "дохід, виручка" or "дохід / виручка". */
export function splitTranslations(field: string): string[] {
  return [
    ...new Set(
      field
        .split(/\s*[,;/]\s*/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
