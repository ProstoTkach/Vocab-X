import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GoogleDisclaimer, LegalDocument } from '@/components/legal/legal-document';
import { routing } from '@/i18n/routing';
import { infoMetadata } from '@/lib/info-metadata';
import { SERVICE_LINKS } from '@/lib/legal';
import { serverMessages } from '@/lib/legal-messages';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return infoMetadata((await serverMessages(locale)).credits.title, locale, 'credits');
}

/** Sections in reading order; each is one title and one paragraph (see the credits messages). */
const SECTIONS = [
  'translations',
  'sentences',
  'definitions',
  'fonts',
  'icons',
  'art',
  'libraries',
  'google',
] as const;

export default async function CreditsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { credits, legal } = await serverMessages(locale);
  const common = await getTranslations('common');
  const translate = SERVICE_LINKS.find((s) => s.name === 'Google Translate')!;
  return (
    <LegalDocument
      title={credits.title}
      updated={credits.updated}
      intro={credits.intro}
      sections={SECTIONS.map((id) => ({
        id,
        title: credits.sections[id]!.title,
        blocks: { p1: credits.sections[id]!.text },
      }))}
      missing={common('contactMissing')}
      extras={{
        translations: {
          key: 'p1',
          node: (
            <p className="text-sm font-semibold">
              <a
                href={translate.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
              >
                {legal.google.attribution}
              </a>
            </p>
          ),
        },
        google: { key: 'p1', node: <GoogleDisclaimer text={legal.google.disclaimer} /> },
      }}
    />
  );
}
