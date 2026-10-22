import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@vocabx/core', '@vocabx/content', '@vocabx/data'],
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // PNG character art is served re-encoded as WebP at the size it is shown (see lib/images).
    qualities: [75, 90],
    // The pictures rarely change: browsers and the CDN keep them for a day.
    minimumCacheTTL: 86_400,
  },
};

export default withNextIntl(config);
