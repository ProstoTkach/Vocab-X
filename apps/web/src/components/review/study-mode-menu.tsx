'use client';

import type { StudyMode } from '@vocabx/core';
import { FlaskConical, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useCloseOnBack } from '@/lib/close-on-back';
import { useDevTools } from '@/lib/dev-tools';
import { cx } from '@/lib/cx';

export const STUDY_MODES: readonly StudyMode[] = ['cards', 'quiz', 'sentences'];

const itemClass =
  'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-surface-2';

/**
 * Above the card, between the task and its level: switches how the words are reviewed (the
 * same words, levels and progress), with a way to the lab where any mode and level can be tried.
 */
export function StudyModeMenu({
  mode,
  onChange,
}: {
  mode: StudyMode;
  onChange: (mode: StudyMode) => void;
}) {
  const t = useTranslations('review');
  const modes = useTranslations('settings.studyModes');
  const router = useRouter();
  const { unlocked } = useDevTools();
  const [open, setOpen] = useState(false);
  useCloseOnBack(open, () => setOpen(false));
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        className={cx(
          'inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-fg-muted',
          'transition-colors motion-fast hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2',
        )}
      >
        <SlidersHorizontal aria-hidden className="size-3.5" />
        {t('modeMenu')}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="center"
          collisionPadding={12}
          className="z-50 min-w-56 rounded-control border border-line bg-surface p-1 text-fg shadow-pop"
        >
          <DropdownMenu.RadioGroup value={mode} onValueChange={(v) => onChange(v as StudyMode)}>
            {STUDY_MODES.map((m) => (
              <DropdownMenu.RadioItem
                key={m}
                value={m}
                className={cx(itemClass, 'data-[state=checked]:font-semibold')}
              >
                {modes(m)}
                <DropdownMenu.ItemIndicator className="size-2 rounded-full bg-accent" />
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {/* The lab belongs to the developer mode. Through the app's router, so the menu's entry
          in the history gives way to the page. */}
          {unlocked && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item onSelect={() => router.push('/review/lab')} className={itemClass}>
                <span className="inline-flex items-center gap-2">
                  <FlaskConical aria-hidden className="size-4 text-accent" />
                  {t('lab.title')}
                </span>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
