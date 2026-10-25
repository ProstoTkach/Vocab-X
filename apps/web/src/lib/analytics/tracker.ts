// Collects events in memory and sends them in batches to /api/track — only after the learner
// agreed. Analytics must never break or slow the app: every failure is swallowed, retries and
// the buffer are bounded, and nothing here throws to the caller.
import { KEYS, type Identity, type KeyValue } from './identity';
import type {
  AnalyticsEvent,
  CommonFields,
  Device,
  EventType,
  Params,
  SessionSummary,
} from './schema';

const DAY_MS = 86_400_000;
/** A session ends after this long without any activity. */
export const SESSION_IDLE_MS = 30 * 60_000;
/** Activity within this window counts the time as active. */
const ACTIVE_WINDOW_MS = 60_000;
/** Events kept at most (the oldest go first). */
export const BUFFER_MAX = 300;
/** A batch that failed this many times in a row is dropped. */
const RETRIES_MAX = 3;
/** Requests are kept under the server's body limit. */
const BATCH_MAX = 150;
/** Collected events go out once this many wait (small batches fit into a beacon). */
const FLUSH_AT = 40;
/**
 * A page going away sends one beacon; browsers drop a beacon over about 64 KB entirely, so it
 * carries what fits and the rest waits in storage for the next visit.
 */
export const BEACON_MAX_BYTES = 60_000;
/** A return after a pause of at least this many days is counted as such. */
const PAUSE_DAYS = 2;

export type Consent = 'granted' | 'denied' | null;

export interface TrackContext {
  ui_lang: string;
  device: Device;
  game_mode: string;
  study_mode: 'cards' | 'quiz';
}

export interface TrackerDeps {
  identity: Identity;
  storage: KeyValue;
  now: () => number;
  uuid: () => string;
  /** Sends a body; `beacon` when the page is going away. Resolves to "it went through". */
  send: (body: string, beacon: boolean) => Promise<boolean>;
  /** Debug mode output. */
  log: (...args: unknown[]) => void;
}

interface SessionState extends Omit<SessionSummary, 'ended_at' | 'end_reason'> {
  last_activity: number;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

const readJson = <T>(storage: KeyValue, key: string): T | null => {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
};

export class Tracker {
  private buffer: AnalyticsEvent[] = [];
  private sessions: SessionSummary[] = [];
  private failures = 0;
  private sending = false;
  /** The page is going away: everything waits for the one beacon, no requests of its own. */
  private leaving = false;
  private session: SessionState | null = null;
  private context: TrackContext = {
    ui_lang: 'uk',
    device: 'desktop',
    game_mode: 'max',
    study_mode: 'cards',
  };

  constructor(private readonly deps: TrackerDeps) {}

  get identity() {
    return this.deps.identity;
  }

  get consent(): Consent {
    const v = this.safe(() => this.deps.storage.getItem(KEYS.consent), null);
    return v === 'granted' || v === 'denied' ? v : null;
  }

  /** The learner's choice. Before it nothing is sent; after a "no" nothing is kept either. */
  setConsent(granted: boolean) {
    this.safe(() => this.deps.storage.setItem(KEYS.consent, granted ? 'granted' : 'denied'));
    if (!granted) {
      this.buffer = [];
      this.sessions = [];
      return;
    }
    this.track('consent_accepted');
    void this.flush();
  }

  setContext(patch: Partial<TrackContext>) {
    this.context = { ...this.context, ...patch };
  }

  /** Days since the first visit, as in every event. */
  daysSinceFirst(now = this.deps.now()) {
    return Math.max(0, Math.floor((now - this.identity.firstVisitAt) / DAY_MS));
  }

  /** How many sessions this browser has had so far. */
  sessionCount() {
    return Number(this.safe(() => this.deps.storage.getItem(KEYS.sessionCount), '0')) || 0;
  }

  // ---- sessions ----

  /**
   * Called once when the app starts: a session that was cut off (closed tab without
   * "pagehide", killed browser) is summed up now, then a new one begins.
   */
  start() {
    // Events that did not fit into the last beacon (or whose sending failed as the page closed).
    const outbox = readJson<{ events?: AnalyticsEvent[]; sessions?: SessionSummary[] }>(
      this.deps.storage,
      KEYS.outbox,
    );
    this.safe(() => this.deps.storage.removeItem(KEYS.outbox));
    if (outbox && this.consent !== 'denied') {
      this.buffer.push(...(outbox.events ?? []).slice(-BUFFER_MAX));
      this.sessions.push(...(outbox.sessions ?? []));
    }
    const stored = readJson<SessionState>(this.deps.storage, KEYS.session);
    if (stored?.session_id) this.queueSummary(stored, 'recovered', stored.last_activity);
    this.safe(() => this.deps.storage.removeItem(KEYS.session));
    for (const e of this.identity.events) this.track(e.type, e.params);
    this.beginSession();
  }

