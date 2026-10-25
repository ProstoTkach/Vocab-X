import { ExternalLink } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/** The free sources behind word suggestions (names are proper nouns, not translated). */
const SOURCES = [
  { name: 'MyMemory', role: 'mymemory', url: 'https://mymemory.translated.net/' },
  { name: 'Free Dictionary', role: 'freeDictionary', url: 'https://dictionaryapi.dev/' },
  { name: 'Wiktionary', role: 'wiktionary', url: 'https://en.wiktionary.org/' },
  { name: 'Tatoeba', role: 'tatoeba', url: 'https://tatoeba.org/' },
] as const;

export async function DictionarySources() {
  const t = await getTranslations('settings.dictionaryRoles');
  return (
    <ul className="flex flex-col gap-2">
      {SOURCES.map((s) => (
        <li key={s.name} className="text-sm">
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent underline-offset-2 hover:underline"
          >
            {s.name}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
          <span className="text-fg-muted"> — {t(s.role)}</span>
        </li>
      ))}
    </ul>
  );
}
