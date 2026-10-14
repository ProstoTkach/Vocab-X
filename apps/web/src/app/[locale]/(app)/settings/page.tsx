import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { DataSettings } from '@/components/settings/data-settings';
import { LocalePicker } from '@/components/settings/locale-picker';
import { ThemePicker } from '@/components/settings/theme-picker';
import { Card, CardText, CardTitle } from '@/components/ui/card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');
  return { title: t('settings.title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const pages = await getTranslations('pages');
  const data = await getTranslations('data');
  return (
    <>
      <PageHeader title={pages('settings.title')} intro={pages('settings.intro')} />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="settings-theme">
          <CardTitle id="settings-theme">{t('theme')}</CardTitle>
          <CardText className="mt-1 mb-4">{t('themeHint')}</CardText>
          <ThemePicker />
        </Card>
        <Card aria-labelledby="settings-language">
          <CardTitle id="settings-language">{t('language')}</CardTitle>
          <CardText className="mt-1 mb-4">{t('languageHint')}</CardText>
          <LocalePicker />
        </Card>
        <Card aria-labelledby="settings-data">
          <CardTitle id="settings-data">{data('title')}</CardTitle>
          <CardText className="mt-1 mb-4">{data('hint')}</CardText>
          <DataSettings />
        </Card>
      </div>
    </>
  );
}
