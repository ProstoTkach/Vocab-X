'use client';

import {
  ArrowLeft,
  ArrowRight,
  House,
  Layers,
  Repeat2,
  Sparkles,
  Trophy,
  User,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { cx } from '@/lib/cx';
import { useGamification } from '@/lib/gamification';
import { markTourSeen, tourSeen, type TourPart } from '@/lib/home-tour';
import { useCloseOnBack } from '@/lib/close-on-back';
import { IMAGE_QUALITY } from '@/lib/images';
import {
  boxOf,
  CHECK_MS,
  noDialogs,
  place,
  QUIET_MS,
  sameBox,
  scrollToTarget,
  targetOf,
  type Box,
} from '@/components/tour/geometry';

type StepId =
  | 'hello'
  | 'streak'
  | 'character'
  | 'message'
  | 'level'
  | 'goal'
  | 'wardrobe'
  | 'feedback'
  | 'enable'
  | 'deck'
  | 'add'
  | 'library'
  | 'nav'
  | 'extras'
  | 'bye'
  | 'gameHello'
  | 'gameBye';

interface Step {
  /** The `data-tour` mark of the element shown; none — a card in the middle of the screen. */
  target?: string;
  /** The wolf's joyful face (greetings, the character itself); otherwise the usual one. */
  joy?: boolean;
  /** In the fixed chrome (navigation, top bar): never scrolled to. */
  fixed?: boolean;
  /** Left out of the tour for now (kept, with its texts, to bring back any time). */
  hidden?: boolean;
}

const STEPS: Record<StepId, Step> = {
  hello: { joy: true },
  streak: { target: 'streak' },
  character: { target: 'character', joy: true },
  message: { target: 'message', hidden: true },
  level: { target: 'level' },
  goal: { target: 'goal', hidden: true },
  wardrobe: { target: 'wardrobe', hidden: true },
  feedback: { target: 'feedback', hidden: true },
  enable: { target: 'enable', joy: true },
  deck: { target: 'deck', hidden: true },
  add: { target: 'add', hidden: true },
  library: { target: 'library' },
  nav: { target: 'nav', fixed: true, hidden: true },
  extras: { target: 'extras', fixed: true },
  bye: { joy: true },
  gameHello: { joy: true },
  gameBye: { joy: true },
};

const GAME_STEPS: StepId[] = ['character', 'message', 'level', 'wardrobe', 'feedback'];
const PAGE_STEPS: StepId[] = ['deck', 'add', 'library', 'nav', 'extras', 'bye'];

/**
 * The steps of a part, in order. Gamification off: instead of the character, the button that
 * turns it on. Steps whose element is not on this screen (phone or desktop layout) are skipped.
 */
function stepsOf(part: TourPart, enabled: boolean): StepId[] {
  return allStepsOf(part, enabled).filter((id) => !STEPS[id].hidden);
}

function allStepsOf(part: TourPart, enabled: boolean): StepId[] {
  if (part === 'game') return ['gameHello', ...GAME_STEPS, 'gameBye'];
  return enabled
    ? [
        'hello',
        'streak',
        'character',
        'message',
        'level',
        'goal',
        'wardrobe',
        'feedback',
        ...PAGE_STEPS,
      ]
    : ['hello', 'streak', 'goal', 'enable', ...PAGE_STEPS];
}

/** The pages of the navigation, explained in the "nav" step. */
const PAGES = [
  { key: 'home', icon: House },
  { key: 'review', icon: Repeat2 },
  { key: 'decks', icon: Layers },
  { key: 'league', icon: Trophy },
  { key: 'profile', icon: User },
] as const;

const presentMarks = () =>
  Object.values(STEPS)
    .flatMap((s) => (s.target && targetOf(s.target) ? [s.target] : []))
    .join(' ');

/**
 * A guided tour of Home for newcomers: everything is dimmed except one element at a time, with a
 * card beside it — the wolf, what the element is for, and a line pointing at it. The first visit
 * explains the screen and the pages; the character, level and wardrobe are explained when
 * gamification is on (now, or the first time it is switched on), and with it off the tour shows
 * the button that turns it on. Waits for other windows (consent, install) to close first.
 */
export function HomeTour() {
  const t = useTranslations('pages.home.tour');
  const nav = useTranslations('nav');
  const { ready, enabled, setMode } = useGamification();
  const reduced = useReducedMotion();
  const titleId = useId();
  const textId = useId();
  const [run, setRun] = useState<{ part: TourPart; at: StepId } | null>(null);
  const [present, setPresent] = useState('');
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ w: 0, h: 0 });
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  // Start once other windows are gone: the first visit, or gamification newly on.
  useEffect(() => {
    if (!ready || run) return;
    const part: TourPart | null = !tourSeen('home')
      ? 'home'
      : enabled && !tourSeen('game')
        ? 'game'
        : null;
    if (!part) return;
    let quiet = 0;
    const id = window.setInterval(() => {
      quiet = noDialogs() ? quiet + CHECK_MS : 0;
      if (quiet < QUIET_MS) return;
      window.clearInterval(id);
      markTourSeen(part);
      if (enabled) markTourSeen('game');
      track('home_tour', { to: 'shown', source: part });
      setPresent(presentMarks());
      setRun({ part, at: stepsOf(part, enabled)[0]! });
    }, CHECK_MS);
    return () => window.clearInterval(id);
  }, [ready, enabled, run]);

  const steps = run
    ? stepsOf(run.part, enabled).filter((id) => {
        const mark = STEPS[id].target;
        return !mark || present.split(' ').includes(mark);
      })
    : [];
  const index = run ? steps.indexOf(run.at) : -1;
  const step = index >= 0 ? STEPS[run!.at] : null;

  // Follow the element (scrolling, layout shifts, resizing) and the card's size every frame.
  useEffect(() => {
    if (!run) return;
    let frame = 0;
    const tick = () => {
      setPresent((p) => {
        const now = presentMarks();
        return now === p ? p : now;
      });
      const el = step?.target ? targetOf(step.target) : null;
      const next = el ? boxOf(el) : null;
      setBox((b) => (sameBox(b, next) ? b : next));
      const c = card.current;
      if (c)
        setSize((s) =>
          s.w === c.offsetWidth && s.h === c.offsetHeight
            ? s
            : { w: c.offsetWidth, h: c.offsetHeight },
        );
      setView((v) =>
        v.w === window.innerWidth && v.h === window.innerHeight
          ? v
          : { w: window.innerWidth, h: window.innerHeight },
      );
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [run, step]);

  // Each step: its element into view, the focus on the main button.
  useEffect(() => {
    if (!step) return;
    const el = step.target && !step.fixed ? targetOf(step.target) : null;
    if (el) scrollToTarget(el, !reduced);
    primary.current?.focus({ preventScroll: true });
  }, [step, reduced]);

  const finish = (to: 'done' | 'skipped') => {
    if (!run) return;
    track('home_tour', { to, source: run.part, step: run.at, count: index + 1 });
    setRun(null);
    setBox(null);
  };

  // The phone's "Back" ends the tour, as Escape does.
  useCloseOnBack(!!run, () => finish('skipped'));

  const go = (dir: 1 | -1) => {
    if (!run) return;
    const next = steps[index + dir];
    if (next) setRun({ ...run, at: next });
    else if (dir === 1) finish('done');
  };

  // Gamification switched on from the tour: on to the character and everything that came with it.
  const enable = () => {
    if (!run) return;
    track('gamification_enable_click', { source: 'tour' });
    track('home_tour', { to: 'enable', source: run.part, step: run.at });
    markTourSeen('game');
    setMode('max', 'tour');
    setRun({ ...run, at: 'character' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish('skipped');
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (e.target instanceof HTMLButtonElement || e.target === e.currentTarget) {
        e.preventDefault();
        go(e.key === 'ArrowRight' ? 1 : -1);
      }
    } else if (e.key === 'Tab') {
      // The focus stays in the card.
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button')];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!run) return null;
  if (!step)
    return createPortal(<div aria-hidden className="fixed inset-0 z-60 bg-scrim" />, document.body);

  const id = run.at;
  const last = index === steps.length - 1;
  const spot = step.target ? box : null;
  const measured = size.w > 0 && view.w > 0;
  const pos = measured ? place(spot, size.w, size.h, view.w, view.h) : null;
  const hole = spot ?? { top: view.h / 2, left: view.w / 2, width: 0, height: 0 };

  return createPortal(
    <div className="fixed inset-0 z-60">
      {/* Takes every tap, so nothing behind the tour reacts; the focus stays in the card. */}
      <div aria-hidden className="absolute inset-0" onMouseDown={(e) => e.preventDefault()} />
      {/* The dimming, with a hole over the element shown. */}
      <div
        aria-hidden
        className={cx(
          'pointer-events-none absolute rounded-card shadow-[0_0_0_200vmax_var(--color-scrim)] transition-[top,left,width,height] motion-normal',
          spot && 'ring-2 ring-accent',
        )}
        style={hole}
      />
      {pos?.line && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <line
            x1={pos.line.x1}
            y1={pos.line.y1}
            x2={pos.line.x2}
            y2={pos.line.y2}
            className="stroke-accent"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={pos.line.x1} cy={pos.line.y1} r={4} className="fill-accent" />
        </svg>
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        onKeyDown={onKeyDown}
        className={cx(
          'absolute flex max-h-[calc(100dvh-1.5rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-y-auto rounded-card border border-line bg-surface p-4 text-fg shadow-pop',
          // Invisible until measured, so it never flashes in the corner.
          !pos && 'opacity-0',
        )}
        style={pos ? { top: pos.y, left: pos.x } : { top: 0, left: 0 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={id}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex gap-3"
          >
            <Image
              src={step.joy ? '/male/_wolf/wolf_head_joy.png' : '/male/_wolf/wolf_head.png'}
              alt=""
              width={step.joy ? 286 : 284}
              height={step.joy ? 369 : 351}
              quality={IMAGE_QUALITY}
              className="h-14 w-auto shrink-0 self-start drop-shadow-md sm:h-16"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2
                  id={titleId}
                  className="font-display text-lg leading-tight font-semibold text-balance"
                >
                  {t(`${id}.title`)}
                </h2>
                <span className="mt-0.5 shrink-0 text-xs text-fg-muted tabular-nums">
                  {t('progress', { current: index + 1, total: steps.length })}
                </span>
              </div>
              <p id={textId} className="mt-1.5 text-sm text-pretty text-fg-muted">
                {t(`${id}.text`)}
              </p>
              {id === 'nav' && (
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {PAGES.map(({ key, icon: Icon }) => (
                    <li key={key} className="flex items-start gap-2">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                      <span>
                        <span className="font-semibold">{nav(key)}</span> — {t(`pages.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {!last && id !== 'enable' && (
            <Button
              variant="ghost"
              size="sm"
              className="-ms-2 text-fg-muted"
              onClick={() => finish('skipped')}
            >
              {t('skip')}
            </Button>
          )}
          <span className="flex-1" />
          {index > 0 && (
            <Button variant="secondary" size="icon" aria-label={t('back')} onClick={() => go(-1)}>
              <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
            </Button>
          )}
          {id === 'enable' ? (
            <>
              <Button ref={primary} size="sm" onClick={enable}>
                <Sparkles aria-hidden className="size-4" />
                {t('turnOn')}
              </Button>
              <Button ref={primary} size="sm" onClick={() => (last ? finish('done') : go(1))}>
                {last ? t('done') : t('next')}
                {!last && <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" />}
              </Button>
            </>
          ) : (
            <Button ref={primary} size="sm" onClick={() => (last ? finish('done') : go(1))}>
              {last ? t('done') : t('next')}
              {!last && <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" />}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
