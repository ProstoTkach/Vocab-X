// Message keys are type-checked against the default (Ukrainian) locale.
import type analytics from '../../messages/uk/analytics.json';
import type aside from '../../messages/uk/aside.json';
import type character from '../../messages/uk/character.json';
import type common from '../../messages/uk/common.json';
import type data from '../../messages/uk/data.json';
import type decks from '../../messages/uk/decks.json';
import type dev from '../../messages/uk/dev.json';
import type devui from '../../messages/uk/devui.json';
import type feedback from '../../messages/uk/feedback.json';
import type languages from '../../messages/uk/languages.json';
import type library from '../../messages/uk/library.json';
import type meta from '../../messages/uk/meta.json';
import type nav from '../../messages/uk/nav.json';
import type onboarding from '../../messages/uk/onboarding.json';
import type pages from '../../messages/uk/pages.json';
import type review from '../../messages/uk/review.json';
import type settings from '../../messages/uk/settings.json';
import type themes from '../../messages/uk/themes.json';
import type tours from '../../messages/uk/tours.json';
import type words from '../../messages/uk/words.json';
import type { Locale } from './locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: {
      analytics: typeof analytics;
      aside: typeof aside;
      character: typeof character;
      common: typeof common;
      data: typeof data;
      decks: typeof decks;
      dev: typeof dev;
      devui: typeof devui;
      feedback: typeof feedback;
      languages: typeof languages;
      library: typeof library;
      meta: typeof meta;
      nav: typeof nav;
      onboarding: typeof onboarding;
      pages: typeof pages;
      review: typeof review;
      settings: typeof settings;
      themes: typeof themes;
      tours: typeof tours;
      words: typeof words;
    };
  }
}
