// Builds the dev inspector's view of one tick of one history (docs/milestones/M1.5-inspector.md).
import type { Content } from '../content/schemas/content';
import { gaugeOf, test } from '../sim/conditions';
import type { History } from '../sim/history';
import { catNode, catPos, hhmm } from '../sim/space';
import { traceLine } from '../sim/trace';
import type { Ctx } from '../sim/types';
import type { InspectView } from './protocol';

/** How many earlier ticks of events the log shows besides the current one. */
const LOG_TICKS = 15;

export function inspectView(c: Content, h: History, tick: number): InspectView {
  const lastTick = h.states.length - 1;
  const t = Math.max(0, Math.min(tick, lastTick));
  const s = h.states[t];
  if (!s) throw new Error(`no state at ${t}`);
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
  };
  const hookIds = c.hooks.map((x) => x.id);

  return {
    tick: t,
    lastTick,
    clock: hhmm(c, t),
    end: { ...h.end, clock: hhmm(c, h.end.tick) },
    weather: s.weather.now,
    cats: c.cats.map((def) => {
      const cs = s.cats[def.id];
      if (!cs) throw new Error(`no cat ${def.id}`);
      return {
        id: def.id,
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
    events: h.events
      .slice(Math.max(0, t - LOG_TICKS), t) // what led to this state: events[t] happen after it
      .flatMap((list, i) => list.map((e) => traceLine(c, Math.max(0, t - LOG_TICKS) + i, e))),
  };
}
