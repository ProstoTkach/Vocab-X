'use client';

import type { GamificationMode } from '@vocabx/core';
import { Award, CircleOff, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RadioGroup } from 'radix-ui';
import { RadioCard } from '@/components/ui/choice';
import { useGamification } from '@/lib/gamification';

const MODES = [
  { value: 'max', icon: PartyPopper },
  { value: 'medium', icon: Award },
  { value: 'off', icon: CircleOff },
] as const satisfies readonly { value: GamificationMode; icon: unknown }[];

/** Off, medium or maximum gamification; applied everywhere at once. */
export function GamificationSettings() {
  const t = useTranslations('settings');
  const { ready, mode, setMode } = useGamification();
  if (!ready) return <div aria-busy className="h-48" />;
  return (
    <RadioGroup.Root
      value={mode}
      onValueChange={(v) => setMode(v as GamificationMode)}
      aria-label={t('gamification')}
      className="flex flex-col gap-2"
    >
      {MODES.map(({ value, icon: Icon }) => (
        <RadioCard
          key={value}
          value={value}
          label={t(`gamificationModes.${value}`)}
          description={t(`gamificationModes.${value}Hint`)}
          icon={<Icon aria-hidden className="size-5 shrink-0 text-accent" />}
        />
      ))}
    </RadioGroup.Root>
  );
}
