'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardText, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { COLOR_TOKENS } from '@/themes/types';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-fg-muted">{title}</h3>
      {children}
    </div>
  );
}

export function ComponentGallery() {
  const t = useTranslations('devui');
  const common = useTranslations('common');
  const toast = useToast();
  const [on, setOn] = useState(true);

  return (
    <div className="grid gap-6 @container">
      <Block title={t('tokens')}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
          {COLOR_TOKENS.map((token) => (
            <li key={token} className="flex items-center gap-2 text-xs">
              <span
                className="size-6 shrink-0 rounded-md border border-line"
                style={{ background: `var(--vx-${token})` }}
              />
              <code className="truncate">{token}</code>
            </li>
          ))}
        </ul>
      </Block>

      <Block title={t('buttons')}>
        <div className="flex flex-wrap gap-2">
          <Button>{t('primary')}</Button>
          <Button variant="secondary">{t('secondary')}</Button>
          <Button variant="ghost">{t('ghost')}</Button>
          <Button variant="danger">{t('danger')}</Button>
          <Button disabled>{t('disabled')}</Button>
          <Button size="sm" variant="secondary">
            {t('small')}
          </Button>
          <Button size="lg">{t('large')}</Button>
          <Button size="icon" variant="secondary" aria-label={t('iconButton')}>
            <Plus aria-hidden className="size-5" />
          </Button>
        </div>
      </Block>

      <Block title={t('badges')}>
        <div className="flex flex-wrap gap-2">
          <Badge>{t('badgeNew')}</Badge>
          <Badge tone="accent">{t('badgeDue')}</Badge>
          <Badge tone="success">{t('badgeMastered')}</Badge>
          <Badge tone="warning">{t('badgeHard')}</Badge>
          <Badge tone="danger">{common('locked')}</Badge>
          <Badge tone="info">{common('demo')}</Badge>
        </div>
      </Block>

      <div className="grid gap-6 @2xl:grid-cols-2">
        <Block title={t('cards')}>
          <Card>
            <div className="flex items-center gap-3">
              <Avatar name={t('avatarName')} />
              <div className="min-w-0">
                <CardTitle as="h4">{t('cardTitle')}</CardTitle>
                <CardText>{t('cardText', { count: 120 })}</CardText>
              </div>
            </div>
          </Card>
        </Block>

        <Block title={t('progress')}>
          <Card className="flex flex-col gap-3">
            <ProgressBar value={30} max={50} label={t('progressLabel')} />
            <ProgressBar value={45} max={50} tone="success" label={t('progressLabel')} />
            <ProgressBar value={10} max={50} tone="warning" label={t('progressLabel')} />
            <Switch label={t('switchLabel')} checked={on} onCheckedChange={setOn} />
          </Card>
        </Block>
      </div>

      <Block title={t('tabs')}>
        <Tabs defaultValue="words">
          <TabsList>
            <TabsTrigger value="words">{t('tabWords')}</TabsTrigger>
            <TabsTrigger value="stats">{t('tabStats')}</TabsTrigger>
            <TabsTrigger value="settings">{t('tabSettings')}</TabsTrigger>
          </TabsList>
          <TabsContent value="words">{t('tabWordsContent')}</TabsContent>
          <TabsContent value="stats">{t('tabStatsContent')}</TabsContent>
          <TabsContent value="settings">{t('tabSettingsContent')}</TabsContent>
        </Tabs>
      </Block>

      <div className="flex flex-wrap items-end gap-6">
        <Block title={t('avatar')}>
          <div className="flex items-center gap-2">
            <Avatar name={t('avatarName')} size="sm" />
            <Avatar name={t('avatarName')} />
            <Avatar name={t('avatarName')} size="lg" />
          </div>
        </Block>
        <Block title={t('dialog')}>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{t('openDialog')}</Button>
            </DialogTrigger>
            <DialogContent
              title={t('dialogTitle')}
              description={t('dialogText')}
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="secondary">{common('cancel')}</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger">{common('confirm')}</Button>
                  </DialogClose>
                </>
              }
            />
          </Dialog>
        </Block>
        <Block title={t('toast')}>
          <Button
            variant="secondary"
            onClick={() =>
              toast({ title: t('toastTitle'), description: t('toastText'), tone: 'success' })
            }
          >
            {t('showToast')}
          </Button>
        </Block>
        <Block title={t('tooltip')}>
          <Tooltip content={t('tooltipText')}>
            <Button variant="ghost">{t('tooltipTrigger')}</Button>
          </Tooltip>
        </Block>
      </div>
    </div>
  );
}
