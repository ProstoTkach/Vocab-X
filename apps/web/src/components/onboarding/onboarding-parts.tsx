'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function StepTitle({
  ref,
  text,
  intro,
  hidden = false,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  text: string;
  intro?: string;
  /** Only for screen readers (and focus): the fields of the step say enough on screen. */
  hidden?: boolean;
}) {
  return (
    <div className={hidden ? 'sr-only' : undefined}>
      <h1
        id="onboarding-step"
        ref={ref}
        tabIndex={-1}
        className="font-display text-display font-bold text-balance outline-none"
      >
        {text}
      </h1>
      {intro && <p className="mt-2 text-fg-muted text-pretty">{intro}</p>}
    </div>
  );
}

/** One way to start: a card with a short explanation and its button. */
export function StartOption({
  icon,
  title,
  text,
  action,
  primary = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line/70 bg-surface p-5 shadow-card sm:flex-row sm:items-center">
      {/* The icon beside the title and text on phones too: no empty row around it. */}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-fg-muted text-pretty">{text}</p>
        </div>
      </div>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        className="justify-center sm:self-center"
        onClick={onClick}
      >
        {action}
      </Button>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{label}</h2>
      {hint && <p className="mb-3 text-sm text-fg-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}
