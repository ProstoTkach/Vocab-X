'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';
import { screenOf } from './analytics-provider';

/** A page that does not exist was opened: which section the address pointed into. */
export function TrackNotFound() {
  useEffect(() => {
    const path = window.location.pathname.replace(/^\/(uk|en)(?=\/|$)/, '') || '/';
    track('not_found', { screen: screenOf(path) });
  }, []);
  return null;
}
