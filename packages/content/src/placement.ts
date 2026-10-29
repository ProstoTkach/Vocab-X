// The level test of onboarding: two fixed word lists per level, for the first try and for the
// one retake, so the retake never repeats a word. Each list holds the words asked first at that
// level (A1 3, A2 4, B1 5… — see placementFirst in core) followed by the 3 extra ones a mistake
// brings. All words come from the built-in level decks.
import {
  placementFirst,
  type Cefr,
  type Id,
  type LangCode,
  type PlacementLevel,
} from '@vocabx/core';
import { builtinCatalog, builtinWordId } from './decks/index';

interface PlacementSource {
  deckId: Id;
  cefr: Cefr;
  /** Lemmas: the first try, then the retake. */
  lists: readonly [readonly string[], readonly string[]];
}

export const PLACEMENT_SOURCES: Partial<Record<LangCode, readonly PlacementSource[]>> = {
  en: [
    {
      deckId: 'builtin:en-a1-basics',
      cefr: 'A1',
      lists: [
        ['family', 'water', 'happy', 'eat', 'read', 'today'],
        ['house', 'friend', 'cold', 'drink', 'speak', 'always'],
      ],
    },
    {
      deckId: 'builtin:en-a2-everyday',
      cefr: 'A2',
      lists: [
        ['weather', 'ticket', 'expensive', 'borrow', 'already', 'careful', 'holiday'],
        ['neighbour', 'luggage', 'crowded', 'invite', 'nearly', 'dangerous', 'gift'],
      ],
    },
    {
      deckId: 'builtin:en-b1-essentials',
      cefr: 'B1',
      lists: [
        [
          'achieve',
          'advice',
          'available',
          'complain',
          'decision',
          'improve',
          'journey',
          'reliable',
        ],
        [
          'afford',
          'appointment',
          'avoid',
          'confident',
          'deliver',
          'experience',
          'knowledge',
          'suggest',
        ],
      ],
    },
    {
      deckId: 'builtin:en-b2-advanced',
      cefr: 'B2',
      lists: [
        [
          'negotiate',
          'consequence',
          'reluctant',
          'significant',
          'assume',
          'inevitable',
          'thorough',
          'persuade',
          'evidence',
        ],
        [
          'approach',
          'sustainable',
          'emphasize',
          'acknowledge',
          'ambiguous',
          'abandon',
          'anticipate',
          'genuine',
          'priority',
        ],
      ],
    },
    {
      deckId: 'builtin:en-c1-proficient',
      cefr: 'C1',
      lists: [
        [
          'elaborate',
          'coherent',
          'mitigate',
          'prevalent',
          'deteriorate',
          'undermine',
          'feasible',
          'notion',
          'compelling',
          'endorse',
        ],
        [
          'substantial',
          'advocate',
          'discrepancy',
          'versatile',
          'consensus',
          'alleviate',
          'arbitrary',
          'contemplate',
          'explicit',
          'plausible',
        ],
      ],
    },
    {
      deckId: 'builtin:en-c2-mastery',
      cefr: 'C2',
      lists: [
        [
          'ubiquitous',
          'ephemeral',
          'meticulous',
          'pragmatic',
          'eloquent',
          'juxtapose',
          'serendipity',
          'conundrum',
          'exacerbate',
          'tenacious',
          'insidious',
        ],
        [
          'quintessential',
          'magnanimous',
          'obfuscate',
          'scrupulous',
          'acquiesce',
          'cacophony',
          'capricious',
          'circumspect',
          'disparage',
          'esoteric',
          'gregarious',
        ],
      ],
    },
  ],
  uk: [
    {
      deckId: 'builtin:uk-a2-essentials',
      cefr: 'A2',
      lists: [
        ['подорож', 'порада', 'погода', 'зустріч', 'уникати', 'покращувати', 'надійний'],
        ['досвід', 'рішення', 'знання', 'скаржитися', 'пропонувати', 'впевнений', 'зручний'],
      ],
    },
  ],
};

/**
 * The levels of the test for a language, easiest first: `attempt` 0 is the first try, 1 the
 * retake. Wrong options are taken from the rest of the level's deck, never from this try's
 * own words, so no word shows up twice in one try.
 */
export function placementTest(lang: LangCode, attempt: 0 | 1 = 0): PlacementLevel[] {
  const decks = new Map(builtinCatalog().decks.map((d) => [d.id, d]));
  return (PLACEMENT_SOURCES[lang] ?? []).flatMap((s) => {
    const deck = decks.get(s.deckId);
    if (!deck) return [];
    const wordIds = s.lists[attempt].map((lemma) => builtinWordId(lang, lemma));
    const asked = new Set(wordIds);
    return [
      {
        cefr: s.cefr,
        deckId: s.deckId,
        wordIds,
        poolIds: deck.wordIds.filter((id) => !asked.has(id)),
      },
    ];
  });
}

/** Words a list must hold at a level: the first ones and the three extra. */
export const placementListLength = (cefr: Cefr, index: number) =>
  placementFirst({ cefr, deckId: '', wordIds: Array<string>(99).fill('') }, index) + 3;
