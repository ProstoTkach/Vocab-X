'use client';

import {
  goalDays,
  goalStreak,
  shiftDateKey,
  weekDays,
  wordStatus,
  type DailyStats,
  type Profile,
} from '@vocabx/core';
import { Check, Palette, Pencil } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { AvatarBadge } from '@/components/character/avatar-badge';
import { AccountCard, SignInCard, useAccount } from '@/components/profile/account-card';
import { FramePicker } from '@/components/profile/frame-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { Tooltip } from '@/components/ui/tooltip';
import { toPublished } from '@/character/look';
import { track } from '@/lib/analytics';
import { publishLeagueShown } from '@/lib/league-publish';
import { useClock } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { useGamification } from '@/lib/gamification';
import { usePlayer } from '@/lib/player';
import { useRepos } from '@/lib/repos';

/** History read for the statistics, days. */
const PAST_DAYS = 365;
const NAME_MAX = 40;

interface Numbers {
  reviews: number;
  correct: number;
  activeDays: number;
  streak: number;
  bestStreak: number;
  bestDay: number;
  learning: number;
  mastered: number;
}

/** The longest run of days in a row with the daily goal met. */
function longestRun(days: ReadonlySet<string>): number {
  let best = 0;
  for (const day of days) {
    if (days.has(shiftDateKey(day, -1))) continue;
    let n = 1;
    while (days.has(shiftDateKey(day, n))) n += 1;
    best = Math.max(best, n);
  }
  return best;
}

/**
 * The learner's page: the character's head with what it wears, the name (changed here), the
 * level, a few numbers worth knowing and the right and wrong answers of this week or the last.
 */
