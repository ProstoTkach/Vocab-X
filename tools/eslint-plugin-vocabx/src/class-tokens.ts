// Classification of Tailwind class tokens that break the design system.

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILS =
  'bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|inset-shadow|drop-shadow|accent|caret';

const RAW_PALETTE = new RegExp(
  `^-?(?:${COLOR_UTILS})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/\\S+)?$`,
);
const ARBITRARY_COLOR = /-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color-mix\(|color\()/;
const PHYSICAL = [
  /^-?(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-/,
  /^(?:border-[lr]|rounded-(?:[lr]|tl|tr|bl|br))(?:-|$)/,
  /^(?:text-left|text-right|float-left|float-right|clear-left|clear-right)$/,
];

export type Violation =
  | { kind: 'dark'; token: string }
  | { kind: 'raw-color'; token: string }
  | { kind: 'physical'; token: string };

/** Splits "md:hover:bg-red-500" into variants and utility, ignoring ":" inside brackets. */
function splitVariants(token: string): { variants: string[]; utility: string } {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    if (ch === ':' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  return { variants: parts, utility: cur.replace(/^!/, '').replace(/!$/, '') };
}

export function classify(token: string): Violation | null {
  const { variants, utility } = splitVariants(token);
  if (variants.includes('dark')) return { kind: 'dark', token };
  if (RAW_PALETTE.test(utility) || ARBITRARY_COLOR.test(utility))
    return { kind: 'raw-color', token };
  if (PHYSICAL.some((re) => re.test(utility))) return { kind: 'physical', token };
  return null;
}

export function violationsIn(text: string): Violation[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(classify)
    .filter((v): v is Violation => v !== null);
}
