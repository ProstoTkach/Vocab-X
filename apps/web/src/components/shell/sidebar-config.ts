/**
 * Pages where the desktop sidebar starts expanded; everywhere else it starts collapsed to keep
 * the content area clear. Paths are without the locale prefix. Edit this list to change it.
 */
export const EXPANDED_SIDEBAR_ROUTES: readonly string[] = ['/'];

/** Below this window width the sidebar always starts collapsed, leaving room for the content. */
export const SIDEBAR_AUTO_COLLAPSE_PX = 1200;

export function sidebarExpandedByDefault(path: string, windowWidth = Infinity): boolean {
  return (
    windowWidth >= SIDEBAR_AUTO_COLLAPSE_PX &&
    EXPANDED_SIDEBAR_ROUTES.includes(path === '' ? '/' : path)
  );
}
