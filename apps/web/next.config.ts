import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@vocabix/core', '@vocabix/content', '@vocabix/data'],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withNextIntl(config);
