import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LegalDocument, sectionList } from '@/components/legal/legal-document';
import { routing } from '@/i18n/routing';
import { infoMetadata } from '@/lib/info-metadata';
import { serverMessages } from '@/lib/legal-messages';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return infoMetadata((await serverMessages(locale)).legal.privacy.title, locale, 'privacy');
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { privacy } = (await serverMessages(locale)).legal;
  const common = await getTranslations('common');
  return (
    <LegalDocument
      title={privacy.title}
      updated={privacy.updated}
      intro={privacy.intro}
      summary={privacy.summary}
      sections={sectionList(privacy.sections)}
      missing={common('contactMissing')}
    />
  );
}
