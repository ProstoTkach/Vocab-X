import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GoogleDisclaimer, LegalDocument, sectionList } from '@/components/legal/legal-document';
import { routing } from '@/i18n/routing';
import { infoMetadata } from '@/lib/info-metadata';
import { serverMessages } from '@/lib/legal-messages';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return infoMetadata((await serverMessages(locale)).legal.terms.title, locale, 'terms');
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { terms, google } = (await serverMessages(locale)).legal;
  const common = await getTranslations('common');
  return (
    <LegalDocument
      title={terms.title}
      updated={terms.updated}
      intro={terms.intro}
      sections={sectionList(terms.sections)}
      missing={common('contactMissing')}
      // Google's disclaimer goes after the paragraph about Google translations.
      extras={{ thirdContent: { key: 'p2', node: <GoogleDisclaimer text={google.disclaimer} /> } }}
    />
  );
}
