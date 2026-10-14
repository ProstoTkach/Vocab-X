'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';

interface NavState {
  /** Path to highlight: the target of a pending navigation, otherwise the current one. */
  path: string;
  /** Call on link click so the tab lights up before the new page arrives. */
  navigateTo: (href: string) => void;
}

const NavStateContext = createContext<NavState | null>(null);

export function NavStateProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  // Once the route actually changes, `from` no longer matches and the real path wins.
  const path = pending?.from === pathname ? pending.to : pathname;
  return (
    <NavStateContext value={{ path, navigateTo: (to) => setPending({ from: pathname, to }) }}>
      {children}
    </NavStateContext>
  );
}

export function useNavState(): NavState {
  const ctx = useContext(NavStateContext);
  if (!ctx) throw new Error('useNavState must be used inside NavStateProvider');
  return ctx;
}
