import { createBasicAdapter } from '@vocabix/core';

// Articles are part of a German noun entry but missing one is not a wrong word;
// ß ↔ ss and umlauts are accepted as near matches via fold().
export const de = createBasicAdapter('de', {
  optionalPrefixes: ['der', 'die', 'das', 'ein', 'eine', 'zu'],
  foldMap: { ß: 'ss' },
});
