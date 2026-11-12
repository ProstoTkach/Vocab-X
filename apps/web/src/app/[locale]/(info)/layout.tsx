import type { ReactNode } from 'react';
import { LegalLinks } from '@/components/legal/legal-links';
import { LanguageSwitcher } from '@/components/shell/language-switcher';
import { Logo } from '@/components/shell/logo';

/** Pages for reading, outside the app: the privacy policy, the terms and the credits. */
export default function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-safe sm:px-6">
      <header className="flex items-center justify-between gap-3 py-3">
        <Logo />
        <LanguageSwitcher />
      </header>
      <main className="flex-1 py-6">{children}</main>
      <footer className="border-t border-line/60 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <LegalLinks />
      </footer>
    </div>
  );
}
