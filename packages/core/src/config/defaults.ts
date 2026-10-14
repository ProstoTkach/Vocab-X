import type { AppSettings, GamificationState } from '../model';
import { DEFAULT_RETENTION } from './params';

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'system',
  study: {
    retention: DEFAULT_RETENTION,
    newPerDay: 10,
    reviewsPerDay: 100,
    twoGrades: false,
    typing: false,
    autoSpeak: true,
    animationSpeed: 1,
    cardFontScale: 1,
    swipeLayout: 'default',
    dailyGoalXp: 50,
  },
  timeOffsetMs: 0,
};

export const INITIAL_GAMIFICATION: GamificationState = {
  xpTotal: 0,
  streakDays: 0,
  streakFreezes: 0,
  lastGoalDate: null,
  achievements: {},
  inventory: [],
  equipped: {},
};
