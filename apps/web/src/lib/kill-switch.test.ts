import { describe, expect, it } from 'vitest';
import { KILL_SWITCHES, switchedOff, type KillSwitch } from './kill-switch';

describe('switchedOff', () => {
  it('is off by default', () => {
    for (const name of Object.keys(KILL_SWITCHES) as KillSwitch[])
      expect(switchedOff(name, {})).toBe(false);
  });

  it('reads 1, true and on in any case, with spaces', () => {
    for (const v of ['1', 'true', 'TRUE', ' on ', 'On'])
      expect(switchedOff('translate', { KILL_TRANSLATE: v })).toBe(true);
  });

  it('ignores other values and other flags', () => {
    for (const v of ['', '0', 'false', 'off', 'no'])
      expect(switchedOff('league', { KILL_LEAGUE: v })).toBe(false);
    expect(switchedOff('analytics', { KILL_LEAGUE: '1' })).toBe(false);
  });
});
