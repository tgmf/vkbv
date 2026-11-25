// Frames' samples (03 §16, docs/questions.md M5-1): `render.focusSamples` coherent trajectories of the
// fogged cats for the renderer's focus layer, "a cloud of possible positions". The fog records no
// transitions, so a ghost may follow another when it lies within one fog step's walk of it (the
// fastest edge, `fog.stepTicks` ticks). A trajectory draws a case by weight at the lantern edge and
// steps back through each fogged cat's ghosts in that case by mass among those its next ghost may
// follow (forward filtering, backward sampling), so it ends where a placement put the cat. During
// live playback trajectories are extended forward by the same rule. Scope `render`: nothing in the
// simulation reads them; frames' ghosts stay the fog's filtered odds.
import { standIn, type Fog, type FogSetup } from './fog';
import { isqrt } from './math';
import { rand } from './rng';
import { catNode, catPos, dist2 } from './space';
import type { CatId, Content, Frame, Ghost, TickSamples } from './types';

/** What sampling reads at one tick: each case's links and weight, each fogged cat's ghost masses. */
export interface TickTrace {
  cases: { key: string; links: Readonly<Record<string, 0 | 1>>; w: number }[];
  /** Per fogged cat, per case (as in `cases`): [index into the frame's ghosts, ppm in the case]. */
  cats: Record<CatId, [number, number][][]>;
}

const ghostKey = (g: Pick<Ghost, 'node' | 'pos' | 'activity' | 'interrupt'>): string =>
  `${g.node}|${g.pos[0]}|${g.pos[1]}|${g.activity}|${g.interrupt ?? ''}`;

/** The furthest a fogged cat moves in one fog step, in metres: the fastest edge for `stepTicks` ticks. */
export function stepReachM(c: Content): number {
  let fastest = 0;
  for (const e of c.edges) {
    const a = c.node[e.a]?.pos;
    const b = c.node[e.b]?.pos;
    if (!a || !b) continue;
    const ticks = Math.max(1, Math.trunc(e.minutes / c.world.tickMinutes));
    fastest = Math.max(fastest, Math.trunc((isqrt(dist2(a, b)) + ticks) / ticks)); // ceil, plus rounding
  }
  return fastest * c.tuning.fog.stepTicks;
}

/**
 * The trace of tick t: `fog` is the wave's fog, `frame` its frame. A cat whose ghosts the frame kept
 * from the tick before (same objects, same chains and weights) keeps its trace entry.
 */
export function traceOf(
  setup: FogSetup,
  fog: Fog,
  frame: Frame,
  live: readonly CatId[],
  prev?: { trace: TickTrace; frame: Frame },
): TickTrace {
  const { c } = setup;
  const cases = fog.cases.map((fc) => ({
    key: JSON.stringify(fc.links),
    links: fc.links,
    w: fc.weight,
  }));
  const cats: TickTrace['cats'] = {};
  for (const { id } of c.cats) {
    if (live.includes(id)) continue;
    const ghosts = frame.cats[id];
    if (!ghosts) continue;
    const kept = prev && prev.frame.cats[id] === ghosts ? prev.trace.cats[id] : undefined;
    if (kept) {
      cats[id] = kept;
      continue;
    }
    const index: Record<string, number> = {};
    ghosts.forEach((g, i) => (index[ghostKey(g)] = i));
    cats[id] = fog.cases.map((fc) => {
      const fcat = fc.cats[id];
      if (!fcat) return [];
      const mass: Record<number, number> = {};
      for (const e of fcat.chain) {
        const cs = standIn(setup, id, e.s, fcat.mean);
        const k = ghostKey({
          node: catNode(cs),
          pos: catPos(c, cs),
          activity: cs.activity,
          interrupt: cs.interrupt?.action ?? null,
        });
        const i = index[k];
        if (i !== undefined) mass[i] = (mass[i] ?? 0) + e.p;
      }
      return Object.entries(mass)
        .map(([i, p]): [number, number] => [Number(i), p])
        .sort((a, b) => a[0] - b[0]);
    });
  }
  return { cases, cats };
}

/** Draws an index from integer weights with a `render` draw; null when they sum to 0. */
function draw(seed: number, t: number, purpose: string, weights: readonly number[]): number | null {
  const total = weights.reduce((a, x) => a + x, 0);
  if (total <= 0) return null;
  const r = rand(seed, 'render', t, purpose, total);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] ?? 0;
    if (acc > r) return i;
  }
  return weights.length - 1;
}

const within = (links: Readonly<Record<string, 0 | 1>>, of: Readonly<Record<string, 0 | 1>>) =>
  Object.entries(links).every(([k, v]) => v === 0 || of[k] === 1);

/**
 * The case at a neighbouring tick that continues case `key`: the same links if that case exists,
 * otherwise one whose links fit (`fits`), by weight, otherwise any, by weight.
 */
