import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

/**
 * The way back to the page above, on computers only (phones have their own "Back"). Pinned to
 * the top corner next to the sidebar, out of the page's column, so it is there at any scroll
 * and moves nothing. A quiet see-through circle with an arrow; on hover or focus it turns solid
 * and opens up to show where it leads.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cx(
        'group glass fixed top-4 z-30 hidden h-11 items-center rounded-full border border-line/70 px-3 text-sm font-semibold text-fg-muted shadow-card md:inline-flex',
        // Next to the sidebar, following it as it folds.
        'start-68 sidebar-collapsed:start-24',
        'opacity-60 transition-[opacity,color,box-shadow,inset-inline-start] motion-normal',
        'hover:text-fg hover:opacity-100 hover:shadow-pop focus-visible:text-fg focus-visible:opacity-100',
      )}
    >
      <ArrowLeft
        aria-hidden
        className="size-5 shrink-0 transition-transform motion-fast group-hover:-translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:translate-x-0.5"
      />
      <span
        aria-hidden
        className={cx(
          'max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] motion-normal',
          'group-hover:ms-2 group-hover:max-w-56 group-hover:opacity-100',
          'group-focus-visible:ms-2 group-focus-visible:max-w-56 group-focus-visible:opacity-100',
        )}
      >
        {label}
      </span>
    </Link>
  );
}
