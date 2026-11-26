// summarizeSession (docs/playtest-kit.md §4) on a scripted session of two page loads, and the kept
// buffer (07 §6, M8-1).
import { describe, expect, it } from 'vitest';
import {
  BUFFER_KEY,
  createTelemetry,
  EVENT_NAMES,
  summarizeSession,
  type EventName,
  type EventProps,
  type Telemetry,
} from '../../src/telemetry';

const IDS = { lure: 'lure', gaze: 'gaze', out: ['door_lure.out'] };

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

/** A telemetry whose clock is set by the script. */
function scripted(storage = fakeStorage(), session = 's1', remote?: { sent: string[] }) {
  let t = 0;
  const tel = createTelemetry({
    storage,
    now: () => t,
    session,
    ...(remote && {
      remote: {
        url: 'https://example.invalid/t',
        send: (_u: string, b: string) => (remote.sent.push(b), true),
      },
    }),
    remoteOn: () => true,
  });
  const at = <N extends EventName>(ms: number, name: N, props: EventProps[N]) => {
    t = ms;
    tel.track(name, props);
  };
  return { tel, at, storage };
}

function playSession(): Telemetry {
  const storage = fakeStorage();
  // first page load: 10 minutes
  const a = scripted(storage, 'a');
  a.at(0, 'session_start', {
    build: 'graybox',
    locale: 'en',
    seed: 1,
    vettedSeed: 49598663,
    playedCardRule: 'pinned',
    viewport: '1280x720',
  });
  a.at(1000, 'hint_shown', { id: 'watch' });
  a.at(60_000, 'inspect', { object: 'melmans_whistle', tick: 20 });
  a.at(70_000, 'inspect', { object: 'odds_jar', tick: 25 });
  a.at(80_000, 'inspect', { object: 'melmans_whistle', tick: 30 });
  a.at(90_000, 'card_played', {
    card: 'tea_break',
    targetKind: 'cat',
    tick: 40,
    special: false,
    behindLimit: false,
  });
  a.at(91_000, 'recompute', { ms: 80, ticks: 10, cases: 1, live: 1 });
  a.at(120_000, 'hint_shown', { id: 'card' });
  a.at(200_000, 'scroll_back', { fromTick: 300, toTick: 100 });
  a.at(210_000, 'card_played', {
    card: 'box',
    targetKind: 'place',
    tick: 100,
    special: false,
    behindLimit: true,
  });
  a.at(211_000, 'recompute', { ms: 120, ticks: 200, cases: 3, live: 2 });
  a.at(300_000, 'fray_seen', { tick: 1080 });
  a.at(400_000, 'power_used', { power: 'lure', tick: 715, place: 'flat.door' });
  a.at(401_000, 'recompute', { ms: 60, ticks: 30, cases: 2, live: 1 });
  a.at(500_000, 'pin_moved', { kind: 'card', fromTick: 100, toTick: 90 });
  a.at(600_000, 'session_end', {
    realSeconds: 600,
    story: 10,
    lanternEdge: 1080,
    anchorWatched: false,
  });
  // second page load (a reload): 5 minutes more, the clock starts again
  const b = scripted(storage, 'b');
  b.at(0, 'session_start', {
    build: 'graybox',
    locale: 'en',
    seed: 1,
    vettedSeed: 49598663,
    playedCardRule: 'pinned',
    viewport: '1280x720',
  });
  b.at(10_000, 'pin_withdrawn', { kind: 'power', fromTick: 715, toTick: null });
  b.at(11_000, 'break_alert', { count: 3, confirmed: false });
  b.at(12_000, 'break_alert', { count: 3, confirmed: true });
  b.at(13_000, 'reopened', { paid: 3, unpaid: 4 });
  b.at(20_000, 'card_played', {
    card: 'tea_break',
    targetKind: 'place',
    tick: 180,
    special: false,
    behindLimit: true,
  });
  b.at(30_000, 'power_used', { power: 'gaze', tick: 200, place: 'town.roadworks' });
  b.at(40_000, 'power_used', { power: 'lure', tick: 715, place: 'flat.door' });
  b.at(100_000, 'story_watched', { state: 'door_lure.out', tick: 725 });
  b.at(110_000, 'power_used', { power: 'lure', tick: 900, place: 'flat.door' });
  b.at(180_000, 'anchor_reached', {
    realSeconds: 180,
    pins: 2,
    withdrawals: 1,
    scrollBacks: 0,
    powers: 3,
    gazes: 1,
  });
  b.at(200_000, 'cta_click', { which: 'follow' });
  b.at(300_000, 'session_end', {
    realSeconds: 300,
    story: 100,
    lanternEdge: 845,
    anchorWatched: true,
  });
  return b.tel;
}

