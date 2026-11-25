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
import { extendSamples, samplesOf, traceOf, type TickTrace } from './samples';
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
 * `waves.checkpointEvery` ticks (03 §17), the wave at the edge and the one after it, each tick's
 * watched facts, and the result.
 */
export interface Timeline {
  seed: number;
  pins: Pin[];
  watched: WatchedFact[];
  /** Index k: the wave at tick k × `waves.checkpointEvery`, for every such tick up to the edge. */
  checkpoints: Wave[];
  edgeWave: Wave;
  /** The wave of edge + 1, already stepped: live playback continues from it. Null once it ended. */
  ahead: Wave | null;
  /**
   * Index t: each followed protagonist's watched fact of tick t (03 §15.2), for every tick up to the
   * edge whose step was taken (`{}` for a last tick): playback behind the edge reads them.
   */
  views: Record<CatId, WatchedFact>[];
  /** Index t: what the focus layer's samples read at tick t (samples.ts). */
  trace: TickTrace[];
  result: RecomputeResult;
}

/** The followed protagonists' watched facts of the tick whose step led to `next`. */
const viewOf = (setup: FogSetup, next: Wave, followed: readonly CatId[]) => {
  const view: Record<CatId, WatchedFact> = {};
  for (const P of followed)
    view[P] = watch(setup, next.lantern.sim, next.tickEvents, next.lantern.live, P);
  return view;
};

/**
 * One tick of a timeline at wave `w`: the wave after its step (null at a last tick: the fray, the
 * anchor's end, the chapter's end), its frame, and the protagonists' watched facts of it.
 */
function tickOf(
  setup: FogSetup,
  w: Wave,
  prev: { wave: Wave; frame: Frame; trace: TickTrace } | undefined,
  pins: readonly Pin[],
  followed: readonly CatId[],
  watched: readonly WatchedFact[],
): { next: Wave | null; frame: Frame; view: Record<CatId, WatchedFact>; trace: TickTrace } {
  const { c } = setup;
  const sim = w.lantern.sim;
  const reached = sim.anchor.reachedAt;
  const terminal =
    w.fray !== null ||
    sim.tick >= c.world.ticks ||
    (reached !== null && sim.tick >= reached + c.tuning.end.afterAnchorTicks);
  const next = terminal ? null : advance(setup, w, pins, followed, watched);
  const frame = frameOf(setup, w, next, prev, pins);
  return {
    next,
    frame,
    view: next ? viewOf(setup, next, followed) : {},
    trace: traceOf(setup, w.fog, frame, w.lantern.live, prev),
  };
}

/** How a timeline ends at its last tick `w` (no step follows it). */
const endAt = (w: Wave): RecomputeResult['end'] => {
  const reached = w.lantern.sim.anchor.reachedAt;
  if (reached !== null) return { kind: 'anchor', tick: reached };
  if (w.fray !== null) return { kind: 'fray', tick: w.fray };
  return { kind: 'chapterEnd', tick: w.lantern.sim.tick };
};

/** Whether the step that led to `w` frayed the lantern (`fraysIf` held there): the tick before ends it. */
const frayedBefore = (w: Wave): boolean => w.fray !== null && w.fray < w.lantern.sim.tick;

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
export const fogStateCount = (fog: Fog): number =>
  fog.cases.reduce(
    (a, fc) => a + Object.values(fc.cats).reduce((b, x) => b + x.chain.length, 0),
    0,
  );

