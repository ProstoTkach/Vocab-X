'use client';

import en from '../../messages/en/common.json';
import uk from '../../messages/uk/common.json';

const TEXTS = { uk, en } as const;

/**
 * The last resort: the root layout itself broke, so there are no providers, no translations and
 * no theme here (this file replaces the whole document). The language comes from the address
 * (`/en/...`, otherwise the default), the texts from the same message files, and the look from the
 * system's own colors, which follow the device's light or dark setting.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const lang = typeof window !== 'undefined' && /^\/en(\/|$)/.test(window.location.pathname);
  const locale = lang ? 'en' : 'uk';
  const t = TEXTS[locale];
  return (
    <html lang={locale} style={{ colorScheme: 'light dark' }}>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: 'Canvas',
          color: 'CanvasText',
        }}
      >
        <main role="alert" style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.75rem' }}>{t.errorTitle}</h1>
          <p style={{ opacity: 0.75 }}>{t.errorText}</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: '2.75rem',
              padding: '0 1.25rem',
              borderRadius: '0.75rem',
              border: '1px solid currentColor',
              background: 'ButtonFace',
              color: 'ButtonText',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            {t.errorRetry}
          </button>{' '}
          {/* A full load, not a client navigation: the layout above is what broke. */}
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            style={{
              background: 'none',
              border: 0,
              color: 'inherit',
              font: 'inherit',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {t.goHome}
          </button>
        </main>
      </body>
    </html>
  );
}
