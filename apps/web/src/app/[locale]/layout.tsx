import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { localeInfo, SERVER_ONLY_NAMESPACES } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import { bootScript } from '@/lib/boot-script';
import { BootScriptTag } from '@/lib/boot-script-tag';
import { themesCss } from '@/themes/css';
import { DEFAULT_THEME, THEMES } from '@/themes/registry';
import { inter, manrope } from '../fonts';
import { Providers } from '../providers';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** The address shared links point to (images in link previews need it in full). */
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://vocabx-sigma.vercel.app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  // What a shared link shows (messengers, social networks): an invitation, with the wolf.
  const share = { title: t('shareTitle'), description: t('shareDescription') };
  const image = { url: '/og.png', width: 1200, height: 630, alt: 'VocabX' };
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('title'), template: '%s · VocabX' },
    description: t('description'),
    openGraph: {
      ...share,
      siteName: 'VocabX',
      type: 'website',
      locale: locale === 'uk' ? 'uk_UA' : 'en_US',
      images: [image],
    },
    twitter: { card: 'summary_large_image', ...share, images: [image.url] },
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
  const messages = await getMessages();
  const clientMessages = Object.fromEntries(
    Object.entries(messages).filter(
      ([ns]) => !(SERVER_ONLY_NAMESPACES as readonly string[]).includes(ns),
    ),
  );

  return (
    <html
      lang={locale}
      dir={info.dir}
      data-script={info.script}
      className={`${inter.variable} ${manrope.variable}`}
      // Theme attributes (data-theme, color-scheme) are owned by the boot script and
      // ThemeProvider, not React: rendering them here would reset the theme whenever the
      // root layout re-renders, e.g. on a locale switch.
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themesCss(THEMES) }} />
        <BootScriptTag code={bootScript()} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider messages={clientMessages}>
          <Providers dir={info.dir}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