  private beginSession() {
    this.leaving = false;
    const now = this.deps.now();
    const lastEnd = Number(this.safe(() => this.deps.storage.getItem(KEYS.lastSessionEnd), '0'));
    const pauseDays = lastEnd ? Math.floor((now - lastEnd) / DAY_MS) : 0;
    const n = this.sessionCount() + 1;
    this.safe(() => this.deps.storage.setItem(KEYS.sessionCount, String(n)));
    const { identity: id } = this;
    this.session = {
      session_id: this.deps.uuid(),
      anon_id: id.anonId,
      variant: id.variant,
      assigned_by: id.assignedBy,
      internal: id.internal,
      host: id.host,
      device: this.context.device,
      ui_lang: this.context.ui_lang,
      started_at: now,
      last_activity: now,
      days_since_first_visit: this.daysSinceFirst(now),
      session_n: n,
      active_time_s: 0,
      duration_s: 0,
      screens_n: 0,
      answers_n: 0,
      correct_n: 0,
      scheduled_n: 0,
      scheduled_good_n: 0,
      finished_stack: false,
      goal_reached: false,
      xp: 0,
      settings_changes_n: 0,
      game_mode_start: this.context.game_mode,
      game_mode_end: this.context.game_mode,
      study_mode_start: this.context.study_mode,
      study_mode_end: this.context.study_mode,
      return_after_pause: lastEnd > 0 && pauseDays >= PAUSE_DAYS,
      pause_days: pauseDays,
    };
    this.persist();
    this.track('session_start', {
      count: n,
      pause_days: lastEnd ? pauseDays : null,
    });
    if (this.session.return_after_pause)
      this.track('return_after_pause', { pause_days: pauseDays });
  }

  /** Ends the session: its summary is queued and sent (by beacon when the page goes away). */
  endSession(reason: 'pagehide' | 'timeout') {
    const s = this.session;
    if (!s) return;
    if (reason === 'pagehide') this.leaving = true;
    const end = reason === 'timeout' ? s.last_activity : this.deps.now();
    this.track('session_end', { duration_s: Math.round((end - s.started_at) / 1000) });
    this.queueSummary(s, reason, end);
    this.session = null;
    this.safe(() => this.deps.storage.removeItem(KEYS.session));
  }

  /**
   * The session so far, while it goes on (end_reason "open"): sent when the tab is hidden and
   * every few minutes, so a browser closed without any "goodbye" still leaves its session in the
   * sheet. The server keeps one row per session and updates it with each newer summary.
   */
  snapshot() {
    const s = this.session;
    if (s) this.queueSummary(s, 'open', this.deps.now());
  }

  private queueSummary(s: SessionState, reason: SessionSummary['end_reason'], end: number) {
    const { last_activity: _last, ...rest } = s;
    if (reason !== 'open')
      this.safe(() => this.deps.storage.setItem(KEYS.lastSessionEnd, String(end)));
    const summary: SessionSummary = {
      ...rest,
      ended_at: end,
      end_reason: reason,
      duration_s: Math.max(0, Math.round((end - s.started_at) / 1000)),
      game_mode_end: reason === 'recovered' ? s.game_mode_end : this.context.game_mode,
      study_mode_end: reason === 'recovered' ? s.study_mode_end : this.context.study_mode,
    };
    if (this.consent === 'denied') return;
    if (this.identity.debug) {
      this.deps.log('[analytics] session', summary);
      return;
    }
    // Only the newest summary of a session is worth sending.
    this.sessions = this.sessions.filter((x) => x.session_id !== summary.session_id);
    this.sessions.push(summary);
  }

  /**
   * Activity (a tap, a key, a scroll): a long idle ends the session and this starts a new one.
   */
  activity() {
    const now = this.deps.now();
    if (this.session && now - this.session.last_activity > SESSION_IDLE_MS) {
      this.endSession('timeout');
      void this.flush();
    }
    if (!this.session) this.beginSession();
    this.session!.last_activity = now;
  }

  /**
   * Called every `stepMs` while the app is open: the time counts as active when the tab is
   * visible and something happened within the last minute.
   */
  tick(visible: boolean, stepMs: number) {
    const s = this.session;
    if (!s) return;
    const now = this.deps.now();
    if (now - s.last_activity > SESSION_IDLE_MS) {
      this.endSession('timeout');
      void this.flush();
      return;
    }
    if (visible && now - s.last_activity <= ACTIVE_WINDOW_MS) {
      s.active_time_s += Math.round(stepMs / 1000);
      this.persist();
    }
  }

  /** Seconds of active time in the current session. */
  activeSeconds() {
    return this.session?.active_time_s ?? 0;
  }

  private persist() {
    if (this.session)
      this.safe(() => this.deps.storage.setItem(KEYS.session, JSON.stringify(this.session)));
  }

  // ---- events ----

