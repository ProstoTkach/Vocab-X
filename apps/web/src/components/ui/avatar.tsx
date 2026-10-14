import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cx } from '@/lib/cx';

const SIZES = { sm: 'size-9 text-sm', md: 'size-12 text-base', lg: 'size-20 text-2xl' } as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase())
    .join('');
}

export interface AvatarProps {
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-accent font-semibold text-on-accent',
        SIZES[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback role="img" aria-label={name}>
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
