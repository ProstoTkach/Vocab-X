'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
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

/** A password, with an eye at its end to see what was typed. */
export function PasswordField({
  label,
  hint,
  showLabel,
  hideLabel,
  className,
  ...input
}: Omit<ComponentProps<'input'>, 'id' | 'type'> & {
  label: string;
  hint?: string;
  showLabel: string;
  hideLabel: string;
}) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      {(id, describedBy) => (
        <div className="relative">
          <input
            id={id}
            aria-describedby={describedBy}
            type={shown ? 'text' : 'password'}
            className={cx(inputClass, 'pe-11')}
            {...input}
          />
          <button
            type="button"
            aria-label={shown ? hideLabel : showLabel}
            onClick={() => setShown((s) => !s)}
            className="absolute inset-y-0 end-0 inline-flex w-11 items-center justify-center rounded-control text-fg-muted transition-colors motion-fast hover:text-fg"
          >
            <Icon aria-hidden className="size-5" />
          </button>
        </div>
      )}
    </FieldShell>
  );
}

/** Multi-line text with a length limit and a live "used / max" counter. */
export function TextAreaField({
  label,
  hint,
  error,
  maxLength,
  value,
  className,
  ...textarea
}: Omit<ComponentProps<'textarea'>, 'id' | 'value' | 'maxLength'> & {
  label: string;
  hint?: string;
  error?: string | null;
  maxLength: number;
  value: string;
}) {
  return (
    <FieldShell
      label={label}
      {...(hint ? { hint } : {})}
      error={error ?? null}
      {...(className ? { className } : {})}
    >
      {(id, describedBy) => (
        <div className="relative">
          <textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            maxLength={maxLength}
            value={value}
            rows={3}
            className={cx(inputClass, 'block resize-y py-2.5 pb-6')}
            {...textarea}
          />
          <span
            aria-hidden
            className={cx(
              'pointer-events-none absolute end-3 bottom-1.5 text-xs tabular-nums',
              value.length >= maxLength ? 'text-warning' : 'text-fg-muted',
            )}
          >
            {value.length}/{maxLength}
          </span>
        </div>
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
