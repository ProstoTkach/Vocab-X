import { createBasicAdapter } from '@vocabx/core';

// Both a studied language and a translation language. ґ → г and й-/і- spelling variants
// (ймовірний / імовірний) are accepted as near matches via fold() and word variants.
export const uk = createBasicAdapter('uk', { foldMap: { ґ: 'г' } });
