import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileView } from '@/components/profile/profile-view';
import { signInConfigured } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');
  return { title: t('profile.title') };
}

export default function Page() {
  return <ProfileView accounts={signInConfigured()} />;
}