  track(type: EventType, params: Params = {}) {
    this.safe(() => {
      if (this.consent === 'denied') return;
      const now = this.deps.now();
      const event: AnalyticsEvent = {
        ...this.common(now),
        event_id: this.deps.uuid(),
        type,
        params,
      };
      this.summarize(event);
      if (this.identity.debug) {
        this.deps.log('[analytics]', type, params);
        return;
      }
      this.buffer.push(event);
      if (this.buffer.length > BUFFER_MAX) this.buffer.splice(0, this.buffer.length - BUFFER_MAX);
      if (this.buffer.length >= FLUSH_AT && !this.leaving) void this.flush();
    });
  }

  private common(now: number): CommonFields {
    const { identity: id } = this;
    return {
      anon_id: id.anonId,
      session_id: this.session?.session_id ?? 'no-session',
      variant: id.variant,
      assigned_by: id.assignedBy,
      internal: id.internal,
      host: id.host,
      ts: now,
      ui_lang: this.context.ui_lang,
      device: this.context.device,
      days_since_first_visit: this.daysSinceFirst(now),
      game_mode: this.context.game_mode,
      study_mode: this.context.study_mode,
    };
  }

  /** Session totals follow the events. */
  private summarize(e: AnalyticsEvent) {
    const s = this.session;
    if (!s) return;
    const p = e.params;
    switch (e.type) {
      case 'screen_view':
        s.screens_n += 1;
        break;
      case 'answer':
        s.answers_n += 1;
        if (p.correct === true) s.correct_n += 1;
        if (typeof p.xp === 'number') s.xp += p.xp;
        if (typeof p.interval_days === 'number' && p.interval_days >= 1) {
          s.scheduled_n += 1;
          if (typeof p.grade === 'number' && p.grade >= 3) s.scheduled_good_n += 1;
        }
        break;
      case 'review_end':
        if (p.finished_stack === true) s.finished_stack = true;
        break;
      case 'goal_reached':
        s.goal_reached = true;
        break;
      case 'game_mode_change':
      case 'study_mode_change':
      case 'setting_change':
        s.settings_changes_n += 1;
        break;
      default:
        break;
    }
    s.game_mode_end = e.game_mode;
    s.study_mode_end = e.study_mode;
    this.persist();
  }

  // ---- sending ----

  /** Sends what has been collected, if the learner agreed. Never throws. */
  async flush(beacon = false): Promise<void> {
    if (this.consent !== 'granted' || this.identity.debug) return;
    // A request in flight waits for the next round, but the page going away never waits.
    if (this.sending && !beacon) return;
    if (!this.buffer.length && !this.sessions.length) return;
    const events = this.buffer.splice(0, BATCH_MAX);
    const sessions = this.sessions.splice(0);
    let body = JSON.stringify({ events, sessions });
    if (beacon) {
      // Over the limit: the newest events go back and wait for the next visit.
      while (events.length && byteLength(body) > BEACON_MAX_BYTES) {
        this.buffer.unshift(...events.splice(Math.floor(events.length / 2)));
        body = JSON.stringify({ events, sessions });
      }
    }
    if (!beacon) this.sending = true;
    let ok: boolean;
    /** The request never got an answer (offline, or the page going away cut it off). */
    let unanswered = false;
    try {
      ok = await this.deps.send(body, beacon);
    } catch {
      ok = false;
      unanswered = true;
    }
    if (!beacon) this.sending = false;
    if (beacon) {
      // The page is going away: what is left (or what failed) is kept for the next visit.
      const left = ok
        ? { events: this.buffer, sessions: this.sessions }
        : {
            events: [...events, ...this.buffer],
            sessions: [...sessions, ...this.sessions],
          };
      if (left.events.length || left.sessions.length)
        this.safe(() =>
          this.deps.storage.setItem(
            KEYS.outbox,
            JSON.stringify({ events: left.events.slice(-BUFFER_MAX), sessions: left.sessions }),
          ),
        );
      else this.safe(() => this.deps.storage.removeItem(KEYS.outbox));
      return;
    }
    if (ok) {
      this.failures = 0;
      // More was waiting than one request carries.
      if (this.buffer.length) void this.flush(beacon);
      return;
    }
    this.failures += 1;
    // Noted once per run of failures (it goes out with the next batch that works).
    // An error answer of the server is worth knowing; a request cut off by leaving is not.
    if (this.failures === 1 && !unanswered) this.track('api_error', { source: 'track' });
    if (this.failures >= RETRIES_MAX) {
      this.failures = 0;
      return;
    }
    this.buffer.unshift(...events);
    if (this.buffer.length > BUFFER_MAX) this.buffer.length = BUFFER_MAX;
    this.sessions.unshift(...sessions);
  }

  /** What is waiting to be sent (for tests and the debug view). */
  pending() {
    return { events: [...this.buffer], sessions: [...this.sessions] };
  }

  private safe<T>(fn: () => T, fallback?: T): T {
    try {
      return fn();
    } catch {
      return fallback as T;
    }
  }
}
