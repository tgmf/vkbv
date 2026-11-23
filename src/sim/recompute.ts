// The re-run (03 §17, 04 §6): after an edit the lantern and the fog are replayed from the last
// checkpoint before the edit tick and run on, tick by tick, to the frontier limit, the fray or the
// chapter's end, streaming a frame per tick. Also the whole-day run (03 §13.1) and the projection from
// a wave, for strain (§14).
import { projectToEnd, type Projection } from './backward';
import { pointMass, type Fog, type FogSetup } from './fog';
import { INACTIVE, setFact } from './fog-quantities';
import { frameOf } from './frames';
import { sortPins } from './history';
import { advance, initialWave, type Wave } from './lantern';
import { PPM } from './math';
import { watch } from './observe';
import { followedCats } from './readers';
import { canonicalJson } from './hash';
import type {
  CatId,
  Frame,
  Frontier,
  Pin,
  RecomputeResult,
  RerunStats,
  WatchedFact,
} from './types';
import { newDecisionMemo } from './types';

/** What a re-run is asked for (02 §3): the log, the watched facts, the frontier. */
export interface RerunRequest {
  pins: readonly Pin[];
  watched: readonly WatchedFact[];
  frontier: Frontier;
  /** Compute strain (a projection from the edge): only while the debug panel is open. */
  strain?: boolean;
}

/**
 * A computed timeline, held by the worker: the request it answers, the lantern and fog every
 * `waves.checkpointEvery` ticks (03 §17), the wave at the edge, and the result.
 */
export interface Timeline {
  seed: number;
  pins: Pin[];
  watched: WatchedFact[];
  /** Index k: the wave at tick k × `waves.checkpointEvery`, for every such tick up to the edge. */
  checkpoints: Wave[];
  edgeWave: Wave;
  result: RecomputeResult;
}

const factKey = (f: WatchedFact): string => `${f.tick}|${f.cat}|${f.digest}`;

/**
 * The edit tick (03 §17): the earliest tick of a pin or watched fact that differs from the timeline
 * replaced; 0 without one or for another seed; its edge when nothing differs.
 */
export function editTick(
  prev: Timeline | null,
  seed: number,
  pins: readonly Pin[],
  watched: readonly WatchedFact[],
): number {
  if (!prev || prev.seed !== seed) return 0;
  let e = prev.result.edge;
  const diff = <T>(
    a: readonly T[],
    b: readonly T[],
    key: (x: T) => string,
    tick: (x: T) => number,
  ) => {
    const inB = b.map(key);
    for (const x of a) if (!inB.includes(key(x))) e = Math.min(e, tick(x));
  };
  const pinKey = (p: Pin) => canonicalJson(p);
  diff(pins, prev.pins, pinKey, (p) => p.tick);
  diff(prev.pins, pins, pinKey, (p) => p.tick);
  diff(watched, prev.watched, factKey, (f) => f.tick);
  diff(prev.watched, watched, factKey, (f) => f.tick);
  return Math.max(0, e);
}

/** The number of fog states over every cat and case. */
const fogStates = (fog: Fog): number =>
  fog.cases.reduce(
    (a, fc) => a + Object.values(fc.cats).reduce((b, x) => b + x.chain.length, 0),
    0,
  );

/**
 * The re-run (03 §17). From the last checkpoint before the edit tick `e`, the wave advances a tick
 * at a time (imposing the watched facts, §15.5) and yields each tick's frame. From `e` on, a tick t
 * passes the frontier limit (04 §6) when its watched fact shows no main storylet outside
 * `frontier.storylets`, `progress(t) ≤ story`, and `t − reach ≤ pastTicks` once `reach` exists;
 * the edge is the last tick before the first that fails, never past the fray or the chapter's end
 * (the anchor's end: `end.afterAnchorTicks` after it). Watched facts after the edge are reopened
 * without a test.
 */
