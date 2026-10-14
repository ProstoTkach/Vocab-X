'use client';

import { Check } from 'lucide-react';
import { Checkbox, RadioGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

const cardClass = cx(
  'group flex min-h-14 w-full items-center gap-3 rounded-control border-2 border-line bg-surface px-4 py-3 text-start',
  'transition-colors motion-fast hover:border-line-strong',
  'data-[state=checked]:border-accent data-[state=checked]:bg-surface-2',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

interface ChoiceContent {
  label: ReactNode;
  description?: ReactNode;
  /** Leading visual, e.g. a flag or an icon. */
  icon?: ReactNode;
  lang?: string;
}

function Body({ label, description, icon }: ChoiceContent) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-fg-muted">{description}</span>}
      </span>
    </>
  );
}

const marker =
  'inline-flex size-6 shrink-0 items-center justify-center border-2 border-line-strong group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent';

/** One option of a RadioGroup.Root, rendered as a card. */
export function RadioCard({
  value,
  disabled,
  ...content
}: ChoiceContent & { value: string; disabled?: boolean }) {
  return (
    <RadioGroup.Item
      value={value}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(content.lang ? { lang: content.lang } : {})}
      className={cardClass}
    >
      <Body {...content} />
      <span className={cx(marker, 'rounded-full')}>
        <RadioGroup.Indicator className="size-2.5 rounded-full bg-on-accent" />
      </span>
    </RadioGroup.Item>
  );
}

/** A checkbox rendered as a card. */
export function CheckCard({
  checked,
  onCheckedChange,
  disabled,
  ...content
}: ChoiceContent & {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(content.lang ? { lang: content.lang } : {})}
      className={cardClass}
    >
      <Body {...content} />
      <span className={cx(marker, 'rounded-md')}>
        <Checkbox.Indicator>
          <Check aria-hidden className="size-4 text-on-accent" />
        </Checkbox.Indicator>
      </span>
    </Checkbox.Root>
  );
}
