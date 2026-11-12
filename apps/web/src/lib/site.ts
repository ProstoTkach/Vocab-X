/** The address shared links, the sitemap and canonical links point to (in full). */
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://vocabx-sigma.vercel.app';

/** Pages without the app shell: readable by anyone, listed in the sitemap. */
export const INFO_PAGES = ['privacy', 'terms', 'credits'] as const;
export type InfoPage = (typeof INFO_PAGES)[number];
