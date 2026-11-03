'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { track } from '@/lib/analytics';
import { applyFontScale } from '@/lib/boot-script';
import { useRepos } from '@/lib/repos';

const SIZES = [
  { value: '0.9', key: 'fontSmall' },
  { value: '1', key: 'fontNormal' },
  { value: '1.1', key: 'fontLarge' },
  { value: '1.25', key: 'fontHuge' },
] as const;

/**
 * The size of all text in the app (everything is sized in rem, so the root font size scales
 * the whole interface). Applied at once; the boot script applies it before the first paint.
 */
export function TextSizePicker() {
  const t = useTranslations('settings');
  const repos = useRepos();
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void repos.settings.get().then((s) => {
      if (!ctrl.signal.aborted) setScale(s.fontScale);
    });
    return () => ctrl.abort();
  }, [repos]);

  if (scale === null) return <div aria-busy className="h-16" />;
  return (
    <Segmented
      label={t('textSize')}
      value={String(scale)}
      onChange={(v) => {
        const next = Number(v);
        track('setting_change', { source: 'fontScale', from: String(scale), to: v });
        setScale(next);
        applyFontScale(next);
        void repos.settings.update({ fontScale: next });
      }}
      options={SIZES.map((o) => ({ value: o.value, label: t(o.key) }))}
    />
  );
}
