// Detectors and their pools of partial matches (spec 03 §10.4).
import { hasFact, test } from './conditions';
import { addFact } from './effects';
import type { Ctx, PartialMatch } from './types';

const order = (a: PartialMatch, b: PartialMatch) =>
  a.stage - b.stage || a.stageTick - b.stageTick || a.count - b.count;

/** Phase 5: advance every pool; a completed kernel sets its fact and emits `detector` once. */
export function siftingPhase(ctx: Ctx): void {
  const { c, s, t } = ctx;
  const factsNow = ctx.events.flatMap((e) => (e.type === 'fact' ? [e.fact] : []));
  for (const d of c.detectors) {
    if (hasFact(ctx, d.emits)) continue;
    const pool = s.pools[d.id] ?? [];
    // The stage-0 match is implicit and always present.
    const live = pool.some((m) => m.stage === 0)
      ? pool
      : [{ stage: 0, stageTick: t, count: 0 }, ...pool];
    const next: PartialMatch[] = [];
    let done = false;
    for (const m of live) {
      const clause = d.kernel[m.stage];
      if (!clause) continue;
      if (m.stage > 0 && clause.withinTicks !== undefined && t - m.stageTick > clause.withinTicks)
        continue;
      if (
        (d.unless ?? []).some(
          (u) => factsNow.includes(u.fact) && m.stage >= u.between[0] && m.stage < u.between[1],
        )
      )
        continue;
      if ('event' in clause) {
        next.push(m); // the original stays; a copy advances (fork)
        const happened = ctx.events.some(
          (e) =>
            e.type === 'emit' &&
            e.name === clause.event &&
            (clause.at === undefined || e.node === clause.at),
        );
        if (happened) next.push({ stage: m.stage + 1, stageTick: t, count: 0 });
      } else if (test(ctx, clause.holds, {})) {
        const count = m.count + 1;
        next.push(
          count >= clause.forTicks
            ? { stage: m.stage + 1, stageTick: t, count: 0 }
            : { ...m, count },
        );
      } else next.push({ ...m, count: 0 });
    }
    if (next.some((m) => m.stage >= d.kernel.length)) done = true;
    if (done) {
      addFact(ctx, d.emits);
      ctx.events.push({ tick: t, type: 'detector', id: d.id });
      s.pools[d.id] = [];
      continue;
    }
    // Keep live matches only: drop idle stage-0 matches, cap the pool, oldest stageTick first.
    const kept = next.filter((m) => m.stage > 0 || m.count > 0).sort(order);
    const cap = c.tuning.sifting.maxMatchesPerPattern;
    while (kept.length > cap) {
      let oldest = 0;
      for (let i = 1; i < kept.length; i++)
        if ((kept[i]?.stageTick ?? 0) < (kept[oldest]?.stageTick ?? 0)) oldest = i;
      kept.splice(oldest, 1);
    }
    s.pools[d.id] = kept;
  }
}
