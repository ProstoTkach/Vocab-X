import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/monitoring';

// Browser errors: only when `NEXT_PUBLIC_SENTRY_DSN` is set (lib/monitoring.ts: what is cut).
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
