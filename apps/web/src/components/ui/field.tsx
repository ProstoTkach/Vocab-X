'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

export const inputClass = cx(
  'min-h-11 w-full rounded-control border-2 border-line-strong/60 bg-surface px-3.5 text-fg outline-none',
  'transition-colors motion-fast placeholder:text-fg-muted focus-visible:border-accent',
);

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, with ids wired for assistive tech. */
export function FieldShell({ label, hint, error, children, className }: FieldShellProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(id, hintId)}
      {(hint || error) && (
        <p id={hintId} className={cx('text-sm', error ? 'text-danger' : 'text-fg-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...input
}: Omit<ComponentProps<'input'>, 'id'> & { label: string; hint?: string; error?: string | null }) {
  return (
    <FieldShell
      label={label}
      {...(hint ? { hint } : {})}
      error={error ?? null}
      {...(className ? { className } : {})}
    >
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={inputClass}
          {...input}
        />
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  options,
  className,
  ...select
}: Omit<ComponentProps<'select'>, 'id'> & {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      {(id, describedBy) => (
        <select
          id={id}
          aria-describedby={describedBy}
          className={cx(inputClass, 'pe-8')}
          {...select}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
