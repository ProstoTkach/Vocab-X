'use client';

import type { Level, StudyMode } from '@vocabx/core';
import { useTranslations } from 'next-intl';
import { formatOfLevel, labSelect } from './session-model';
import { STUDY_MODES } from './study-mode-menu';

/** The lab: the mode and the level are chosen here, for every card. */
export function LabControls({
  mode,
  level,
  onMode,
  onLevel,
}: {
  mode: StudyMode;
  level: Level;
  onMode: (next: StudyMode) => void;
  onLevel: (next: Level) => void;
}) {
  const t = useTranslations('review');
  const modeNames = useTranslations('settings.studyModes');
  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        aria-label={t('lab.mode')}
        value={mode}
        onChange={(e) => onMode(e.target.value as StudyMode)}
        className={labSelect}
      >
        {STUDY_MODES.map((m) => (
          <option key={m} value={m}>
            {modeNames(m)}
          </option>
        ))}
      </select>
      {/* The mixed mode goes through its steps by itself. */}
      {mode !== 'mixed' && (
        <select
          aria-label={t('lab.level')}
          value={level}
          onChange={(e) => onLevel(Number(e.target.value) as Level)}
          className={labSelect}
        >
          {([1, 2, 3] as const).map((n) => (
            <option key={n} value={n}>
              {t('level', { level: n, max: 3 })} · {t(`format.${formatOfLevel(mode, n)}`)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
