'use client';

import type { Cloze } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { Fragment, type Ref } from 'react';
import { cx } from '@/lib/cx';

export type GapTone = 'right' | 'near' | 'wrong';
const GAP_TONE: Record<GapTone, string> = {
  right: 'bg-success/15 text-success',
  near: 'bg-warning/15 text-warning',
  wrong: 'bg-danger/10 text-danger',
};

/**
 * An example with the word left out, every time it occurs. Once `filled`, the word stands in
 * the gaps, coloured by how it was answered (a typo in yellow).
 */
export function ClozeText({
  cloze,
  lang,
  filled = false,
  tone = 'right',
  className,
  ref,
}: {
  cloze: Cloze;
  lang: string;
  filled?: boolean;
  tone?: GapTone;
  className?: string;
  ref?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p ref={ref} lang={lang} className={cx('text-balance break-words', className)}>
      {cloze.answers.map((a, i) => (
        <Fragment key={i}>
          {cloze.parts[i]}
          <Gap answer={a} filled={filled} tone={tone} />
        </Fragment>
      ))}
      {cloze.parts.at(-1)}
    </p>
  );
}

/** The left-out word: a line as long as the word, then the word itself once answered. */
function Gap({ answer, filled, tone }: { answer: string; filled: boolean; tone: GapTone }) {
  const t = useTranslations('review');
  if (!filled)
    return (
      <span
        aria-label={t('sentence.gap')}
        className="mx-0.5 inline-block translate-y-1 border-b-2 border-accent align-baseline"
        style={{ width: `${Math.max(3, Array.from(answer).length)}ch` }}
      />
    );
  return (
    <mark className={cx('rounded-md px-1 font-semibold motion-safe:animate-pop', GAP_TONE[tone])}>
      {answer}
    </mark>
  );
}