export function* rerun(
  base: FogSetup,
  prev: Timeline | null,
  req: RerunRequest,
): Generator<{ tick: number; frame: Frame }, Timeline> {
  const setup: FogSetup = { ...base, decisions: newDecisionMemo() }; // cleared when pins change
  const { c } = setup;
  const every = c.tuning.waves.checkpointEvery;
  const followed: CatId[] = followedCats(c);
  const pins = sortPins(req.pins);
  const watched = [...req.watched];
  const { story, pastTicks, storylets: seenStorylets } = req.frontier;
  const kept = prev && prev.seed === setup.seed ? prev : null;
  const e = editTick(kept, setup.seed, pins, watched);
  // replay from a checkpoint strictly before e (the tick before e may become the edge)
  const k = kept && e > 0 ? Math.min(Math.trunc((e - 1) / every), kept.checkpoints.length - 1) : 0;
  const start = (kept && kept.checkpoints[k]) ?? initialWave(setup, followed);
  const from = start.lantern.sim.tick;
  const checkpoints = kept ? kept.checkpoints.slice(0, k + 1) : [start];
  const frames: Frame[] = kept ? kept.result.frames.slice(0, from) : [];
  const old = kept?.result.stats;
  const stats: RerunStats = {
    cases: old ? old.cases.slice(0, from) : [],
    live: old ? old.live.slice(0, from) : [],
    states: old ? old.states.slice(0, from) : [],
    strain: null,
    localCauses: 0,
    ms: 0,
  };
  let reach: number | null = null;
  frames.forEach((f, t) => {
    if (reach === null && f.progress >= story) reach = t;
  });

  const passes = (t: number, frame: Frame, next: Wave | null): boolean => {
    if (reach === null && frame.progress >= story) reach = t;
    if (t < e) return true;
    if (frame.progress > story) return false;
    if (reach !== null && t - reach > pastTicks) return false;
    if (next === null) return true;
    return followed.every((P) =>
      watch(setup, next.lantern.sim, next.tickEvents, next.lantern.live, P).summary.storylets.every(
        (key) => {
          const id = key.slice(0, key.indexOf('.'));
          return !setup.main.includes(id) || seenStorylets.includes(id);
        },
      ),
    );
  };
  const record = (t: number, w: Wave, frame: Frame) => {
    frames.push(frame);
    stats.cases.push(w.fog.cases.length);
    stats.live.push(w.lantern.live.length);
    stats.states.push(fogStates(w.fog));
    if (t % every === 0 && t > from) checkpoints.push(w);
  };

  let w = start;
  let before: Wave | null = null; // the wave of tick t − 1, once replayed
  let edgeWave: Wave;
  let tested: Wave; // the wave whose `reopened` holds every fact tested up to the edge
  let end: RecomputeResult['end'];
  for (;;) {
    const sim = w.lantern.sim;
    const t = sim.tick;
    if (before && w.fray !== null && w.fray < t) {
      // the lantern frayed in the step from t − 1 (`fraysIf` held there): that tick is the edge
      edgeWave = before;
      tested = w;
      end = { kind: 'fray', tick: w.fray };
      break;
    }
    const reached = sim.anchor.reachedAt;
    const terminal =
      w.fray !== null ||
      t >= c.world.ticks ||
      (reached !== null && t >= reached + c.tuning.end.afterAnchorTicks);
    const next = terminal ? null : advance(setup, w, pins, followed, watched);
    const pf = before && frames[t - 1];
    const frame = frameOf(setup, w, next, before && pf ? { wave: before, frame: pf } : undefined);
    if (!passes(t, frame, next)) {
      // the edge is the tick before; at tick 0 the edge stays at 0
      edgeWave = before ?? w;
      tested = w;
      end = { kind: 'limit', tick: edgeWave.lantern.sim.tick };
      if (!before) {
        record(t, w, frame);
        yield { tick: t, frame };
      }
      break;
    }
    record(t, w, frame);
    yield { tick: t, frame };
    if (next === null) {
      edgeWave = w;
      tested = w;
      end =
        reached !== null
          ? { kind: 'anchor', tick: reached }
          : w.fray !== null
            ? { kind: 'fray', tick: w.fray }
            : { kind: 'chapterEnd', tick: t };
      break;
    }
    before = w;
    w = next;
  }

  const edge = edgeWave.lantern.sim.tick;
  const inRequest = watched.map(factKey);
  const reopened = [
    ...tested.reopened.filter((f) => inRequest.includes(factKey(f)) && f.tick <= edge),
    ...watched.filter((f) => f.tick > edge),
  ];
  const breaks = reopened.filter((f) => Object.values(f.summary.paidBy).some((p) => p.length > 0));
  stats.localCauses = edgeWave.localCauses;
  if (req.strain) stats.strain = projectFrom(setup, edgeWave, pins).anchor;
  return {
    seed: setup.seed,
    pins,
    watched,
    checkpoints,
    edgeWave,
    result: {
      frames,
      edge,
      end,
      reopened,
      breaks,
      gazeFacts: edgeWave.gazeFacts,
      stats,
    },
  };
}

