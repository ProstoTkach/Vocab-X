'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { useDevTools } from '@/lib/dev-tools';

export function DevToggle() {
  const t = useTranslations('dev');
  const { enabled, setEnabled } = useDevTools();
  return (
    <div>
      <Switch label={t('toggle')} checked={enabled} onCheckedChange={setEnabled} />
      <p className="text-sm text-fg-muted">{t('toggleHint')}</p>
    </div>
  );
}
