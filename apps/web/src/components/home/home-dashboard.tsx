'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CharacterFigure } from '@/components/character/character-figure';
import { track } from '@/lib/analytics';
import { useGamification } from '@/lib/gamification';
import { ProgressPanel } from './progress-panel';
import { useDailyProgress } from './use-daily-progress';
import { FeedbackBadge, GoalBadge, GoalPanel, LevelBadge, LevelPanel } from './home-panels';
import {
  EnableGamification,
  MessagePanel,
  SPEAK_MS,
  SpeechBubble,
  WardrobeButton,
  useMessage,
} from './home-character';

/**
 * Home: the streak and calendar, then the character exactly in the middle with its level and
 * today's goal on one side, what it has to say and the wardrobe on the other. On phones the
 * level and the wardrobe sit in the corners of the character's window and it speaks when tapped.
 */
export function HomeDashboard() {
  const t = useTranslations('character');
  const progress = useDailyProgress();
  const { ready, enabled } = useGamification();
  const [turn, setTurn] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const text = useMessage(progress, turn);
  const success = progress ? progress.xpToday / Math.max(1, progress.goal) : 0;

  useEffect(() => {
    if (!speaking) return;
    const id = window.setTimeout(() => setSpeaking(false), SPEAK_MS);
    return () => window.clearTimeout(id);
  }, [speaking, turn]);

  return (
    <>
      <ProgressPanel progress={progress} />
      {ready && !enabled ? (
        // Without the character: today's goal and a way to bring the playful side back.
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <GoalPanel progress={progress} />
          <EnableGamification />
        </div>
      ) : (
        <section
          aria-labelledby="character-title"
          aria-busy={!ready}
          // Equal side columns keep the character exactly centred. On phones the glow around the
          // character is clipped at the sides, so it never widens the page.
          className="grid grid-cols-[minmax(0,1fr)] max-lg:-mx-4 max-lg:overflow-x-clip max-lg:px-4 gap-4 lg:grid-cols-[minmax(0,1fr)_400px_minmax(0,1fr)] lg:items-center lg:gap-6"
        >
          <h2 id="character-title" className="sr-only">
            {t('title')}
          </h2>
          {/* Phones show the level and the goal as icons over the character instead. */}
          <div className="hidden flex-col gap-4 lg:flex">
            <LevelPanel />
            <GoalPanel progress={progress} />
          </div>
          <div className="relative mx-auto w-full max-w-[400px]">
            {/* On phones the figure is a third smaller, so it leaves room for the rest of the
                page; from md up it is full size. The buttons stay in the window's corners. */}
            <div data-tour="character" className="mx-auto w-2/3 md:w-full">
              {ready && progress ? (
                <CharacterFigure
                  mood={progress.mood}
                  success={success}
                  onTap={() => {
                    track('character_tap');
                    if (speaking) return;
                    setTurn((n) => n + 1);
                    setSpeaking(true);
                  }}
                />
              ) : (
                <div className="aspect-square w-full" />
              )}
            </div>
            {ready && (
              <>
                <div className="absolute start-0 top-0 z-10 flex flex-col items-start gap-2 lg:hidden">
                  <LevelBadge />
                  <GoalBadge progress={progress} />
                </div>
                <div className="absolute end-0 top-0 z-10 lg:hidden">
                  <WardrobeButton compact />
                </div>
                <div className="absolute end-0 bottom-0 z-10">
                  <FeedbackBadge />
                </div>
                <div className="lg:hidden">
                  <SpeechBubble text={text} shown={speaking} />
                </div>
              </>
            )}
          </div>
          <div className="hidden flex-col gap-4 lg:flex">
            <MessagePanel text={text} />
            <WardrobeButton />
          </div>
        </section>
      )}
    </>
  );
}
