// Seed vetting (04 §2): a seed is offered only if the chapter's recorded solutions show it solvable
// and enough of its authored story reachable. Each solution is a whole-day run (03 §13.1) with its
// pins; a failing seed is replaced by the next candidate, deterministically.
import { fogSetup, WAVE_TOTAL } from './fog';
import { INACTIVE } from './fog-quantities';
import { factChance } from './frames';
import type { Wave } from './lantern';
import { wholeDayRun } from './recompute';
import { hash32 } from './rng';
import type { Content, Pin } from './types';

/** One candidate's verdict. `storylets` counts those entered in the runs made before it passed. */
export interface Verdict {
  seed: number;
  solvable: boolean;
  storylets: number;
  pass: boolean;
}

/**
 * Whether a whole-day run entered a storylet (04 §2): the lantern ran it, or a state other than its
 * start has at least `vetting.minPpm` in the fog by the end.
 */
function entered(c: Content, w: Wave, id: string, start: string): boolean {
  const run = w.lantern.sim.storylets[id];
  if (run && (run.state !== null || run.ended)) return true;
  const p: Record<string, number> = {};
  for (const fc of w.fog.cases)
    for (const [st, x] of Object.entries(fc.q.storylets[id]?.p ?? {}))
      if (st !== INACTIVE && st !== start)
        p[st] = (p[st] ?? 0) + Math.trunc((x * fc.weight) / WAVE_TOTAL);
  return Object.values(p).some((x) => x >= c.tuning.vetting.minPpm);
}

/**
 * One candidate seed against the recorded solutions (04 §2). Solvable: some solution's run reaches
 * the anchor (the lantern holds it) with every `vetting.requireFacts` at `vetting.minPpm` by its end.
 * Story: over the runs, at least min(`vetting.minStorylets`, ⌈authored × share / 1000⌉) authored
 * storylets entered. The runs stop once both hold: later runs cannot change a pass.
 */
export function checkSeed(
  c: Content,
  seed: number,
  solutions: readonly (readonly Pin[])[],
): Verdict {
  const v = c.tuning.vetting;
  const setup = fogSetup(c, seed);
  const needed = Math.min(
    v.minStorylets,
    Math.trunc((c.storylets.length * v.minStoryletSharePerMille + 999) / 1000),
  );
  const seen: string[] = [];
  let solvable = false;
  for (const pins of solutions) {
    const w = wholeDayRun(setup, pins);
    const sim = w.lantern.sim;
    if (
      sim.anchor.reachedAt !== null &&
      v.requireFacts.every((f) => factChance(sim, w.fog, f) >= v.minPpm)
    )
      solvable = true;
    for (const sl of c.storylets)
      if (!seen.includes(sl.id) && entered(c, w, sl.id, sl.start)) seen.push(sl.id);
    if (solvable && seen.length >= needed) break;
  }
  return { seed, solvable, storylets: seen.length, pass: solvable && seen.length >= needed };
}

/**
 * Seed vetting (04 §2): the requested seed, then `hash32(requested + "|vet|" + k)` for k = 1, 2, …,
 * up to `vetting.maxCandidates`; the first that passes, or the requested seed if none does.
 */
export function vet(
  c: Content,
  requested: number,
  solutions: readonly (readonly Pin[])[],
): { seed: number; verdicts: Verdict[] } {
  const verdicts: Verdict[] = [];
  for (let k = 0; k < c.tuning.vetting.maxCandidates; k++) {
    const candidate = k === 0 ? requested : hash32(`${requested}|vet|${k}`);
    const verdict = checkSeed(c, candidate, solutions);
    verdicts.push(verdict);
    if (verdict.pass) return { seed: candidate, verdicts };
  }
  return { seed: requested, verdicts };
}

/** The content with `vetting.fog`'s coarser knobs, for live vetting of a typed or bookmarked seed. */
export const vettingContent = (c: Content): Content => ({
  ...c,
  tuning: { ...c.tuning, fog: { ...c.tuning.fog, ...c.tuning.vetting.fog } },
});
