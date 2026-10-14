import type { ReactNode } from 'react';

export function PageHeader({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-display font-bold text-balance">{title}</h1>
        {intro && <p className="mt-2 max-w-prose text-fg-muted text-pretty">{intro}</p>}
      </div>
      {actions}
    </header>
  );
}
