import { House, Layers, type LucideIcon, Repeat2, Trophy, User } from 'lucide-react';

export interface NavItem {
  /** Key in the `nav` messages namespace. */
  key: 'home' | 'review' | 'decks' | 'league' | 'profile';
  href: string;
  icon: LucideIcon;
}

/** One set of routes; the phone bottom bar and the desktop sidebar render the same list. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { key: 'home', href: '/', icon: House },
  { key: 'review', href: '/review', icon: Repeat2 },
  { key: 'decks', href: '/decks', icon: Layers },
  { key: 'league', href: '/league', icon: Trophy },
  { key: 'profile', href: '/profile', icon: User },
];

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}