function linkedCase(
  seed: number,
  t: number,
  purpose: string,
  cases: TickTrace['cases'],
  from: TickTrace['cases'][number] | undefined,
  fits: (c: TickTrace['cases'][number]) => boolean,
): number {
  const same = from ? cases.findIndex((x) => x.key === from.key) : -1;
  if (same >= 0) return same;
  const fitting = cases.map((x) => (from && fits(x) ? x.w : 0));
  return (
    draw(seed, t, purpose, fitting) ??
    draw(
      seed,
      t,
      purpose,
      cases.map((x) => x.w),
    ) ??
    0
  );
}

/** One cat's ghost at a tick given the ghost it moves to (or from), by mass among those in reach. */
function pickGhost(
  seed: number,
  t: number,
  purpose: string,
  cands: readonly [number, number][],
  ghosts: readonly Ghost[],
  other: Ghost | null,
  reach2: number,
): number | null {
  const near = cands.map(([i, p]) => {
    const g = ghosts[i];
    return g && (!other || dist2(g.pos, other.pos) <= reach2) ? p : 0;
  });
  const k =
    draw(seed, t, purpose, near) ??
    draw(
      seed,
      t,
      purpose,
      cands.map(([, p]) => p),
    );
  return k === null ? null : (cands[k]?.[0] ?? null);
}

/**
 * Samples of every tick 0..frames.length − 1 by backward sampling from the last (03 §16, M5-1):
 * trajectory k draws a case by weight there (purpose `focus:k`), then each fogged cat's ghost in that
 * case by mass among those within reach of its ghost a tick later (`focus:k:cat`), or of its live
 * ghost where it was placed; a case a tick earlier has the same links, or fewer.
 */
export function samplesOf(
  setup: FogSetup,
  frames: readonly Frame[],
  trace: readonly TickTrace[],
): TickSamples[] {
  const { c, seed } = setup;
  const K = c.tuning.render.focusSamples;
  const reach = stepReachM(c);
  const reach2 = reach * reach;
  const out: TickSamples[] = frames.map(() => ({ cases: [], cats: {} }));
  const last = frames.length - 1;
  for (let k = 0; k < K; k++) {
    let caseAt: TickTrace['cases'][number] | undefined;
    const after: Record<CatId, Ghost> = {};
    for (let t = last; t >= 0; t--) {
      const tr = trace[t];
      const frame = frames[t];
      const o = out[t];
      if (!tr || !frame || !o) continue;
      const ci =
        t === last
          ? (draw(
              seed,
              t,
              `focus:${k}`,
              tr.cases.map((x) => x.w),
            ) ?? 0)
          : linkedCase(seed, t, `focus:${k}`, tr.cases, caseAt, (x) =>
              caseAt ? within(x.links, caseAt.links) : false,
            );
      caseAt = tr.cases[ci];
      o.cases.push(ci);
      for (const { id } of c.cats) {
        const ghosts = frame.cats[id] ?? [];
        const cands = tr.cats[id]?.[ci];
        if (!cands) {
          // live here: the ghost an earlier fogged tick moves to
          const g = ghosts[0];
          if (g) after[id] = g;
          continue;
        }
        const i = pickGhost(seed, t, `focus:${k}:${id}`, cands, ghosts, after[id] ?? null, reach2);
        const g = i === null ? undefined : ghosts[i];
        (o.cats[id] ??= []).push(i ?? 0);
        if (g) after[id] = g;
      }
    }
  }
  return out;
}

/**
 * The samples of a new edge tick t during live playback: each trajectory keeps its case where it
 * can (otherwise one whose links include its links, by weight) and moves each fogged cat to a ghost
 * within reach of where it was at t − 1 (its sample there, or its live ghost if it was just released).
 */
export function extendSamples(
  setup: FogSetup,
  before: { frame: Frame; trace: TickTrace; samples: TickSamples },
  frame: Frame,
  tr: TickTrace,
): TickSamples {
  const { c, seed } = setup;
  const t = frame.tick;
  const K = c.tuning.render.focusSamples;
  const reach = stepReachM(c);
  const reach2 = reach * reach;
  const out: TickSamples = { cases: [], cats: {} };
  for (let k = 0; k < K; k++) {
    const prevCase = before.trace.cases[before.samples.cases[k] ?? -1];
    const ci = prevCase
      ? linkedCase(seed, t, `focusf:${k}`, tr.cases, prevCase, (x) =>
          within(prevCase.links, x.links),
        )
      : (draw(
          seed,
          t,
          `focusf:${k}`,
          tr.cases.map((x) => x.w),
        ) ?? 0);
    out.cases.push(ci);
    for (const { id } of c.cats) {
      const cands = tr.cats[id]?.[ci];
      if (!cands) continue;
      const was = before.samples.cats[id]?.[k];
      const prevGhosts = before.frame.cats[id] ?? [];
      const from = (was === undefined ? prevGhosts[0] : prevGhosts[was]) ?? null;
      const i = pickGhost(seed, t, `focusf:${k}:${id}`, cands, frame.cats[id] ?? [], from, reach2);
      (out.cats[id] ??= []).push(i ?? 0);
    }
  }
  return out;
}
