import { createBasicAdapter } from '@vocabix/core';

// "to achieve" vs "achieve", "the bridge" vs "bridge" should both count as the word.
export const en = createBasicAdapter('en', { optionalPrefixes: ['to', 'the', 'a', 'an'] });
