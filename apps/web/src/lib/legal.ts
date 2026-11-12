// Helpers for the legal pages: the shape of the texts in messages/*/legal.json and the links
// to services named in them (links live in code, not in the texts).

export type Block = { kind: 'p'; key: string; text: string } | { kind: 'ul'; items: string[] };

/**
 * A section's `blocks` object in reading order: `pN` is a paragraph, `liN` a list item;
 * consecutive items make one list. Key order in the JSON is the page order.
 */
export function groupBlocks(blocks: Record<string, string>): Block[] {
  const out: Block[] = [];
  for (const [key, text] of Object.entries(blocks)) {
    if (/^li\d+$/.test(key)) {
      const last = out.at(-1);
      if (last?.kind === 'ul') last.items.push(text);
      else out.push({ kind: 'ul', items: [text] });
    } else if (/^p\d+$/.test(key)) out.push({ kind: 'p', key, text });
    else throw new Error(`Unknown legal block key: ${key}`);
  }
  return out;
}

/** Services named in the texts and where each one lives. Longer names go first. */
export const SERVICE_LINKS: readonly { name: string; href: string }[] = [
  { name: 'Google Translate', href: 'https://translate.google.com' },
  { name: 'Free Dictionary API', href: 'https://dictionaryapi.dev' },
  { name: 'Free Dictionary', href: 'https://dictionaryapi.dev' },
  { name: 'Wiktionary', href: 'https://www.wiktionary.org' },
  { name: 'Tatoeba', href: 'https://tatoeba.org' },
  { name: 'Lucide', href: 'https://lucide.dev' },
  { name: 'Next.js', href: 'https://nextjs.org' },
  { name: 'Telegram', href: 'https://telegram.org' },
  { name: 'Vercel', href: 'https://vercel.com' },
  { name: 'Neon', href: 'https://neon.tech' },
  { name: 'Google', href: 'https://policies.google.com' },
];

export type Piece =
  { kind: 'text'; text: string } | { kind: 'email' } | { kind: 'link'; text: string; href: string };

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
const PATTERN = new RegExp(
  `\\{email\\}|\\b(${SERVICE_LINKS.map((s) => s.name.replace(ESCAPE, '\\$&')).join('|')})\\b`,
  'g',
);

/**
 * Cuts a paragraph into text, the `{email}` argument and the first mention of each service
 * (one link per service in a paragraph is enough).
 */
export function splitText(text: string): Piece[] {
  const out: Piece[] = [];
  const linked = new Set<string>();
  let from = 0;
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index;
    const piece: Piece | null =
      m[0] === '{email}'
        ? { kind: 'email' }
        : !linked.has(m[0])
          ? { kind: 'link', text: m[0], href: SERVICE_LINKS.find((s) => s.name === m[0])!.href }
          : null;
    if (!piece) continue;
    linked.add(m[0]);
    if (at > from) out.push({ kind: 'text', text: text.slice(from, at) });
    out.push(piece);
    from = at + m[0].length;
  }
  if (from < text.length) out.push({ kind: 'text', text: text.slice(from) });
  return out;
}
