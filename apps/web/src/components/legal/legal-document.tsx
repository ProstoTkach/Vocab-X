import type { ReactNode } from 'react';
import { CONTACT_EMAIL } from '@/config/site';
import { groupBlocks, splitText, type Piece } from '@/lib/legal';

type Blocks = Record<string, string>;
export type LegalSection = { title: string; blocks: Blocks };

/** The sections of a legal text as the messages keep them, in page order: `{ id: section }`. */
export const sectionList = (raw: unknown) =>
  Object.entries(raw as Record<string, LegalSection>).map(([id, section]) => ({ id, ...section }));

const LINK =
  'text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent';

/** A paragraph's text with the e-mail address and the first mention of each service linked. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {splitText(text).map((piece: Piece, i) => {
        if (piece.kind === 'text') return piece.text;
        if (piece.kind === 'link')
          return (
            <a key={i} href={piece.href} target="_blank" rel="noopener noreferrer" className={LINK}>
              {piece.text}
            </a>
          );
        return (
          <a key={i} href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
            {CONTACT_EMAIL}
          </a>
        );
      })}
    </>
  );
}

/** One section's paragraphs and lists, in the order of the keys in the messages. */
export function LegalBlocks({
  blocks,
  after,
}: {
  blocks: Blocks;
  /** Extra content placed after the paragraph with this key (e.g. `p2`). */
  after?: { key: string; node: ReactNode };
}) {
  return (
    <>
      {groupBlocks(blocks).map((block, i) => {
        const extra = block.kind === 'p' && after?.key === block.key ? after.node : null;
        return block.kind === 'ul' ? (
          <ul key={i} className="list-disc space-y-1.5 ps-6 marker:text-fg-muted">
            {block.items.map((item) => (
              <li key={item}>
                <Rich text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <div key={i} className="space-y-3">
            <p>
              <Rich text={block.text} />
            </p>
            {extra}
          </div>
        );
      })}
    </>
  );
}

/** Title, date, intro and sections of a legal text (summary first, when the text has one). */
export function LegalDocument({
  title,
  updated,
  intro,
  summary,
  sections,
  extras = {},
}: {
  title: string;
  updated: string;
  intro: string;
  summary?: LegalSection;
  sections: (LegalSection & { id: string })[];
  /** Content added after one paragraph of a section: { [section id]: { key, node } }. */
  extras?: Record<string, { key: string; node: ReactNode }>;
}) {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-display font-bold text-balance">{title}</h1>
        <p className="text-sm text-fg-muted">{updated}</p>
        <p className="max-w-prose text-fg-muted text-pretty">{intro}</p>
      </header>
      {summary && (
        <section
          aria-labelledby="legal-summary"
          className="space-y-3 rounded-card border border-line/70 bg-surface p-5 shadow-card"
        >
          <h2 id="legal-summary" className="font-display text-lg font-semibold">
            {summary.title}
          </h2>
          <LegalBlocks blocks={summary.blocks} />
        </section>
      )}
      {sections.map((section, i) => (
        <section
          key={section.id}
          aria-labelledby={`legal-${i}`}
          className="max-w-prose space-y-3 text-pretty"
        >
          <h2 id={`legal-${i}`} className="font-display text-title font-semibold">
            {section.title}
          </h2>
          <LegalBlocks
            blocks={section.blocks}

            {...(extras[section.id] ? { after: extras[section.id]! } : {})}
          />
        </section>
      ))}
    </article>
  );
}

/** Google's disclaimer, in English as Google gives it. */
export function GoogleDisclaimer({ text }: { text: string }) {
  return (
    <blockquote lang="en" className="border-s-2 border-line-strong ps-4 text-sm text-fg-muted">
      {text}
    </blockquote>
  );
}
