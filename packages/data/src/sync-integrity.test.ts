// Sync integrity (plan step 6.5): devices that work offline, requests cut on the way, clocks that
// are wrong, another account on the same browser. Whatever happens, once every device has synced
// again each answer is on the server and on every device exactly once, and one taken back is
// nowhere. The fake server follows apps/web/src/lib/sync-server.ts rule by rule: pages per table
// (a page boundary sends some rows twice), an answer is kept once (sending it again changes
// nothing), deletion markers, and rows a device has not seen stop its write. The same cases run
// against the real server and database in apps/web/src/lib/sync-server.db.test.ts.
import { builtinCatalog } from '@vocabx/content';
import {
  DAY_MS,
  DEFAULT_SCHEDULER_PARAMS as params,
  DEFAULT_SETTINGS,
  seededRng,
  submitReview,
  undoReview,
  type ReviewOutcome,
  type Rng,
  type Word,
} from '@vocabx/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { LocalStorageRepo } from './local/local-storage-repo';
import {
  FULL_RESYNC_MS,
  noChanges,
  SYNC_PROTOCOL,
  type SyncChanges,
  type SyncRequest,
  type SyncResponse,
} from './local/sync-journal';
import { MemoryStorage } from './storage';

const catalog = builtinCatalog();
const T0 = 300 * DAY_MS + 10 * 3_600_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
/** The server's page is 500 rows a table and a device sends 1000: small here, so both are cut. */
const PAGE = 5;
const PUSH_ROWS = 7;
const MAX_ROUNDS = 50;

type Table = 'words' | 'decks' | 'cards' | 'events';
const TABLES: readonly Table[] = ['words', 'decks', 'cards', 'events'];
interface Row {
  seq: number;
  value: unknown;
  deleted: boolean;
}

class Account {
  state: { seq: number; fields: NonNullable<SyncChanges['state']> } | null = null;
  tables: Record<Table, Map<string, Row>> = {
    words: new Map(),
    decks: new Map(),
    cards: new Map(),
    events: new Map(),
  };
  liveEvents() {
    return [...this.tables.events].filter(([, r]) => !r.deleted).map(([id]) => id);
  }
}

class FakeServer {
  /** One sequence for every account, as `sync_seq` in the database. */
  seq = 0;
  accounts = new Map<string, Account>();

  account(id: string): Account {
    let a = this.accounts.get(id);
    if (!a) this.accounts.set(id, (a = new Account()));
    return a;
  }

  /** The route: `session` is the signed-in account. */
  post(session: string, body: string): { status: number; body?: string } {
    const req = JSON.parse(body) as SyncRequest;
    if (req.owner !== session) return { status: 409 };
    return { status: 200, body: JSON.stringify(this.exchange(this.account(session), req)) };
  }

  private exchange(acc: Account, { cursor, changes }: SyncRequest): SyncResponse {
    const read = this.readAfter(acc, cursor);
    if (read.unseen)
      return { applied: false, cursor: read.cursor, more: read.more, changes: read.changes };
    const seqs = this.write(acc, changes);
    return { applied: true, cursor: Math.max(cursor, ...seqs), more: false, changes: noChanges() };
  }

  private readAfter(acc: Account, cursor: number) {
    const after = (t: Table) =>
      [...acc.tables[t]]
        .filter(([, r]) => r.seq > cursor)
        .sort((a, b) => a[1].seq - b[1].seq)
        .slice(0, PAGE + 1);
    const state = acc.state && acc.state.seq > cursor ? acc.state : null;
    const rows = TABLES.map((t) => [t, after(t)] as const);
    const cut = rows.filter(([, r]) => r.length > PAGE);
    const seqs = [
      ...(state ? [state.seq] : []),
      ...rows.flatMap(([, r]) => r.map((x) => x[1].seq)),
    ];
    const cursorNext = cut.length
      ? Math.min(...cut.map(([, r]) => r[PAGE - 1]![1].seq))
      : Math.max(cursor, ...seqs);
    const changes = noChanges();
    if (state) changes.state = state.fields;
    for (const [t, r] of rows)
      for (const [id, row] of r.slice(0, PAGE))
        if (row.deleted) changes.deleted[t].push(id);
        else (changes[t] as unknown[]).push(row.value);
    return { changes, cursor: cursorNext, more: cut.length > 0, unseen: seqs.length > 0 };
  }

