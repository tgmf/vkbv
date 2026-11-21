// Steps, branch points, weather and whole histories (03 §6, §7, §12).
import { describe, expect, it } from 'vitest';
import { initialState, runHistory, uniformStreams } from '../../src/sim/history';
import { sample } from '../../src/sim/math';
import { rand } from '../../src/sim/rng';
import { step } from '../../src/sim/step';
import type { BranchPoint, SimState } from '../../src/sim/types';
import { cardPin, ch1, makeCtx, tiny } from './helpers';

describe('branch points', () => {
  it('re-running a step with a longer branch list reproduces every event before the branch point', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const streams = uniformStreams(tiny, 0);
      let s: SimState = initialState(tiny, seed, streams);
      for (let t = 0; t < 70; t++) {
        // Resolve this tick by sampling, recording the choices and the events seen at each stop.
        const decided: number[] = [];
        for (;;) {
          const r = step(tiny, seed, streams, s, [], decided);
          if (r.state) {
            s = r.state;
            break;
          }
          const bp = r.branchPoint as BranchPoint;
          // Every event before the stop must reappear unchanged once the outcome is decided.
          const k = sample(
            bp.options.map((o) => o.ppm),
            rand(seed, 's0:branch', t, bp.key, 1_000_000),
          );
          const longer = step(tiny, seed, streams, s, [], [...decided, k]);
          expect(longer.events.slice(0, r.events.length)).toEqual(r.events);
          decided.push(k);
        }
      }
    }
  });

  it('a list of decisions and a sampling function give the same history', () => {
    const seed = 3;
    const streams = uniformStreams(tiny, 0);
    let a: SimState = initialState(tiny, seed, streams);
    let b: SimState = initialState(tiny, seed, streams);
    for (let t = 0; t < 120; t++) {
      const picked: number[] = [];
      const r = step(tiny, seed, streams, a, [], (bp) => {
        const k = sample(
          bp.options.map((o) => o.ppm),
          rand(seed, 's0:branch', t, bp.key, 1_000_000),
        );
        picked.push(k);
        return k;
      });
      const r2 = step(tiny, seed, streams, b, [], picked);
      expect(r2.events).toEqual(r.events);
      a = r.state as SimState;
      b = r2.state as SimState;
    }
    expect(b).toEqual(a);
  });
});

describe('weather', () => {
  it('rain starts within its window (certain at its end) and stops after the minimum duration', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const h = runHistory(tiny, seed, 0);
      const last = h.states[h.states.length - 1];
      const started = last?.weather.startedAt ?? -1;
      expect(started).toBeGreaterThanOrEqual(60); // 07:00
      expect(started).toBeLessThanOrEqual(90); // 07:30
      if (last?.weather.stoppedAt != null) {
        expect(last.weather.stoppedAt - started).toBeGreaterThanOrEqual(10);
        expect(last.weather.stoppedAt).toBeLessThanOrEqual(120);
      }
    }
  });

  it('with every hazard roll saying stay, the rain still starts at the window end', () => {
    const ctx = makeCtx(tiny, { t: 90 }); // 07:30
    const r = step(tiny, 1, ctx.streams, ctx.s, [], () => 1);
    expect(r.state?.weather).toMatchObject({ now: 'rain', startedAt: 90 });
    expect(r.state?.facts).toContain('rainStarted');
  });
});

describe('histories', () => {
  it('ends dead when fraysIf holds first, and pins at tick t change states[t + 1], never states[t]', () => {
    const h = runHistory(tiny, 1, 0);
    expect(h.end).toEqual({ kind: 'dead', tick: 19 }); // rite -> riteDone (tiny world fraysIf)
    const pin = cardPin('poke', { cat: 'pal' }, 10);
    const h2 = runHistory(tiny, 1, 0, [pin]);
    expect(h2.states[10]).toEqual(h.states[10]);
    expect(h2.states[11]).not.toEqual(h.states[11]);
  });

  it('the anchor is reached the tick its fact is set (phase 8), and fraysIf no longer kills it', () => {
    const ctx = makeCtx(tiny, { t: 30 });
    ctx.s.facts = ['heroOut'];
    for (const id of ['hero', 'pal']) {
      const cs = ctx.s.cats[id];
      if (cs) cs.pos = { at: 'street.b' };
    }
    const pal = ctx.s.cats['pal'];
    if (pal) pal.heard = ['rumour'];
    const r = step(tiny, 1, ctx.streams, ctx.s, [], () => 0);
    expect(r.state?.anchor).toEqual({ reachedAt: 30, deadAt: null });
    expect(r.events).toContainEqual({ tick: 30, type: 'anchor', reached: true });
  });

  it('Chapter 1 runs a whole day; the same inputs give the same history', () => {
    const a = runHistory(ch1, 1, 0);
    const b = runHistory(ch1, 1, 0);
    expect(b).toEqual(a);
    expect(a.states.length).toBe(901);
  });
});

describe('cloneState', () => {
  it('equals a JSON round-trip, and stepping never changes the input state', async () => {
    const { cloneState } = await import('../../src/sim/step');
    const h = runHistory(ch1, 2, 5, [cardPin('tea_break', { place: 'town.roadworks' }, 150)]);
    for (const s of [h.states[0], h.states[200], h.states[500]]) {
      if (!s) continue;
      expect(cloneState(s)).toEqual(JSON.parse(JSON.stringify(s)));
      const frozen = JSON.stringify(s);
      step(ch1, 2, uniformStreams(ch1, 5), s, [], () => 0);
      expect(JSON.stringify(s)).toBe(frozen);
    }
  });
});
