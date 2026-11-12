'use client';

import { ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { type Platform } from '@/lib/feedback';

export const FORM_ID = 'feedback-form';

/** The device the learner is most likely reporting from; they can change it. */
export const guessPlatform = (): Platform =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    ? 'phone'
    : 'desktop';

/** "Anonymous" reassurance shown under every form. */
export function AnonymousNote() {
  const t = useTranslations('feedback');
  return (
    <p className="flex items-start gap-2.5 rounded-control bg-surface-2 p-3 text-sm text-fg-muted">
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
      {t('anonymous')}
    </p>
  );
}

export function PlatformPicker({
  value,
  onChange,
}: {
  value: Platform;
  onChange: (p: Platform) => void;
}) {
  const t = useTranslations('feedback');
  return (
    <Segmented
      label={t('platformLabel')}
      value={value}
      options={[
        { value: 'phone', label: t('platformPhone') },
        { value: 'desktop', label: t('platformDesktop') },
      ]}
      onChange={onChange}
    />
  );
}

/** Opens and closes its content smoothly (instantly with reduced motion). */
export function Reveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          // Keeps focus rings visible while the height animates.
          className="-m-1 overflow-hidden p-1"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------------------------
// The choice of what to send.
