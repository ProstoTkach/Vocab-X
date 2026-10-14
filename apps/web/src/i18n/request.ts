import { locale as rootLocale } from 'next/root-params';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { loadMessages } from './messages';
import { routing } from './routing';

// The [locale] segment is a root param, so every server component (and static rendering)
// knows the locale without passing it around.
export default getRequestConfig(async () => {
  // Typed by Next only after it generates .next/types; keep lint and typecheck stable without it.
  const readLocale = rootLocale as () => Promise<string | undefined>;
  const requested = await readLocale();
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale) };
});
