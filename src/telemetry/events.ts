// Telemetry events (07 §6): every event carries a session id (random per page load), a counter and the
// elapsed real milliseconds of its session. No personal data, no cookies.

type Value = string | number | boolean | null;

/** Each event's props, as 07 §6 lists them. */
export interface EventProps {
  session_start: {
    build: string;
    locale: string;
    seed: number;
    vettedSeed: number;
    playedCardRule: string;
    viewport: string; // "1280x720"
  };
  inspect: { object: string; tick: number };
  card_played: {
    card: string;
    targetKind: 'cat' | 'object' | 'place';
    tick: number;
    special: boolean;
    behindLimit: boolean; // tick at least 30 below the highest tick ever played through
  };
  pin_moved: { kind: 'card' | 'power'; fromTick: number; toTick: number };
  pin_withdrawn: { kind: 'card' | 'power'; fromTick: number; toTick: null };
  power_used: { power: string; tick: number; place: string };
  break_alert: { count: number; confirmed: boolean };
  reopened: { paid: number; unpaid: number };
  scroll_back: { fromTick: number; toTick: number };
  fray_seen: { tick: number };
  hint_shown: { id: string };
  story_watched: { state: string; tick: number };
  recompute: { ms: number; ticks: number; cases: number; live: number };
  anchor_reached: {
    realSeconds: number;
    pins: number;
    withdrawals: number;
    scrollBacks: number;
    powers: number;
    gazes: number;
  };
  cta_click: { which: string };
  session_end: { realSeconds: number; story: number; lanternEdge: number; anchorWatched: boolean };
}

export type EventName = keyof EventProps;

export const EVENT_NAMES: readonly EventName[] = [
  'session_start',
  'inspect',
  'card_played',
  'pin_moved',
  'pin_withdrawn',
  'power_used',
  'break_alert',
  'reopened',
  'scroll_back',
  'fray_seen',
  'hint_shown',
  'story_watched',
  'recompute',
  'anchor_reached',
  'cta_click',
  'session_end',
];

/** One recorded event. `n` counts the session's events from 0; `ms` is real time since its load. */
export interface TelemetryEvent {
  session: string;
  n: number;
  ms: number;
  name: EventName;
  props: Record<string, Value>;
}

export type Track = <N extends EventName>(name: N, props: EventProps[N]) => void;
