import { locale as rootLocale } from 'next/root-params';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { loadMessages } from './messages';
import { routing } from './routing';

// The [locale] segment is a root param, so every server component (and static rendering)
// knows the locale without passing it around.
export default getRequestConfig(async () => {
  const requested: unknown = await rootLocale();
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale) };
});
