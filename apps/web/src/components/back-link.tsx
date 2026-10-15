import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-control text-sm font-semibold text-fg-muted hover:text-fg"
    >
      <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
      {label}
    </Link>
  );
}