/**
 * The re-run (03 §17). From the last checkpoint before the edit tick `e`, the wave advances a tick
 * at a time (imposing the watched facts, §15.5) and yields each tick's frame. From `e` on, a tick t
 * passes the frontier limit (04 §6) when the watched fact of t − 1 shows no main storylet outside
 * `frontier.storylets` (so the edge is the tick whose step shows it), `progress(t) ≤ story`, and
 * `t − reach ≤ pastTicks` once `reach` exists;
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
  const views = kept ? kept.views.slice(0, from) : [];
  const trace = kept ? kept.trace.slice(0, from) : [];
  const old = kept?.result.stats;
  const stats: RerunStats = {
    cases: old ? old.cases.slice(0, from) : [],
    live: old ? old.live.slice(0, from) : [],
    states: old ? old.states.slice(0, from) : [],
    strain: null,
    localCauses: 0,
    wouldLink: [],
    ms: 0,
  };
  let reach: number | null = null;
  frames.forEach((f, t) => {
    if (reach === null && f.progress >= story) reach = t;
  });

  const passes = (t: number, frame: Frame): boolean => {
    if (reach === null && frame.progress >= story) reach = t;
    if (t < e) return true;
    if (frame.progress > story) return false;
    if (reach !== null && t - reach > pastTicks) return false;
    // a never-watched main storylet in the step from t − 1: the edge is t − 1, so playback at the
    // edge watches it (Tagir, 2026-11-25, docs/questions.md M3-2); an edit's own pin is never cut
    const shown = t - 1 >= e ? views[t - 1] : undefined;
    return Object.values(shown ?? {}).every((f) =>
      f.summary.storylets.every((key) => {
        const id = key.slice(0, key.indexOf('.'));
        return !setup.main.includes(id) || seenStorylets.includes(id);
      }),
    );
  };
  const record = (
    t: number,
    w: Wave,
    frame: Frame,
    view: Record<CatId, WatchedFact>,
    tr: TickTrace,
  ) => {
    frames.push(frame);
    views.push(view);
    trace.push(tr);
    stats.cases.push(w.fog.cases.length);
    stats.live.push(w.lantern.live.length);
    stats.states.push(fogStateCount(w.fog));
    if (t % every === 0 && t > from) checkpoints.push(w);
  };

  let w = start;
  let before: Wave | null = null; // the wave of tick t − 1, once replayed
  let edgeWave: Wave;
  let ahead: Wave | null;
  let tested: Wave; // the wave whose `reopened` holds every fact tested up to the edge
  let end: RecomputeResult['end'];
  for (;;) {
    const t = w.lantern.sim.tick;
    if (before && frayedBefore(w)) {
      // the lantern frayed in the step from t − 1 (`fraysIf` held there): that tick is the edge
      edgeWave = before;
      ahead = null;
      tested = w;
      end = { kind: 'fray', tick: w.fray ?? t - 1 };
      break;
    }
    const pf = before && frames[t - 1];
    const pt = before && trace[t - 1];
    const {
      next,
      frame,
      view,
      trace: tr,
    } = tickOf(
      setup,
      w,
      before && pf && pt ? { wave: before, frame: pf, trace: pt } : undefined,
      pins,
      followed,
      watched,
    );
    if (!passes(t, frame)) {
      // the edge is the tick before; at tick 0 the edge stays at 0
      edgeWave = before ?? w;
      ahead = before ? w : next;
      tested = w;
      end = { kind: 'limit', tick: edgeWave.lantern.sim.tick };
      if (!before) {
        record(t, w, frame, view, tr);
        yield { tick: t, frame };
      }
      break;
    }
    record(t, w, frame, view, tr);
    yield { tick: t, frame };
    if (next === null) {
      edgeWave = w;
      ahead = null;
      tested = w;
      end = endAt(w);
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
  stats.wouldLink = edgeWave.wouldLink;
  if (req.strain) stats.strain = projectFrom(setup, edgeWave, pins).anchor;
  return {
    seed: setup.seed,
    pins,
    watched,
    checkpoints,
    edgeWave,
    ahead,
    views,
    trace,
    result: {
      frames,
      edge,
      end,
      reopened,
      breaks,
      gazeFacts: edgeWave.gazeFacts,
      samples: samplesOf(setup, frames, trace),
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
 * Live playback at the lantern edge (03 §15.2, 04 §6): the timeline one tick further, from the wave
 * already stepped past the edge (`ahead`): one `advance`, the new edge's frame and watched facts, a
 * checkpoint when due. No frontier limit: the frontier moves with the edge. It stops where a re-run
 * would: the fray, the anchor's end, the chapter's end. Null when the timeline has ended.
 */