describe('summarizeSession', () => {
  it('a scripted session holds every event and gives the expected numbers', () => {
    const events = playSession().events();
    expect(new Set(events.map((e) => e.name))).toEqual(new Set(EVENT_NAMES));
    expect(summarizeSession(events, IDS)).toEqual({
      sessions: 2,
      minutesPlayed: 15,
      reachedAnchor: true,
      minutesToAnchor: 13,
      pins: 3,
      withdrawals: 1,
      moves: 1,
      lures: 3,
      gazes: 1,
      scrollBacks: 1,
      pinsBehindLimit: 2,
      pinsBehindLimitAfterFray: 1,
      luresBeforeFirstMartiOut: 2,
      breakAlerts: 2,
      breakAlertsConfirmed: 1,
      recomputeMedianMs: 80,
      recomputeMaxMs: 120,
      hintsShown: ['watch', 'card'],
      objectsInspected: 2,
      cta: ['follow'],
    });
  });

  it('an empty buffer gives zeros and no anchor', () => {
    const s = summarizeSession([], IDS);
    expect(s.sessions).toBe(0);
    expect(s.minutesPlayed).toBe(0);
    expect(s.reachedAnchor).toBe(false);
    expect(s.minutesToAnchor).toBeNull();
    expect(s.recomputeMedianMs).toBeNull();
    expect(s.luresBeforeFirstMartiOut).toBe(0);
  });
});

describe('the telemetry buffer', () => {
  it('is kept across page loads and cleared on demand', () => {
    const storage = fakeStorage();
    scripted(storage, 'a').at(5, 'hint_shown', { id: 'watch' });
    const second = scripted(storage, 'b');
    second.at(7, 'fray_seen', { tick: 3 });
    expect(second.tel.events().map((e) => [e.session, e.n, e.name])).toEqual([
      ['a', 0, 'hint_shown'],
      ['b', 0, 'fray_seen'],
    ]);
    second.tel.clear();
    expect(second.tel.events()).toEqual([]);
    expect(storage.getItem(BUFFER_KEY)).toBe('[]');
  });

  it('a broken buffer starts empty', () => {
    const storage = fakeStorage();
    storage.setItem(BUFFER_KEY, '{oops');
    expect(scripted(storage).tel.events()).toEqual([]);
  });

  it('the remote sink sends batches of 20 and the rest on flush', () => {
    const remote = { sent: [] as string[] };
    const { tel, at } = scripted(fakeStorage(), 's', remote);
    for (let i = 0; i < 25; i++) at(i, 'hint_shown', { id: `h${i}` });
    expect(remote.sent).toHaveLength(1);
    expect(JSON.parse(remote.sent[0] ?? '[]')).toHaveLength(20);
    tel.flush();
    expect(remote.sent).toHaveLength(2);
    expect(JSON.parse(remote.sent[1] ?? '[]')).toHaveLength(5);
  });

  it('nothing is sent while the remote sink is off', () => {
    const sent: string[] = [];
    let on = false;
    const tel = createTelemetry({
      storage: fakeStorage(),
      now: () => 0,
      session: 's',
      remote: { url: 'u', send: (_u, b) => (sent.push(b), true) },
      remoteOn: () => on,
    });
    for (let i = 0; i < 30; i++) tel.track('fray_seen', { tick: i });
    tel.flush();
    expect(sent).toEqual([]);
    on = true;
    tel.track('fray_seen', { tick: 99 });
    tel.flush();
    expect(sent).toHaveLength(1);
  });
});
