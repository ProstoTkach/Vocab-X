import { createBasicAdapter } from '@vocabx/core';

export const es = createBasicAdapter('es', {
  optionalPrefixes: ['el', 'la', 'los', 'las', 'un', 'una'],
});
