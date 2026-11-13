import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Error monitoring (Sentry, free plan) without personal data. The tool is off without a DSN, so
 * local runs and tests send nothing. Everything that could carry what a learner typed or who they
 * are is removed here, before an event leaves the browser or the server: user, address of the
 * sender, cookies, headers, query strings, request bodies, breadcrumbs (they hold fetch addresses
 * with words in them) and free-form extras. What stays: the kind of error, its stack, the route
 * path, the build and the environment. The third party and its terms: docs/DATA_MAP.md.
 */

/** Engine messages ("x is not a function") name no learner text; others may quote input. */
const ENGINE_ERRORS = new Set(['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError']);
const MAX_VALUE = 150;

/** Failures that only mean "offline" or a browser quirk; they would eat the monthly quota. */
export const IGNORED_ERRORS = [
  'ResizeObserver loop',
  'Failed to fetch',
  'Load failed',
  'NetworkError when attempting to fetch resource',
  'AbortError',
];

function pathOnly(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

export function scrubEvent<T extends ErrorEvent>(event: T): T {
  const path = pathOnly(event.request?.url);
  if (path) event.request = { url: path };
  else delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.server_name;
  delete event.message;
  delete event.logentry;
  event.tags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([key]) => key === 'route' || key === 'runtime'),
  );
  for (const ex of event.exception?.values ?? []) {
    if (ex.type && ENGINE_ERRORS.has(ex.type) && ex.value) ex.value = ex.value.slice(0, MAX_VALUE);
    else delete ex.value;
  }
  return event;
}

/** Shared by the browser and the server: no traces, no replays, no breadcrumbs, no default PII. */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    ignoreErrors: IGNORED_ERRORS,
    beforeBreadcrumb: () => null,
    beforeSend: scrubEvent,
  };
}