export function extendEdge(setup: FogSetup, tl: Timeline): Timeline | null {
  const w = tl.ahead;
  if (!w || tl.result.end.kind !== 'limit') return null;
  const { c } = setup;
  const r = tl.result;
  const t = w.lantern.sim.tick;
  const pf = r.frames[t - 1];
  const pt = tl.trace[t - 1];
  const {
    next,
    frame,
    view,
    trace: tr,
  } = tickOf(
    setup,
    w,
    pf && pt && { wave: tl.edgeWave, frame: pf, trace: pt },
    tl.pins,
    followedCats(c),
    tl.watched,
  );
  let ahead = next;
  let end: RecomputeResult['end'] = next ? { kind: 'limit', tick: t } : endAt(w);
  if (next && frayedBefore(next)) {
    // the step from the new edge frayed the lantern: the timeline ends here (as a re-run would)
    ahead = null;
    end = { kind: 'fray', tick: next.fray ?? t };
  }
  const due = t % c.tuning.waves.checkpointEvery === 0;
  const frames = [...r.frames, frame];
  const trace = [...tl.trace, tr];
  // a cat placed at the new edge: trajectories are drawn again so they end where it was seen;
  // otherwise each is carried one tick forward (samples.ts)
  const placed = w.lantern.live.some((id) => !tl.edgeWave.lantern.live.includes(id));
  const ps = r.samples[t - 1];
  const samples =
    placed || !pf || !pt || !ps
      ? samplesOf(setup, frames, trace)
      : [...r.samples, extendSamples(setup, { frame: pf, trace: pt, samples: ps }, frame, tr)];
  return {
    ...tl,
    checkpoints: due ? [...tl.checkpoints, w] : tl.checkpoints,
    edgeWave: w,
    ahead,
    views: [...tl.views, view],
    trace,
    result: {
      ...r,
      frames,
      samples,
      edge: t,
      end,
      gazeFacts: w.gazeFacts,
      stats: {
        ...r.stats,
        cases: [...r.stats.cases, w.fog.cases.length],
        live: [...r.stats.live, w.lantern.live.length],
        states: [...r.stats.states, fogStateCount(w.fog)],
        localCauses: w.localCauses,
        wouldLink: w.wouldLink,
      },
    },
  };
}

/**
 * The whole-day run (03 §13.1): the followed protagonists live from tick 0, every other cat in the
 * fog, the pins applied, nobody watching, no frontier limit; to the lantern's fray, the anchor's
 * end or the chapter's end. Seed vetting, calibration and the balance measures read it. `each`, if
 * given, sees every wave from tick 0 to the last (`npm run sim -- --fog`); `beforeEvidence` each
 * tick's fog before the protagonists' perception conditions it (`advance`).
 */
export function wholeDayRun(
  setup: FogSetup,
  pins: readonly Pin[],
  each?: (w: Wave) => void,
  beforeEvidence?: (fog: Fog) => void,
): Wave {
  const { c } = setup;
  const followed = followedCats(c);
  let w = initialWave(setup, followed);
  each?.(w);
  while (w.fray === null && w.lantern.sim.tick < c.world.ticks) {
    const reached = w.lantern.sim.anchor.reachedAt;
    if (reached !== null && w.lantern.sim.tick > reached + c.tuning.end.afterAnchorTicks) break;
    w = advance(setup, w, pins, followed, [], beforeEvidence);
    each?.(w);
  }
  return w;
}

/**
 * A projection from a wave (03 §13.1): the fog alone to the chapter's end, from `projectionFog`.
 * Only strain reads it, in the debug panel.
 */
export const projectFrom = (setup: FogSetup, wave: Wave, pins: readonly Pin[]): Projection =>
  projectToEnd(setup, projectionFog(setup, wave), pins);

/**
 * Where a projection from a wave starts (03 §13.1): every live cat a point mass at its live state,
 * and what the lantern holds (facts, flags, counters, its storylets' states) fixed in every case.
 * Running effects of the lantern are not carried over (an approximation).
 */
export function projectionFog(setup: FogSetup, wave: Wave): Fog {
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
  return { tick: wave.fog.tick, cases };
}
