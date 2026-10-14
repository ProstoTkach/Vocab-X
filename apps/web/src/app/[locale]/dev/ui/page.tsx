import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { THEMES } from '@/themes/registry';
import { ComponentGallery } from './gallery';

/** Development-only, unless explicitly enabled for screenshot runs. */
const enabled =
  process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEV_UI === '1';

export const metadata: Metadata = { robots: { index: false } };

export default async function DevUiPage() {
  if (!enabled) notFound();
  const t = await getTranslations('devui');
  const themes = await getTranslations('themes');
  return (
    <main className="min-h-dvh bg-bg px-4 py-8 md:px-8">
      <h1 className="font-display text-display font-bold">{t('title')}</h1>
      <p className="mt-2 text-fg-muted">{t('intro')}</p>
      <div className="mt-8 grid gap-8 2xl:grid-cols-2">
        {THEMES.map((theme) => (
          <section
            key={theme.id}
            data-theme={theme.id}
            data-testid={`theme-${theme.id}`}
            aria-labelledby={`theme-${theme.id}-title`}
            className="min-w-0 rounded-card border border-line bg-bg p-4 text-fg md:p-6"
          >
            <h2
              id={`theme-${theme.id}-title`}
              className="mb-4 font-display text-title font-semibold"
            >
              {t('themeSection', { name: themes(theme.nameKey as 'light') })}
            </h2>
            <ComponentGallery />
          </section>
        ))}
      </div>
    </main>
  );
}