  private write(acc: Account, c: SyncChanges): number[] {
    const seqs: number[] = [];
    const next = () => {
      seqs.push(++this.seq);
      return this.seq;
    };
    if (c.state && Object.keys(c.state).length > 0)
      acc.state = { seq: next(), fields: { ...acc.state?.fields, ...c.state } };
    const upsert = (t: Table, id: string, value: unknown) =>
      acc.tables[t].set(id, { seq: next(), value, deleted: false });
    for (const w of c.words) upsert('words', w.id, w);
    for (const d of c.decks) upsert('decks', d.id, d);
    for (const p of c.cards) upsert('cards', p.wordId, p);
    // An answer never changes: one sent again (or taken back since) is left as it is.
    for (const e of c.events) if (!acc.tables.events.has(e.id)) upsert('events', e.id, e);
    for (const t of ['words', 'decks', 'cards'] as const)
      for (const id of c.deleted[t]) {
        const row = acc.tables[t].get(id);
        if (row) acc.tables[t].set(id, { ...row, seq: next(), deleted: true });
      }
    for (const id of c.deleted.events) {
      const row = acc.tables.events.get(id);
      if (row && !row.deleted) acc.tables.events.set(id, { ...row, seq: next(), deleted: true });
    }
    return seqs;
  }
}

/** What happens to one request on the way. */
type Fault = 'none' | 'request_lost' | 'answer_lost';

let ids = 0;
const newId = () => `e${++ids}`;

/** A browser: its data, its clock (maybe wrong), who is signed in, and the app's sync loop. */
class Device {
  readonly repo = new LocalStorageRepo(new MemoryStorage(), { catalog, dateKey: day });
  /** Answers given here and not taken back, newest last, for `undo`. */
  readonly answers: ReviewOutcome[] = [];
  session: string | null = null;
  constructor(
    private readonly server: FakeServer,
    /** How far this device's clock is off. */
    public clockOffset = 0,
  ) {}

  now(t: number) {
    return t + this.clockOffset;
  }

  signIn(account: string) {
    this.session = account;
    const { journal } = this.repo;
    if (journal.owner === account) journal.setActive(true);
    else if (!journal.owner) {
      journal.link(account);
      this.repo.markAllDirty();
    }
  }

  signOut() {
    this.repo.journal.setActive(false);
    this.session = null;
  }

  /** Another account on this browser's data: the learner's two choices (lib/sync.tsx). */
  async joinOther(account: string) {
    this.session = account;
    this.repo.journal.link(account);
    this.repo.markAllDirty();
  }
  async startOver(account: string) {
    this.session = account;
    await this.repo.reset();
    this.answers.length = 0;
    this.repo.journal.link(account);
  }

  async answer(wordId: string, t: number): Promise<ReviewOutcome> {
    const at = this.now(t);
    const outcome = await submitReview(this.repo, {
      word: { id: wordId, lang: 'en' },
      progress: await this.repo.progress.get(wordId),
      grade: 3,
      format: 'REC',
      responseMs: 1000,
      now: at,
      today: day(at),
      settings: DEFAULT_SETTINGS.study,
      params,
      newId,
    });
    this.answers.push(outcome);
    return outcome;
  }

  /** "Undo" takes back the last answer only, as on the review screen. */
  async undo(): Promise<string | null> {
    const last = this.answers.pop();
    if (!last) return null;
    await undoReview(this.repo, last);
    return last.event.id;
  }

  /**
   * One sync as lib/sync.tsx runs it. `faults`: what happens to each request in turn (then none).
   * Returns the last status: 200, 409, or 0 when the connection broke.
   */
  sync(t: number, faults: Fault[] = []): number {
    const { repo } = this;
    const { journal } = repo;
    if (!this.session || !journal.owner || !journal.active) return 0;
    const now = this.now(t);
    repo.beginSync(now);
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { changes, sent } = repo.collectChanges(PUSH_ROWS);
      const body = JSON.stringify({
        protocol: SYNC_PROTOCOL,
        owner: journal.owner,
        cursor: journal.cursor,
        changes,
      });
      const fault = faults.shift() ?? 'none';
      if (fault === 'request_lost') return 0;
      const res = this.server.post(this.session, body);
      if (fault === 'answer_lost') return 0;
      if (res.status === 409) {
        journal.setActive(false);
        return 409;
      }
      const answer = JSON.parse(res.body!) as SyncResponse;
      repo.takeAnswer(answer, sent, now);
      if (answer.applied && !journal.hasDirty()) return 200;
    }
    throw new Error('sync did not settle');
  }

  async eventIds(): Promise<string[]> {
    return (await this.repo.reviewLog.listSince(0)).map((e) => e.id);
  }
}

