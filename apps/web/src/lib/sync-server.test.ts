// What a device may send: the checks before anything reaches the database (step 2.2).
import { describe, expect, test } from 'vitest';
import { noChanges, SYNC_PROTOCOL } from '@vocabx/data';
import { MAX_RESPONSE_MS, parseSyncRequest, protocolFit } from './sync-server';

const answer = (o: Record<string, unknown> = {}) => ({
  id: 'e1',
  wordId: 'w1',
  at: 1_700_000_000_000,
  grade: 3,
  format: 'REC',
  responseMs: 1500,
  wasNew: false,
  retention: 0.9,
  xp: 10,
  ...o,
});
const request = (events: unknown[]) => ({
  owner: 'u1',
  cursor: 0,
  changes: { ...noChanges(), events },
});

describe('a sync request', () => {
  test('an honest answer passes unchanged', () => {
    expect(parseSyncRequest(request([answer()]))?.changes.events[0]).toMatchObject(answer());
  });

  test('a time no date can hold is refused, not stored', () => {
    expect(parseSyncRequest(request([answer({ at: 9e15 })]))).toBeNull();
    expect(parseSyncRequest(request([answer({ at: Infinity })]))).toBeNull();
    expect(parseSyncRequest(request([answer({ at: -1 })]))).toBeNull();
  });

  test('an answer left open for days is kept as an hour', () => {
    const [kept] = parseSyncRequest(request([answer({ responseMs: 3e9 })]))!.changes.events;
    expect(kept?.responseMs).toBe(MAX_RESPONSE_MS);
  });

  test('numbers out of range are refused', () => {
    expect(parseSyncRequest(request([answer({ xp: 1e9 })]))).toBeNull();
    expect(parseSyncRequest(request([answer({ retention: 7 })]))).toBeNull();
    expect(parseSyncRequest(request([answer({ grade: 9 })]))).toBeNull();
  });

  test('not a request at all', () => {
    expect(parseSyncRequest(null)).toBeNull();
    expect(parseSyncRequest({ owner: 'u1' })).toBeNull();
  });
});

describe('the sync protocol (version skew)', () => {
  test('today’s devices and those from before the protocol had a number are served', () => {
    expect(protocolFit({ ...request([]), protocol: SYNC_PROTOCOL })).toBe('ok');
    expect(protocolFit(request([]))).toBe('ok');
    expect(parseSyncRequest({ ...request([]), protocol: SYNC_PROTOCOL })).not.toBeNull();
  });

  test('a device older than the server serves is told to update; a newer one waits', () => {
    expect(protocolFit({ ...request([]), protocol: 1 }, 2, 2)).toBe('old');
    expect(protocolFit(request([]), 2, 2)).toBe('old');
    expect(protocolFit({ ...request([]), protocol: 3 }, 1, 2)).toBe('new');
  });

  test('a protocol that is not a number is left to the request check, which refuses it', () => {
    const odd = { ...request([]), protocol: 'x' };
    expect(protocolFit(odd)).toBe('ok');
    expect(parseSyncRequest(odd)).toBeNull();
    expect(parseSyncRequest({ ...request([]), protocol: 1.5 })).toBeNull();
  });
});
