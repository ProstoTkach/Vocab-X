import { getMessages } from 'next-intl/server';
import type { Locale } from '@/i18n/locales';
import type { LegalSection } from '@/components/legal/legal-document';

export interface LegalText {
  title: string;
  updated: string;
  intro: string;
  summary?: LegalSection;
  sections: Record<string, LegalSection>;
}

interface ServerMessages {
  legal: {
    privacy: LegalText & { summary: LegalSection };
    terms: LegalText;
    google: { attribution: string; disclaimer: string };
  };
  credits: Omit<LegalText, 'sections' | 'summary'> & {
    sections: Record<string, { title: string; text: string }>;
  };
}

/**
 * The legal texts and credits, read whole. Their shape (sections with ordered blocks) is not
 * a flat key list, so the typed `t()` does not fit; they never reach the browser.
 */
export async function serverMessages(locale?: Locale): Promise<ServerMessages> {
  return (await getMessages(locale ? { locale } : undefined)) as unknown as ServerMessages;
}
