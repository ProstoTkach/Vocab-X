// Message keys are type-checked against the default (Ukrainian) locale.
import type aside from '../../messages/uk/aside.json';
import type common from '../../messages/uk/common.json';
import type devui from '../../messages/uk/devui.json';
import type languages from '../../messages/uk/languages.json';
import type meta from '../../messages/uk/meta.json';
import type nav from '../../messages/uk/nav.json';
import type pages from '../../messages/uk/pages.json';
import type settings from '../../messages/uk/settings.json';
import type themes from '../../messages/uk/themes.json';
import type { Locale } from './locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: {
      aside: typeof aside;
      common: typeof common;
      devui: typeof devui;
      languages: typeof languages;
      meta: typeof meta;
      nav: typeof nav;
      pages: typeof pages;
      settings: typeof settings;
      themes: typeof themes;
    };
  }
}
