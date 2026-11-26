// Builds the debug panel's view of one tick of one history (docs/milestones/M1.5-inspector.md; the
// State and Wave tabs of 06 §10, M8).
import type { Content } from '../content/schemas/content';
import { gaugeOf, test } from '../sim/conditions';
import type { History } from '../sim/history';
import { catNode, catPos, hhmm } from '../sim/space';
import { traceLine } from '../sim/trace';
import { newDecisionMemo, type CatId, type Ctx, type SimEvent, type SimState } from '../sim/types';
import { WAVE_TOTAL, type ChainState, type Fog, type FogCase } from '../sim/fog';
import type { CaseView, InspectView } from './protocol';

/** How many earlier ticks of events the log shows besides the current one. */
export const LOG_TICKS = 15;

/**
 * What the dev page inspects at one tick: a state, the events of the ticks before it (oldest first),
 * how its timeline or history ends, its last tick, and which cats are live (null: every cat, a
 * single history).
 */
export interface InspectSource {
  tick: number;
  state: SimState;
  recent: { tick: number; events: SimEvent[] }[];
  end: { kind: string; tick: number };
  lastTick: number;
  live: readonly CatId[] | null;
}

/** The source for tick t of a single history (03 §12.4). */
export function historySource(h: History, tick: number): InspectSource {
  const lastTick = h.states.length - 1;
  const t = Math.max(0, Math.min(tick, lastTick));
  const s = h.states[t];
  if (!s) throw new Error(`no state at ${t}`);
  const from = Math.max(0, t - LOG_TICKS);
  return {
    tick: t,
    state: s,
    recent: h.events.slice(from, t).map((events, i) => ({ tick: from + i, events })),
    end: h.end,
    lastTick,
    live: null,
  };
}

/** The view of one inspected tick, for the dev page's panel. */
export function inspectView(c: Content, src: InspectSource): InspectView {
  const { tick: t, state: s, lastTick } = src;
  // A read-only context so conditions and gauges can be evaluated on this state.
  const ctx: Ctx = {
    c,
    seed: 0,
    streams: {},
    s,
    prev: s,
    t,
    events: [],
    pins: [],
    pick: () => 0,
    chanceN: 0,
    memo: {},
    decisions: newDecisionMemo(),
  };
  const hookIds = c.hooks.map((x) => x.id);

  return {
    tick: t,
    lastTick,
    clock: hhmm(c, t),
    end: { ...src.end, clock: hhmm(c, src.end.tick) },
    weather: s.weather.now,
    cats: c.cats.map((def) => {
      const cs = s.cats[def.id];
      if (!cs) throw new Error(`no cat ${def.id}`);
      return {
        id: def.id,
        live: src.live === null || src.live.includes(def.id),
        pos: catPos(c, cs),
        node: catNode(cs),
        activity: cs.activity,
        place: cs.activityPlace,
        control: cs.control,
        interrupt: cs.interrupt ? `${cs.interrupt.action} (${cs.interrupt.left})` : null,
        route: cs.route,
        hooks: hookIds
          .filter((g) => cs.base[g] !== undefined)
          .map((g): [string, number] => [g, gaugeOf(ctx, def.id, g)]),
        pressure: cs.pressure,
        touchedBy: cs.touchedBy,
      };
    }),
    storylets: c.storylets.flatMap((def) => {
      const r = s.storylets[def.id];
      if (!r || r.state === null) return [];
      const roles = Object.entries(r.roles)
        .map(([name, cats]) => `${name}=${cats.join('+')}`)
        .join(' ');
      return [{ id: def.id, state: r.state, ended: r.ended, roles }];
    }),
    facts: s.facts,
    flags: Object.keys(s.flags)
      .sort()
      .map((k) => `${k}=${s.flags[k]?.value ?? 0}`),
    counters: Object.entries(s.counters),
    closedEdges: c.edges.filter((e) => e.when && !test(ctx, e.when, {})).map((e) => e.id),
    effects: s.effects.map((e) => ({
      kind: e.kind,
      place: e.place,
      radiusM: e.radiusM,
      left: e.left,
      source: 'card' in e.source ? e.source.card : e.source.power,
    })),
    events: src.recent.flatMap(({ tick, events }) => events.map((e) => traceLine(c, tick, e))),
    pools: c.detectors.flatMap((d) =>
      (s.pools[d.id] ?? []).map((m) => `${d.id} stage ${m.stage} since ${hhmm(c, m.stageTick)}`),
    ),
    cases: [],
    chain: null,
    stats: { cases: [], live: [], states: [], localCauses: 0 },
  };
}

/** A fog case's weight in ppm and its links' values (06 §10). */
export function caseView(fc: FogCase, index: number): CaseView {
  return {
    index,
    weightPpm: Math.trunc(fc.weight / (WAVE_TOTAL / 1_000_000)),
    links: [`weather ${fc.weather}`, ...Object.entries(fc.links).map(([k, v]) => `${k}=${v}`)],
  };
}

/** A fogged cat's chain in each case, most likely state first (06 §10, State). */
export function chainView(fog: Fog, cat: CatId): NonNullable<InspectView['chain']> {
  return {
    cat,
    cases: fog.cases.map((fc, i) => ({
      ...caseView(fc, i),
      states: [...(fc.cats[cat]?.chain ?? [])]
        .sort((a, b) => b.p - a.p)
        .map((x) => ({ p: x.p, text: stateText(x.s) })),
    })),
  };
}

const stateText = (s: ChainState): string =>
  [
    `${s.activity} @ ${s.place}`,
    s.walk ? `walking ${s.walk.from} -> ${s.walk.path[s.walk.path.length - 1] ?? ''}` : '',
    s.interrupt ? `interrupted ${s.interrupt.action}` : '',
    s.control !== 'free' ? `[${s.control}]` : '',
    Object.entries(s.bands)
      .map(([g, b]) => `${g}:${b}`)
      .join(' '),
  ]
    .filter(Boolean)
    .join(' · ');
