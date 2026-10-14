'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, type Locale } from '@/i18n/locales';
import { cx } from '@/lib/cx';

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    startTransition(() => router.replace(pathname, { locale: next as Locale }));
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('language')}
        className={cx(
          'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2 text-sm font-semibold text-fg-muted uppercase',
          'transition-colors motion-fast hover:bg-surface-2 hover:text-fg disabled:opacity-50',
          className,
        )}
        disabled={pending}
      >
        <Languages aria-hidden className="size-5" />
        <span aria-hidden>{locale}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="start"
          className="z-50 min-w-44 rounded-control border border-line bg-surface p-1 text-fg shadow-pop"
        >
          <DropdownMenu.RadioGroup value={locale} onValueChange={change}>
            {LOCALES.map((l) => (
              <DropdownMenu.RadioItem
                key={l.code}
                value={l.code}
                lang={l.code}
                className={cx(
                  'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 outline-none',
                  'data-[highlighted]:bg-surface-2 data-[state=checked]:font-semibold',
                )}
              >
                {l.nativeName}
                <DropdownMenu.ItemIndicator className="size-2 rounded-full bg-accent" />
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
