import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/page-header';
import { DevToggle } from '@/components/dev/dev-toggle';
import { DataSettings } from '@/components/settings/data-settings';
import { DictionarySources } from '@/components/settings/dictionary-sources';
import { GamificationSettings } from '@/components/settings/gamification-settings';
import { LocalePicker } from '@/components/settings/locale-picker';
import { StudySettingsForm } from '@/components/settings/study-settings';
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
      <PageHeader title={pages('settings.title')} />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="settings-study">
          <CardTitle id="settings-study">{t('study')}</CardTitle>
          <CardText className="mt-1 mb-5">{t('studyHint')}</CardText>
          <StudySettingsForm />
        </Card>
        <Card aria-labelledby="settings-gamification">
          <CardTitle id="settings-gamification">{t('gamification')}</CardTitle>
          <CardText className="mt-1 mb-4">{t('gamificationHint')}</CardText>
          <GamificationSettings />
        </Card>
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
        <Card aria-labelledby="settings-dictionaries">
          <CardTitle id="settings-dictionaries">{t('dictionaries')}</CardTitle>
          <CardText className="mt-1 mb-4">{t('dictionariesHint')}</CardText>
          <DictionarySources />
        </Card>
        <Card aria-labelledby="settings-data">
          <CardTitle id="settings-data">{data('title')}</CardTitle>
          <CardText className="mt-1 mb-4">{data('hint')}</CardText>
          <DataSettings />
          <hr className="my-4 border-line" />
          <DevToggle />
        </Card>
      </div>
    </>
  );
}
