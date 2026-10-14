import type { AbstractIntlMessages } from 'next-intl';
import { NAMESPACES, type Locale } from './locales';

/** Messages are split per namespace: messages/<locale>/<namespace>.json. */
export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = (await import(`../../messages/${locale}/${ns}.json`)) as {
        default: AbstractIntlMessages;
      };
      return [ns, mod.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}
