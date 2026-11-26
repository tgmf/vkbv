// The playtest numbers of `docs/playtest-kit.md` §4 from a telemetry buffer. The buffer may hold several
// page loads (sessions, Tagir M8-1): times are counted as played time, each session's span added in the
// order the sessions first appear.
import type { TelemetryEvent } from './events';

export interface SessionSummary {
  sessions: number;
  minutesPlayed: number;
  reachedAnchor: boolean;
  minutesToAnchor: number | null;
  pins: number;
  withdrawals: number;
  moves: number;
  lures: number;
  gazes: number;
  scrollBacks: number;
  pinsBehindLimit: number;
  pinsBehindLimitAfterFray: number;
  luresBeforeFirstMartiOut: number;
  breakAlerts: number;
  breakAlertsConfirmed: number;
  recomputeMedianMs: number | null;
  recomputeMaxMs: number | null;
  hintsShown: string[];
  objectsInspected: number;
  cta: string[];
}

/** The content ids the numbers read: the lure's and Gaze's power ids, and the states that mean "Marti is out" (`flow.outOn`). */
export interface SummaryIds {
  lure: string;
  gaze: string;
  out: readonly string[];
}

const minutes = (ms: number): number => Math.round(ms / 6000) / 10;

export function summarizeSession(
  events: readonly TelemetryEvent[],
  ids: SummaryIds,
): SessionSummary {
  // played time before each session, and each event's played time
  const first: Record<string, number> = {};
  const last: Record<string, number> = {};
  const order: string[] = [];
  for (const e of events) {
    if (!(e.session in first)) {
      first[e.session] = e.ms;
      order.push(e.session);
    }
    last[e.session] = e.ms;
  }
  const before: Record<string, number> = {};
  let total = 0;
  for (const s of order) {
    before[s] = total;
    total += (last[s] ?? 0) - (first[s] ?? 0);
  }
  const played = (e: TelemetryEvent) => (before[e.session] ?? 0) + e.ms - (first[e.session] ?? 0);

  const of = (name: TelemetryEvent['name']) => events.filter((e) => e.name === name);
  const anchor = of('anchor_reached')[0];
  const fray = events.findIndex((e) => e.name === 'fray_seen');
  const out = events.findIndex(
    (e) => e.name === 'story_watched' && ids.out.includes(String(e.props['state'])),
  );
  const behind = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.name === 'card_played' && e.props['behindLimit'] === true);
  const powers = (id: string) => of('power_used').filter((e) => e.props['power'] === id);
  const ms = of('recompute')
    .map((e) => Number(e.props['ms']))
    .sort((a, b) => a - b);
  const median =
    ms.length === 0
      ? null
      : ms.length % 2 === 1
        ? (ms[(ms.length - 1) / 2] ?? null)
        : Math.round(((ms[ms.length / 2 - 1] ?? 0) + (ms[ms.length / 2] ?? 0)) / 2);
  const alerts = of('break_alert');

  return {
    sessions: order.length,
    minutesPlayed: minutes(total),
    reachedAnchor: anchor !== undefined,
    minutesToAnchor: anchor ? minutes(played(anchor)) : null,
    pins: of('card_played').length,
    withdrawals: of('pin_withdrawn').length,
    moves: of('pin_moved').length,
    lures: powers(ids.lure).length,
    gazes: powers(ids.gaze).length,
    scrollBacks: of('scroll_back').length,
    pinsBehindLimit: behind.length,
    pinsBehindLimitAfterFray: fray < 0 ? 0 : behind.filter(({ i }) => i > fray).length,
    luresBeforeFirstMartiOut: events.filter(
      (e, i) => e.name === 'power_used' && e.props['power'] === ids.lure && (out < 0 || i < out),
    ).length,
    breakAlerts: alerts.length,
    breakAlertsConfirmed: alerts.filter((e) => e.props['confirmed'] === true).length,
    recomputeMedianMs: median,
    recomputeMaxMs: ms.length === 0 ? null : (ms[ms.length - 1] ?? null),
    hintsShown: of('hint_shown').map((e) => String(e.props['id'])),
    objectsInspected: new Set(of('inspect').map((e) => String(e.props['object']))).size,
    cta: of('cta_click').map((e) => String(e.props['which'])),
  };
}
