import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { localeInfo } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import { bootScript } from '@/lib/boot-script';
import { themesCss } from '@/themes/css';
import { DEFAULT_THEME, THEMES } from '@/themes/registry';
import { inter, manrope } from '../fonts';
import { Providers } from '../providers';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: { default: t('title'), template: '%s · Vocabix' },
    description: t('description'),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: DEFAULT_THEME.colors.bg,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const info = localeInfo(locale);

  return (
    <html
      lang={locale}
      dir={info.dir}
      data-theme={DEFAULT_THEME.id}
      data-script={info.script}
      className={`${inter.variable} ${manrope.variable}`}
      // The boot script sets theme attributes before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themesCss(THEMES) }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider>
          <Providers dir={info.dir}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
