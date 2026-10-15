/**
 * Pages where the desktop sidebar starts expanded; everywhere else it starts collapsed to keep
 * the content area clear. Paths are without the locale prefix. Edit this list to change it.
 */
export const EXPANDED_SIDEBAR_ROUTES: readonly string[] = ['/'];

export function sidebarExpandedByDefault(path: string): boolean {
  return EXPANDED_SIDEBAR_ROUTES.includes(path === '' ? '/' : path);
}