const word = (id: string): Word => ({
  id,
  lang: 'en',
  term: id,
  lemma: id,
  translations: { uk: ['слово'] },
  examples: [],
  source: 'manual',
  createdAt: T0,
  updatedAt: T0,
});
const WORDS = ['en:u:1', 'en:u:2', 'en:u:3', 'en:u:4'];
const sorted = (xs: readonly string[]) => [...xs].sort();

/**
 * The property: every device holds exactly the answers the account's server holds (each once),
 * which are exactly those given and not taken back; their stats and cards agree.
 */
async function expectSettled(
  server: FakeServer,
  account: string,
  devices: Device[],
  given: Set<string>,
) {
  const live = sorted(server.account(account).liveEvents());
  expect(live).toEqual(sorted([...given]));
  for (const d of devices) {
    const own = await d.eventIds();
    expect(own).toHaveLength(new Set(own).size);
    expect(sorted(own)).toEqual(live);
    expect(d.repo.journal.hasDirty()).toBe(false);
  }
  const [first, ...others] = devices;
  const from = day(T0 - 400 * DAY_MS);
  const to = day(T0 + 400 * DAY_MS);
  const stats = await first!.repo.reviewLog.dailyStats(from, to);
  expect(stats.reduce((n, s) => n + s.reviews, 0)).toBe(given.size);
  for (const d of others) {
    expect(await d.repo.reviewLog.dailyStats(from, to)).toEqual(stats);
    for (const id of WORDS)
      expect(await d.repo.progress.get(id)).toEqual(await first!.repo.progress.get(id));
  }
}

