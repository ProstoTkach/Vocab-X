import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/monitoring';

/** Server errors (routes, server components, cron) go to Sentry when `SENTRY_DSN` is set. */
export function register() {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN));
}

export const onRequestError = Sentry.captureRequestError;
