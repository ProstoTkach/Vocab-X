'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { useInternal } from '@/components/analytics/analytics-provider';
import { useDevTools } from '@/lib/dev-tools';

/** Developers and testers only (?internal=1 or localhost); others never see the panel. */
export function DevToggle() {
  const t = useTranslations('dev');
  const { enabled, setEnabled } = useDevTools();
  const internal = useInternal();
  if (!internal) return null;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <Switch label={t('toggle')} checked={enabled} onCheckedChange={setEnabled} />
      <p className="text-sm text-fg-muted">{t('toggleHint')}</p>
    </div>
  );
}