/** Runs a re-run to its end, ignoring the stream. */
export function rerunAll(setup: FogSetup, prev: Timeline | null, req: RerunRequest): Timeline {
  const it = rerun(setup, prev, req);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/**
 * The whole-day run (03 §13.1): the followed protagonists live from tick 0, every other cat in the
 * fog, the pins applied, nobody watching, no frontier limit; to the lantern's fray, the anchor's
 * end or the chapter's end. Seed vetting, calibration and the balance measures read it.
 */
export function wholeDayRun(setup: FogSetup, pins: readonly Pin[]): Wave {
  const { c } = setup;
  const followed = followedCats(c);
  let w = initialWave(setup, followed);
  while (w.fray === null && w.lantern.sim.tick < c.world.ticks) {
    const reached = w.lantern.sim.anchor.reachedAt;
    if (reached !== null && w.lantern.sim.tick > reached + c.tuning.end.afterAnchorTicks) break;
    w = advance(setup, w, pins, followed);
  }
  return w;
}

/**
 * A projection from a wave (03 §13.1): the fog alone to the chapter's end, every live cat a point
 * mass at its live state, and what the lantern holds (facts, flags, counters, its storylets' states)
 * fixed in every case. Running effects of the lantern are not carried over (an approximation; only
 * strain reads this, in the debug panel).
 */
export function projectFrom(setup: FogSetup, wave: Wave, pins: readonly Pin[]): Projection {
  const { c } = setup;
  const { sim, live, heldStorylets } = wave.lantern;
  const cases = wave.fog.cases.map((fc) => {
    const cats = { ...fc.cats };
    for (const id of live) {
      const cs = sim.cats[id];
      if (cs) cats[id] = pointMass(setup, id, cs);
    }
    const q = {
      ...fc.q,
      facts: { ...fc.q.facts },
      factParts: { ...fc.q.factParts },
      flags: { ...fc.q.flags },
      counters: { ...fc.q.counters },
      storylets: { ...fc.q.storylets },
    };
    for (const f of sim.facts) setFact(q, f, PPM);
    for (const [key, flag] of Object.entries(sim.flags))
      if (flag.value !== 0) q.flags[key] = [{ p: PPM, until: flag.until }];
    for (const [name, v] of Object.entries(sim.counters)) {
      const startAt = c.world.counters[name]?.start ?? 0;
      const fog = q.counters[name] ?? { mean: startAt * PPM, variance: 0 };
      q.counters[name] = { ...fog, mean: fog.mean + (v - startAt) * PPM };
    }
    for (const sl of c.storylets) {
      const run = sim.storylets[sl.id];
      if (heldStorylets.includes(sl.id) || !run) continue;
      const roles = Object.keys(run.roles).length > 0 ? run.roles : null;
      q.storylets[sl.id] = { p: { [run.state ?? INACTIVE]: PPM }, roles };
    }
    return { ...fc, cats, q };
  });
  return projectToEnd(setup, { tick: wave.fog.tick, cases }, pins);
}
