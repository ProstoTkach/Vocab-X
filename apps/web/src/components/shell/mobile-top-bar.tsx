'use client';

import { MessageSquareHeart, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback/feedback-provider';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

export function MobileTopBar() {
  const t = useTranslations('nav');
  const feedback = useFeedback();
  return (
    <header className="glass sticky top-0 z-30 flex h-(--vx-chrome-top) items-center justify-between gap-2 border-b border-line/60 px-4 pt-safe md:hidden">
      <Logo />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => feedback.open('topbar')}
          aria-label={t('feedback')}
          className="inline-flex size-11 items-center justify-center rounded-control text-accent transition-colors motion-fast hover:bg-surface-2"
        >
          <MessageSquareHeart aria-hidden className="size-5" />
        </button>
        <LanguageSwitcher />
        <Link
          href="/settings"
          aria-label={t('settings')}
          className="inline-flex size-11 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:bg-surface-2 hover:text-fg"
        >
          <Settings aria-hidden className="size-5" />
        </Link>
      </div>
    </header>
  );
}
