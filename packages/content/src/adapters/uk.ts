import { createBasicAdapter } from '@vocabx/core';

// Ukrainian is a translation language for now; the adapter grades typed translations.
export const uk = createBasicAdapter('uk', { foldMap: { ґ: 'г' } });
