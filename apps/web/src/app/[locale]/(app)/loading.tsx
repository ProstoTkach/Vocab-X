/**
 * Instant feedback while a section loads (cold dev compile, slow network). With prefetching
 * in production the new page usually arrives before this is ever painted.
 */
export default function Loading() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="mb-6 h-10 w-48 rounded-control bg-surface-3" />
      <div className="h-28 rounded-card bg-surface-2" />
    </div>
  );
}
