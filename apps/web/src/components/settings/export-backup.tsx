'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button';
import { useClock } from '@/lib/clock';
import { useRepos } from '@/lib/repos';

/** "Export JSON": downloads all progress and settings as one file (vocabx-YYYY-MM-DD.json). */
export function ExportBackup({
  variant = 'secondary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const t = useTranslations('data');
  const repos = useRepos();
  const { clock, dayOf } = useClock();

  const exportData = async () => {
    const dump = await repos.exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabx-${dayOf(clock.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => void exportData()}
      {...(className ? { className } : {})}
    >
      <Download aria-hidden className="size-4" />
      {t('export')}
    </Button>
  );
}
