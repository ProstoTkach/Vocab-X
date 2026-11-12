import type { ExampleCredit as Credit } from '@vocabx/core';
import { useTranslations } from 'next-intl';

/**
 * "Tatoeba · author" under a sentence taken from Tatoeba, linking to it: the sentences are
 * CC BY, which asks for the author to be named. Nothing for the learner's own sentences.
 */
export function ExampleCredit({ credit }: { credit: Credit | undefined }) {
  const t = useTranslations('common.exampleCredit');
  if (!credit) return null;
  return (
    <a
      href={`https://tatoeba.org/sentences/show/${credit.id}`}
      target="_blank"
      rel="noopener noreferrer"
      title={t('title', { id: credit.id, author: credit.by, license: credit.license })}
      className="mt-1 block text-xs text-fg-muted underline-offset-2 hover:underline"
    >
      {t('label', { author: credit.by })}
    </a>
  );
}
