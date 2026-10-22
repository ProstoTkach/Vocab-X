'use client';

import { xpForLevel } from '@vocabx/core';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cx } from '@/lib/cx';
import { usePlayer } from '@/lib/player';
import { rewardsByLevel, RewardChips } from './level-rewards';

/** Levels listed at least, even when nothing is behind higher ones. */
const MIN_LEVELS = 5;

/**
 * Every level on one long bar, top to bottom, with what each one opens (wardrobe items and
 * themes). The bar is filled up to where the learner is now.
 */
export function LevelsDialog({ trigger }: { trigger: ReactNode }) {
  const t = useTranslations('character');
  const { level, xpInLevel, xpForNext, xpTotal } = usePlayer();
  const rewards = rewardsByLevel();
  const last = Math.max(MIN_LEVELS, level + 2, ...rewards.keys());
  const levels = Array.from({ length: last }, (_, i) => i + 1);

  return (
    <Dialog>
      {trigger}
      <DialogContent
        title={t('levelsTitle')}
        description={t('levelsHint', { level, xp: xpTotal })}
        footer={
          <DialogClose asChild>
            <Button>{t('done')}</Button>
          </DialogClose>
        }
      >
        <ol className="flex flex-col">
          {levels.map((l) => {
            const reached = l <= level;
            const current = l === level;
            // The segment below a level leads to the next one.
            const fill = l < level ? 100 : current ? (xpInLevel / xpForNext) * 100 : 0;
            const reward = rewards.get(l);
            return (
              <li key={l} className="flex gap-4" aria-current={current ? 'step' : undefined}>
                <div className="flex w-9 shrink-0 flex-col items-center">
                  <span
                    className={cx(
                      'inline-flex size-9 shrink-0 items-center justify-center rounded-full font-display font-bold tabular-nums',
                      reached
                        ? 'bg-brand text-on-accent shadow-glow'
                        : 'bg-surface-3 text-fg-muted',
                      current && 'ring-4 ring-accent/25',
                    )}
                  >
                    {l < level ? <Check aria-hidden className="size-4" /> : l}
                  </span>
                  {l < last && (
                    <span className="flex min-h-10 flex-1 justify-center py-1">
                      <ProgressBar
                        value={fill}
                        label={t('levelSegment', { from: l, to: l + 1 })}
                        orientation="vertical"
                        size="sm"
                      />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-1.5 pb-5">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cx('font-semibold', !reached && 'text-fg-muted')}>
                      {t('level', { level: l })}
                    </span>
                    <span className="text-xs text-fg-muted tabular-nums">
                      {t('levelAt', { xp: xpForLevel(l) })}
                    </span>
                    {current && (
                      <span className="text-xs font-semibold text-accent">{t('levelNow')}</span>
                    )}
                  </p>
                  {reward ? (
                    <RewardChips reward={reward} className="mt-2" />
                  ) : (
                    <p className="mt-0.5 text-sm text-fg-muted">{t('levelNoRewards')}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
