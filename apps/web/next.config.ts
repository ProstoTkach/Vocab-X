import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy without nonces: a nonce would make every page dynamic (no CDN cache), so
 * inline scripts and styles (Next's own, the boot script, the theme CSS) stay allowed and the rest
 * is pinned down: no foreign scripts, frames, plugins or base tags. The browser itself talks only
 * to the three lexicon sources (see lib/lexicon); the rest goes through our server. Google sign-in
 * is a redirect, so it only needs form-action.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self' https://api.tatoeba.org https://api.dictionaryapi.dev https://en.wiktionary.org${isDev ? ' ws://localhost:*' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Which build this is, for the service worker (lib/offline.ts registers `/sw.js?v=<build>`, so
 * each deploy installs a worker of its own and open tabs of the older one learn of it). The
 * commit on Vercel; elsewhere the moment of the build.
 */
const BUILD_ID = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_DEPLOYMENT_ID ??
  `local-${new Date().getTime().toString(36)}`
).slice(0, 16);

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Microphone: sentences mode only (the page itself); nothing else is used.
  {
    key: 'Permissions-Policy',
    value: 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
  },
];

const config: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@vocabx/core', '@vocabx/content', '@vocabx/data'],
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  images: {
    // PNG character art is served re-encoded as WebP at the size it is shown (see lib/images).
    qualities: [75, 90],
    // The pictures rarely change: browsers and the CDN keep them for a day.
    minimumCacheTTL: 86_400,
  },
};

export default withNextIntl(config);
