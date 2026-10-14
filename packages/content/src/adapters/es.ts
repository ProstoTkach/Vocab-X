import { createBasicAdapter } from '@vocabix/core';

export const es = createBasicAdapter('es', {
  optionalPrefixes: ['el', 'la', 'los', 'las', 'un', 'una'],
});