describe('sync integrity', () => {
  let server: FakeServer;
  let a: Device;
  let b: Device;
  /** Answers given and not taken back, by id. */
  let given: Set<string>;
  const answer = async (d: Device, wordId: string, t: number) =>
    given.add((await d.answer(wordId, t)).event.id);
  const undo = async (d: Device) => {
    const id = await d.undo();
    if (id) given.delete(id);
  };
  /** Both devices sync until nothing is left to tell (a device needs a second round to hear). */
  const settle = (t: number, devices = [a, b]) => {
    for (let i = 0; i < 2; i++) for (const d of devices) d.sync(t);
  };

  beforeEach(async () => {
    server = new FakeServer();
    a = new Device(server);
    b = new Device(server);
    given = new Set();
    for (const id of WORDS) await a.repo.words.save(word(id));
    a.signIn('u1');
    a.sync(T0);
    b.signIn('u1');
    b.sync(T0);
  });

  test('two devices offline: every answer of both arrives once, on the same word too', async () => {
    for (let i = 0; i < 6; i++) {
      await answer(a, WORDS[i % 4]!, T0 + i * 60_000);
      await answer(b, WORDS[(i + 1) % 4]!, T0 + i * 60_000 + 30_000);
    }
    settle(T0 + DAY_MS);
    await expectSettled(server, 'u1', [a, b], given);
  });

  test('a request lost on the way is sent again, nothing is missing', async () => {
    await answer(a, 'en:u:1', T0);
    await answer(a, 'en:u:2', T0 + 1000);
    expect(a.sync(T0 + 2000, ['request_lost'])).toBe(0);
    expect(a.repo.journal.hasDirty()).toBe(true);
    settle(T0 + 3000);
    await expectSettled(server, 'u1', [a, b], given);
  });

  test('an answer of the server lost on the way: the answers sent again are not doubled', async () => {
    for (let i = 0; i < 9; i++) await answer(a, WORDS[i % 4]!, T0 + i * 1000);
    // The server wrote the first batch; the device never heard, so it sends it again.
    const before = server.seq;
    expect(a.sync(T0 + DAY_MS, ['answer_lost'])).toBe(0);
    expect(server.seq).toBeGreaterThan(before);
    settle(T0 + DAY_MS);
    await expectSettled(server, 'u1', [a, b], given);
  });

  test('cut mid-way, then taken back: the answer stays taken back everywhere', async () => {
    await answer(a, 'en:u:1', T0);
    await answer(a, 'en:u:1', T0 + DAY_MS);
    // Both answers reached the server, the device did not hear it; then the learner undoes one.
    a.sync(T0 + DAY_MS + 1000, ['answer_lost']);
    const previous = a.answers.at(-1)!.previous;
    await undo(a);
    settle(T0 + DAY_MS + 2000);
    await expectSettled(server, 'u1', [a, b], given);
    expect(await a.repo.progress.get('en:u:1')).toEqual(previous);
  });

  test('a first answer cut mid-way and taken back leaves no card anywhere', async () => {
    await answer(a, 'en:u:2', T0);
    a.sync(T0 + 1000, ['answer_lost']);
    await undo(a);
    settle(T0 + 2000);
    await expectSettled(server, 'u1', [a, b], given);
    expect(await a.repo.progress.get('en:u:2')).toBeNull();
    expect(await b.repo.progress.get('en:u:2')).toBeNull();
  });

  test('a long history comes page by page; rows sent twice at a page edge count once', async () => {
    for (let i = 0; i < 23; i++) await answer(a, WORDS[i % 4]!, T0 + i * 60_000);
    a.sync(T0 + DAY_MS);
    const c = new Device(server);
    c.signIn('u1');
    c.sync(T0 + DAY_MS);
    await expectSettled(server, 'u1', [a, c], given);
    settle(T0 + DAY_MS);
    await expectSettled(server, 'u1', [a, b, c], given);
  });

  test.each([
    ['days behind', -3 * DAY_MS],
    ['an hour ahead', 3_600_000],
    ['months ahead (a full fetch again)', FULL_RESYNC_MS + 5 * DAY_MS],
  ])('a device clock %s loses and doubles nothing', async (_name, offset) => {
    a.clockOffset = offset;
    for (let i = 0; i < 5; i++) {
      await answer(a, WORDS[i % 4]!, T0 + DAY_MS + i * 60_000);
      await answer(b, WORDS[(i + 2) % 4]!, T0 + DAY_MS + i * 60_000);
    }
    settle(T0 + 2 * DAY_MS);
    await expectSettled(server, 'u1', [a, b], given);
    // The clock put right again: still nothing lost or doubled.
    a.clockOffset = 0;
    await answer(a, 'en:u:1', T0 + 3 * DAY_MS);
    settle(T0 + 3 * DAY_MS);
    await expectSettled(server, 'u1', [a, b], given);
  });

  describe('signing out, and another account on the same browser', () => {
    test('answers given while signed out go when the same account signs in again', async () => {
      a.signOut();
      await answer(a, 'en:u:1', T0 + 1000);
      expect(a.sync(T0 + 2000)).toBe(0);
      expect(server.account('u1').liveEvents()).toEqual([]);
      a.signIn('u1');
      settle(T0 + 3000);
      await expectSettled(server, 'u1', [a, b], given);
    });

    test('the browser’s data never goes to an account it does not belong to', async () => {
      await answer(a, 'en:u:1', T0 + 1000);
      // Signed in as another account in another tab: this one's data still belongs to the first.
      a.session = 'u2';
      expect(a.sync(T0 + 2000)).toBe(409);
      expect(a.repo.journal.active).toBe(false);
      expect(server.account('u2').liveEvents()).toEqual([]);
    });

    test('joining: everything here goes to the other account once; the first keeps its own', async () => {
      await answer(a, 'en:u:1', T0 + 1000);
      a.sync(T0 + 1000);
      const first = new Set(given);
      a.signOut();
      await answer(a, 'en:u:2', T0 + 2000);
      await a.joinOther('u2');
      a.sync(T0 + 3000);
      a.sync(T0 + 3000);
      expect(sorted(server.account('u2').liveEvents())).toEqual(sorted([...given]));
      expect(sorted(await a.eventIds())).toEqual(sorted([...given]));
      settle(T0 + 4000, [b]);
      await expectSettled(server, 'u1', [b], first);
    });

    test('starting over: nothing of the first account stays or goes to the other', async () => {
      await answer(a, 'en:u:1', T0 + 1000);
      a.sync(T0 + 1000);
      const other = new Device(server);
      other.signIn('u2');
      await other.repo.words.save(word('en:u:9'));
      await other.answer('en:u:9', T0 + 1500);
      other.sync(T0 + 1500);
      a.signOut();
      await a.startOver('u2');
      a.sync(T0 + 2000);
      expect(sorted(await a.eventIds())).toEqual(sorted(await other.eventIds()));
      expect(await a.repo.words.get('en:u:1')).toBeNull();
      expect(server.account('u2').liveEvents()).toHaveLength(1);
    });
  });

  test.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'random days of two offline devices (seed %i)',
    async (seed) => {
      const rng: Rng = seededRng(seed);
      const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
      const faults: Fault[] = ['none', 'none', 'request_lost', 'answer_lost'];
      let t = T0;
      for (let step = 0; step < 120; step++) {
        t += Math.floor(rng() * 3 * 3_600_000);
        const d = pick([a, b]);
        const r = rng();
        if (r < 0.55) await answer(d, pick(WORDS), t);
        else if (r < 0.7) await undo(d);
        else d.sync(t, [pick(faults), pick(faults)]);
      }
      settle(t + DAY_MS);
      await expectSettled(server, 'u1', [a, b], given);
    },
  );
});
