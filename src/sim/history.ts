// One history end to end (spec 03 §5 initial state, §12).
import { initialGauges, startActivity } from './cats';
import { sample } from './math';
import { rand } from './rng';
import type { PathMemo } from './space';
import { step } from './step';
import type { Content, Ctx, End, Pin, SimEvent, SimState, Streams } from './types';

/** Every cat and the world on the same stream (single-history mode, 03 §12.4). */
export const uniformStreams = (c: Content, stream: number): Streams =>
  Object.fromEntries([...c.cats.map((x) => [x.id, stream] as const), ['world', stream] as const]);

/** Pins in log order: (tick, seq). */
export const sortPins = (pins: readonly Pin[]): Pin[] =>
  [...pins].sort((a, b) => a.tick - b.tick || a.seq - b.seq);

/** The state at tick 0 for these streams (03 §5). */
export function initialState(
  c: Content,
  seed: number,
  streams: Streams,
  memo: PathMemo = {},
): SimState {
  const s: SimState = {
    tick: 0,
    weather: { now: c.world.weather.initial, startedAt: null, stoppedAt: null },
    facts: [],
    flags: Object.fromEntries(
      Object.entries(c.world.initialFlags ?? {}).map(([k, value]) => [k, { value, until: null }]),
    ),
    counters: Object.fromEntries(Object.entries(c.world.counters).map(([k, v]) => [k, v.start])),
    cats: {},
    storylets: Object.fromEntries(
      c.storylets.map((x) => [x.id, { state: null, enteredAt: 0, roles: {}, ended: false }]),
    ),
    pools: Object.fromEntries(c.detectors.map((d) => [d.id, []])),
    effects: [],
    pins: {},
    echoes: [],
    anchor: { reachedAt: null, deadAt: null },
  };
  for (const def of c.cats) {
    // The seed fixes every cat's starting stats: stream 0 in every mode (Tagir, 2026-11-21).
    const base = initialGauges(c, seed, `s0:${def.id}`, def.id);
    s.cats[def.id] = {
      pos: { at: def.start },
      route: [],
      activity: 'none',
      activityLeft: 0,
      activityStart: 0,
      activityPlace: null,
      control: 'free',
      interrupt: null,
      base,
      initial: { ...base },
      mods: [],
      pressure: 0,
      touchedBy: [],
      knowsClosed: [],
      heard: [],
      voiceAt: {},
    };
  }
  // The start activity is sampled as a free choice would be (its events are not part of any tick).
  const ctx: Ctx = {
    c,
    seed,
    streams,
    s,
    prev: s,
    t: 0,
    events: [],
    pins: [],
    pick: () => 0,
    chanceN: 0,
    memo,
  };
  for (const def of c.cats) startActivity(ctx, def.id, def.startActivity, 'free');
  return s;
}

export interface History {
  states: SimState[]; // states[t] is the world at the start of tick t
  events: SimEvent[][]; // events[t] happened going from t to t + 1
  end: End;
}

/**
 * Runs one history from tick 0 (03 §12): every branch point is sampled from the history's branch
 * scope. Stops at the chapter's end, or `afterAnchorTicks` after the anchor.
 */
export function runHistory(
  c: Content,
  seed: number,
  stream: number,
  pins: readonly Pin[] = [],
): History {
  const streams = uniformStreams(c, stream);
  const log = sortPins(pins);
  const memo: PathMemo = {};
  let s = initialState(c, seed, streams, memo);
  const states = [s];
  const events: SimEvent[][] = [];
  while (s.tick < c.world.ticks) {
    const t = s.tick;
    const r = step(
      c,
      seed,
      streams,
      s,
      log,
      (bp) =>
        sample(
          bp.options.map((o) => o.ppm),
          rand(seed, `s${stream}:branch`, t, bp.key, 1_000_000),
        ),
      memo,
    );
    if (!r.state) throw new Error('a sampled step cannot stop at a branch point');
    s = r.state;
    states.push(s);
    events.push(r.events);
    const reached = s.anchor.reachedAt;
    if (reached !== null && s.tick > reached + c.tuning.end.afterAnchorTicks) break;
  }
  // Pending pins expire at the chapter's end (03 §11).
  const last = structuredClone(s);
  for (const id of Object.keys(last.pins).sort())
    if (last.pins[id] === 'pending') last.pins[id] = 'expired';
  states[states.length - 1] = last;
  const end: End =
    last.anchor.reachedAt !== null
      ? { kind: 'anchor', tick: last.anchor.reachedAt }
      : { kind: 'dead', tick: last.anchor.deadAt ?? last.tick };
  return { states, events, end };
}