export function ProfileView({ accounts }: { accounts: boolean }) {
  const t = useTranslations('profile');
  const format = useFormatter();
  const repos = useRepos();
  const { clock, dayOf } = useClock();
  const { look, frame } = useGamification();
  const [framing, setFraming] = useState(false);
  const account = useAccount(accounts);
  const { level, xpTotal } = usePlayer();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [numbers, setNumbers] = useState<Numbers | null>(null);
  const [days, setDays] = useState<DailyStats[]>([]);
  const [today, setToday] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  /** The chart shows the week before this one. */
  const [previousWeek, setPreviousWeek] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const now = clock.now();
      const day = dayOf(now);
      const [p, settings] = await Promise.all([repos.profile.get(), repos.settings.get()]);
      if (!p) return;
      const [stats, progress] = await Promise.all([
        repos.reviewLog.dailyStats(shiftDateKey(day, -PAST_DAYS), day),
        repos.progress.listByLang(p.activeTargetLang),
      ]);
      if (ctrl.signal.aborted) return;
      const done = goalDays(stats, settings.study.dailyGoalXp);
      const status = progress.map((x) => wordStatus(x, now));
      setProfile(p);
      setToday(day);
      setDays(stats);
      setNumbers({
        reviews: stats.reduce((n, s) => n + s.reviews, 0),
        correct: stats.reduce((n, s) => n + s.correct, 0),
        activeDays: stats.filter((s) => s.reviews > 0).length,
        streak: goalStreak(done, day),
        bestStreak: longestRun(done),
        bestDay: Math.max(0, ...stats.map((s) => s.reviews)),
        learning: status.filter((s) => s !== 'mastered').length,
        mastered: status.filter((s) => s === 'mastered').length,
      });
    })();
    return () => ctrl.abort();
  }, [repos, clock, dayOf]);

  if (!profile || !numbers) return <div aria-busy className="h-96" />;

  const shownName = profile.displayName.trim() || t('noName');
  const saveName = (e: SyntheticEvent) => {
    e.preventDefault();
    const next = name.trim().slice(0, NAME_MAX);
    const updated = { ...profile, displayName: next };
    setProfile(updated);
    setEditing(false);
    void repos.profile
      .save(updated)
      .then(() => publishLeagueShown(repos, toPublished(look), frame));
    track('profile_name', { to: next ? 'set' : 'cleared' });
  };

  const accuracy = numbers.reviews ? numbers.correct / numbers.reviews : null;
  const tiles: { key: Exclude<keyof Numbers, 'correct'> | 'accuracy'; value: string }[] = [
    { key: 'reviews', value: format.number(numbers.reviews) },
    {
      key: 'accuracy',
      value: accuracy === null ? '—' : format.number(accuracy, { style: 'percent' }),
    },
    { key: 'streak', value: t('daysValue', { count: numbers.streak }) },
    { key: 'bestStreak', value: t('daysValue', { count: numbers.bestStreak }) },
    { key: 'activeDays', value: format.number(numbers.activeDays) },
    { key: 'bestDay', value: format.number(numbers.bestDay) },
    { key: 'learning', value: format.number(numbers.learning) },
    { key: 'mastered', value: format.number(numbers.mastered) },
  ];

  const week = (weeksBack: number) =>
    weekDays(today, weeksBack).map((date) => {
      const day = days.find((d) => d.date === date);
      const right = day?.correct ?? 0;
      return { date, right, wrong: (day?.reviews ?? 0) - right };
    });
  const chart = week(previousWeek ? 1 : 0);
  // One scale for both weeks: going from one to the other shows the difference at once.
  const top = Math.max(1, ...[...week(0), ...week(1)].map((d) => d.right + d.wrong));
  const dayLabel = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00`), { weekday: 'short' });
  const chartTitle = t(previousWeek ? 'chartPrevious' : 'chartThis');
  const total = chart.reduce((n, d) => n + d.right + d.wrong, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
        <div className="relative shrink-0">
          <AvatarBadge
            look={look}
            frame={frame}
            label={t('character')}
            sizes="128px"
            eager
            className="size-28 sm:size-32"
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('frame.title')}
            className="absolute -end-6 -bottom-1 sm:-end-1"
            onClick={() => setFraming(true)}
          >
            <Palette aria-hidden className="size-4" />
          </Button>
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-2 sm:pe-10">
          {editing ? (
            <form onSubmit={saveName} className="flex items-end gap-2">
              <TextField
                className="min-w-0 flex-1"
                label={t('nameLabel')}
                value={name}
                maxLength={NAME_MAX}
                autoComplete="nickname"
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" size="icon" aria-label={t('nameSave')}>
                <Check aria-hidden className="size-4" />
              </Button>
            </form>
          ) : (
            <h1 className="truncate font-display text-display font-bold md:text-2xl">
              {shownName}
            </h1>
          )}
          <p className="text-fg-muted">{t('level', { level, xp: format.number(xpTotal) })}</p>
        </div>
        {/* In the corner of the card, so the name stays exactly in the middle on phones. */}
        {!editing && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('nameEdit')}
            className="absolute end-2 top-2"
            onClick={() => {
              setName(profile.displayName);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden className="size-4" />
          </Button>
        )}
      </Card>

      {account?.email === null && <SignInCard />}
      {/* Room for that line while the server answers, so the page does not jump. */}
      {accounts && account === undefined && !repos.journal.active && (
        <div aria-hidden className="h-20" />
      )}

      <section aria-label={t('numbersTitle')}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(({ key, value }) => (
            <li
              key={key}
              className="flex flex-col gap-1 rounded-card border border-line/70 bg-surface p-4 shadow-card"
            >
              <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
              <span className="text-sm text-fg-muted">{t(`numbers.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <Card aria-labelledby="profile-chart">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="profile-chart" className="font-display text-title font-semibold">
            {chartTitle}
          </h2>
          <p className="flex gap-4 text-sm text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-sm bg-success" />
              {t('right')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-sm bg-danger" />
              {t('wrong')}
            </span>
          </p>
        </div>
        {/* The bars for the eye (the bars keep their places, so they grow and shrink between the
        weeks); the same numbers as a table for screen readers. */}
        <div aria-hidden className="flex h-40 items-stretch gap-1.5 border-b border-line sm:gap-3">
          {chart.map((d, i) => (
            <Tooltip
              key={i}
              content={t('chartTip', { day: dayLabel(d.date), right: d.right, wrong: d.wrong })}
            >
              <div
                className={cx(
                  'flex min-w-0 flex-1 flex-col justify-end rounded-t',
                  // Today: a faint column behind the bar, so the day is found at a glance.
                  d.date === today && 'bg-accent/10',
                )}
              >
                <div
                  className={cx(
                    'w-full rounded-t bg-danger transition-[height] motion-normal',
                    d.wrong > 0 && d.right > 0 && 'mb-0.5',
                  )}
                  style={{ height: `${(d.wrong / top) * 100}%` }}
                />
                <div
                  className={cx(
                    'w-full bg-success transition-[height] motion-normal',
                    d.wrong === 0 && 'rounded-t',
                  )}
                  style={{ height: `${(d.right / top) * 100}%` }}
                />
              </div>
            </Tooltip>
          ))}
        </div>
        <div aria-hidden className="mt-2 flex gap-1.5 text-xs text-fg-muted sm:gap-3">
          {chart.map((d, i) => (
            <span
              key={i}
              className={cx(
                'min-w-0 flex-1 truncate rounded-full text-center',
                d.date === today && 'bg-accent font-semibold text-on-accent',
              )}
            >
              {dayLabel(d.date)}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-muted">{t('weekTotal', { count: total })}</p>
          <Button variant="secondary" size="sm" onClick={() => setPreviousWeek((v) => !v)}>
            {t(previousWeek ? 'thisWeek' : 'previousWeek')}
          </Button>
        </div>
        {/* A table takes its full height even when "visually hidden": the box around it clips it. */}
        <div className="sr-only" data-testid="profile-chart-table">
          <table>
            <caption>{chartTitle}</caption>
            <thead>
              <tr>
                <th scope="col">{t('day')}</th>
                <th scope="col">{t('right')}</th>
                <th scope="col">{t('wrong')}</th>
              </tr>
            </thead>
            <tbody>
              {chart.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{dayLabel(d.date)}</th>
                  <td>{d.right}</td>
                  <td>{d.wrong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {account?.email && <AccountCard email={account.email} />}
      <FramePicker open={framing} onOpenChange={setFraming} />
    </div>
  );
}
