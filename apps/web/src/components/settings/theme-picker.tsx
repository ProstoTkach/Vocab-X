'use client';

import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RadioGroup } from 'radix-ui';
import { cx } from '@/lib/cx';
import { usePlayerLevel } from '@/lib/player';
import { useTheme } from '@/lib/theme';
import { getTheme, SYSTEM_THEMES, THEMES } from '@/themes/registry';
import { SYSTEM_THEME_ID } from '@/themes/types';
import { isUnlocked, parseUnlock } from '@/themes/unlock';

/** Miniature of a theme drawn with its own tokens (scoped by data-theme). */
function Swatch({ themeId, className }: { themeId: string; className?: string }) {
  return (
    <div
      data-theme={themeId}
      className={cx('flex flex-col gap-1.5 bg-bg p-2.5 group-disabled:opacity-40', className)}
    >
      <div className="h-2 w-2/3 rounded-full bg-fg" />
      <div className="h-2 w-1/2 rounded-full bg-fg-muted" />
      <div className="mt-auto flex gap-1">
        <span className="h-4 flex-1 rounded bg-accent" />
        <span className="h-4 w-4 rounded bg-success" />
        <span className="h-4 w-4 rounded bg-danger" />
      </div>
    </div>
  );
}

/** All themes, or only the ones listed in `only` (e.g. the basic ones during onboarding). */
export function ThemePicker({ only }: { only?: readonly string[] } = {}) {
  const t = useTranslations();
  const { choice, setChoice } = useTheme();
  const themes = useTranslations('themes');
  // Theme names are keys of the `themes` namespace; new themes add a key there.
  const themeName = (key: string) => themes(key as 'system');
  const level = usePlayerLevel();
  const ctx = { level, achievements: new Set<string>(), purchases: new Set<string>() };
  const options = [SYSTEM_THEME_ID, ...THEMES.map((th) => th.id)].filter(
    (id) => !only || only.includes(id),
  );

  return (
    <RadioGroup.Root
      value={choice}
      onValueChange={setChoice}
      aria-label={t('settings.theme')}
      className="grid grid-cols-2 gap-3 @lg:grid-cols-3"
    >
      {options.map((id) => {
        const theme = getTheme(id);
        const locked = theme ? !isUnlocked(theme, ctx) : false;
        const requirement = theme ? parseUnlock(theme.unlock) : null;
        return (
          <RadioGroup.Item
            key={id}
            value={id}
            disabled={locked}
            className={cx(
              'group relative flex flex-col overflow-hidden rounded-control border-2 border-line bg-surface text-start',
              'transition-colors motion-fast hover:border-line-strong',
              'data-[state=checked]:border-accent disabled:cursor-not-allowed',
            )}
          >
            {id === SYSTEM_THEME_ID ? (
              <div className="flex h-20">
                <Swatch themeId={SYSTEM_THEMES.light} className="flex-1" />
                <Swatch themeId={SYSTEM_THEMES.dark} className="flex-1" />
              </div>
            ) : (
              <Swatch themeId={id} className="h-20" />
            )}
            <span className="flex min-h-11 flex-col justify-center px-3 py-2">
              <span className="flex items-center justify-between gap-2 font-medium">
                {themeName(theme?.nameKey ?? SYSTEM_THEME_ID)}
                <RadioGroup.Indicator>
                  <Check aria-hidden className="size-4 text-accent" />
                </RadioGroup.Indicator>
                {locked && <Lock aria-hidden className="size-4 text-fg-muted" />}
              </span>
              {locked && requirement?.kind === 'level' && (
                <span className="text-xs text-fg-muted">
                  {t('settings.lockedAtLevel', { level: requirement.level })}
                </span>
              )}
            </span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
