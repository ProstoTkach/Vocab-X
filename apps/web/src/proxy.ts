import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);
const LOCALE_COOKIE = 'NEXT_LOCALE';

/**
 * Locale routing. A first visit always opens in the default locale (Ukrainian), whatever the
 * browser's language: the Accept-Language header is hidden from next-intl until the learner has
 * picked a language. Once they pick another one, next-intl remembers it in a cookie, which then
 * wins on later visits as usual.
 */
export default function proxy(request: NextRequest) {
  if (request.cookies.has(LOCALE_COOKIE) || !request.headers.has('accept-language'))
    return intl(request);
  const headers = new Headers(request.headers);
  headers.delete('accept-language');
  return intl(new NextRequest(request, { headers }));
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
