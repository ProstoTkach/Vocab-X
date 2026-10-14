'use client';

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { RadioGroup } from 'radix-ui';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, type Locale } from '@/i18n/locales';
import { cx } from '@/lib/cx';

export function LocalePicker() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <RadioGroup.Root
      value={locale}
      onValueChange={(next) =>
        startTransition(() => router.replace(pathname, { locale: next as Locale }))
      }
      aria-label={t('language')}
      aria-busy={pending}
      className="grid gap-2 @md:grid-cols-2"
    >
      {LOCALES.map((l) => (
        <RadioGroup.Item
          key={l.code}
          value={l.code}
          lang={l.code}
          className={cx(
            'flex min-h-12 items-center justify-between gap-3 rounded-control border-2 border-line bg-surface px-4 text-start font-medium',
            'transition-colors motion-fast hover:border-line-strong data-[state=checked]:border-accent',
          )}
        >
          {l.nativeName}
          <RadioGroup.Indicator>
            <Check aria-hidden className="size-4 text-accent" />
          </RadioGroup.Indicator>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
