import type { AppSettings, GamificationState } from '../model';
import { DEFAULT_RETENTION } from './params';

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'system',
  study: {
    retention: DEFAULT_RETENTION,
    newPerDay: null,
    reviewsPerDay: null,
    // Two grades to start with; a tip later offers all four for finer intervals.
    twoGrades: true,
    typing: false,
    autoSpeak: true,
    animationSpeed: 1,
    cardFontScale: 1,
    swipeLayout: 'default',
    dailyGoalXp: 50,
    gradeButtonsOnPhone: false,
  },
  gamification: 'max',
  timeOffsetMs: 0,
  devTools: false,
  quizMode: false,
  sentenceMode: false,
  tipsSeen: [],
  levelSeen: 1,
  xpBonus: 0,
};

export const INITIAL_GAMIFICATION: GamificationState = {
  xpTotal: 0,
  streakDays: 0,
  streakFreezes: 0,
  lastGoalDate: null,
  achievements: {},
  inventory: [],
  equipped: {},
  wardrobeSeen: [],
};
