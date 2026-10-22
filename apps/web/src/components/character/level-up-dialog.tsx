'use client';

import { Crown, Gift } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/ui/count-up';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFeedback } from '@/components/feedback/feedback-provider';
import { useGamification } from '@/lib/gamification';
import { usePlayer } from '@/lib/player';
import { useRepos } from '@/lib/repos';
import { rewardsByLevel, RewardChips, type LevelReward } from './level-rewards';

/**
 * Congratulates on a new player level, once: what the new level(s) opened and how much XP the
 * next one takes, counted up. The last congratulated level is kept in settings, so jumping
 * several levels at once lists all of their rewards together.
 */
export function LevelUpDialog() {
  const t = useTranslations('character');
  const repos = useRepos();
  const { ready, level, xpInLevel, xpForNext } = usePlayer();
  const { ready: gameReady, enabled, animated } = useGamification();
  const reduced = useReducedMotion();
  const feedback = useFeedback();
  const [seen, setSeen] = useState<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (!ctrl.signal.aborted) setSeen(s.levelSeen);
    });
    return () => ctrl.abort();
  }, [repos]);

  const open = ready && gameReady && enabled && seen !== null && level > seen;
  const close = () => {
    setSeen(level);
    // A feedback invitation may be waiting for this window to close.
    void repos.settings.update({ levelSeen: level }).then(feedback.recheck);
  };

  // Rewards of every level reached since the last congratulation.
  const rewards = rewardsByLevel();
  const opened: LevelReward = { items: [], themes: [] };
  for (let l = (seen ?? level) + 1; l <= level; l++) {
    const r = rewards.get(l);
    if (r) {
      opened.items.push(...r.items);
      opened.themes.push(...r.themes);
    }
  }
  const nothing = opened.items.length + opened.themes.length === 0;
  const move = animated && !reduced;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        title={t('levelUpTitle', { level })}
        description={t('levelUpText')}
        footer={
          <Button className="justify-center" onClick={close}>
            {t('levelUpDone')}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <motion.span
            className="inline-flex size-20 items-center justify-center rounded-full bg-brand text-on-accent shadow-glow"
            initial={move ? { scale: 0.4, rotate: -25 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.1 }}
          >
            <Crown aria-hidden className="size-10" />
          </motion.span>

          <section className="w-full text-start">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Gift aria-hidden className="size-4 text-accent" />
              {t('levelUpOpened')}
            </h3>
            {nothing ? (
              <p className="text-sm text-fg-muted">{t('levelUpNothing')}</p>
            ) : (
              <RewardChips reward={opened} />
            )}
          </section>

          <p className="w-full rounded-control bg-surface-2 p-4 text-sm">
            {t.rich('levelUpNext', {
              next: level + 1,
              xp: () => (
                <CountUp
                  value={xpForNext - xpInLevel}
                  animated={animated}
                  className="font-display text-2xl font-bold text-accent"
                />
              ),
            })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
