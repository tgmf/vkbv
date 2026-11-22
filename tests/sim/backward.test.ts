// The backward pass (03 §14): Bayes over cases, conditioning, the anchor treated as seen, strain
// and a projection's fray (03 §16).
import { describe, expect, it } from 'vitest';
import {
  aliveChance,
  anchorChance,
  applyEvidence,
  conditionOnAnchor,
  likelihood,
  projectToEnd,
  type Evidence,
} from '../../src/sim/backward';
import { loadChapter } from '../../src/content/load';
import { readChapterDir } from '../../src/cli/files';
import {
  fogSetup,
  fogStep,
  initialFog,
  stateKey,
  WAVE_TOTAL,
  type ChainState,
  type Fog,
} from '../../src/sim/fog';
import { cardPin, powerPin, tiny, TINY_DIR, tuning } from './helpers';

const CATS = ['hero', 'pal', 'bystander'];
const glow = powerPin('glow', 'home.room', 0);

/** The tiny world 3 steps into a glow on the hero's room: two cases, heroOut 0 and 1 (a link). */
function split(): { setup: ReturnType<typeof fogSetup>; fog: Fog } {
  const setup = fogSetup(tiny, 1);
  let fog = initialFog(setup, CATS);
  for (let i = 0; i < 3; i++) fog = fogStep(setup, fog, undefined, true, null, [glow]);
  return { setup, fog };
}

/** Every hero state, over the cases, napping in his room. */
const napping = (fog: Fog): ChainState[] => {
  const out: ChainState[] = [];
  for (const fc of fog.cases)
    for (const e of fc.cats['hero']?.chain ?? [])
      if (e.s.activity === 'nap' && e.s.place === 'home.room' && e.s.walk === null)
        if (!out.some((s) => stateKey(s) === stateKey(e.s))) out.push(e.s);
  return out;
};

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

/** Bayes' rule by hand, exactly: w_i × L_i × WAVE_TOTAL / Σ_j w_j × L_j, rounded down. */
const bayes = (w: number[], l: number[]): number[] => {
  const num = w.map((x, i) => BigInt(x) * BigInt(l[i] ?? 0));
  const total = num.reduce((a, x) => a + x, 0n);
  return num.map((x) => Number((x * BigInt(WAVE_TOTAL)) / total));
};

describe('evidence over cases and chains (03 §14 steps 1-2)', () => {
  it('case weights after evidence equal Bayes’ rule by hand (one link)', () => {
    const { setup, fog } = split();
    expect(fog.cases.map((fc) => fc.links['fact:heroOut'])).toEqual([0, 1]);
    const ev: Evidence = { kind: 'cat', cat: 'hero', states: napping(fog), holds: true };
    const w = fog.cases.map((fc) => fc.weight);
    const l = fog.cases.map((fc) => likelihood(fc, ev));
    // the hero naps for sure where he did not go out, and only partly where he did
    expect(l[0]).toBe(1_000_000);
    expect(l[1]).toBeGreaterThan(0);
    expect(l[1]).toBeLessThan(1_000_000);
    const after = applyEvidence(setup, fog, ev);
    if (!after) throw new Error('impossible evidence');
    const got = after.cases.map((fc) => fc.weight);
    const want = bayes(w, l);
    got.forEach((x, i) => expect(Math.abs(x - (want[i] ?? 0))).toBeLessThanOrEqual(2));
    expect(sum(got)).toBe(WAVE_TOTAL);
    // the hero's chain keeps only the napping states, renormalised; the other cats are untouched
    const keys = napping(fog).map(stateKey);
    for (const [i, fc] of after.cases.entries()) {
      const chain = fc.cats['hero']?.chain ?? [];
      expect(chain.every((e) => keys.includes(stateKey(e.s)))).toBe(true);
      expect(sum(chain.map((e) => e.p))).toBe(1_000_000);
      expect(fc.cats['pal']).toEqual(fog.cases[i]?.cats['pal']);
    }
  });

  it('a watched fact keeps the cases that agree; negative evidence removes the states seen', () => {
    const { setup, fog } = split();
    const out = applyEvidence(setup, fog, { kind: 'fact', fact: 'heroOut', holds: true });
    expect(
      out?.cases.map((fc) => [fc.weight, fc.links['fact:heroOut'], fc.q.facts['heroOut']]),
    ).toEqual([[WAVE_TOTAL, 1, 1_000_000]]);
    const states = napping(fog);
    const not = applyEvidence(setup, fog, { kind: 'cat', cat: 'hero', states, holds: false });
    // where he surely napped, not seeing him napping is impossible: that case is gone
    expect(not?.cases.map((fc) => fc.links['fact:heroOut'])).toEqual([1]);
    const keys = states.map(stateKey);
    expect(not?.cases[0]?.cats['hero']?.chain.some((e) => keys.includes(stateKey(e.s)))).toBe(
      false,
    );
    const st = applyEvidence(setup, fog, {
      kind: 'state',
      storylet: 'lured',
      state: 'out',
      holds: false,
    });
    for (const fc of st?.cases ?? []) {
      const p = fc.q.storylets['lured']?.p ?? {};
      expect(p['out']).toBeUndefined();
      expect(sum(Object.values(p))).toBe(1_000_000);
    }
  });

  it('impossible evidence gives null; evidence about a cat not in the fog changes nothing', () => {
    const { setup, fog } = split();
    expect(
      applyEvidence(setup, fog, { kind: 'cat', cat: 'hero', states: [], holds: true }),
    ).toBeNull();
    const setup2 = fogSetup(tiny, 1);
    const f2 = fogStep(setup2, initialFog(setup2, ['pal']));
    const same = applyEvidence(setup2, f2, { kind: 'cat', cat: 'hero', states: [], holds: true });
    expect(same).toEqual(f2);
  });

  it('forward again: the conditioned fog steps on with every invariant (03 §18)', () => {
    const { setup, fog } = split();
    let f = applyEvidence(setup, fog, {
      kind: 'cat',
      cat: 'hero',
      states: napping(fog),
      holds: true,
    });
    if (!f) throw new Error('impossible evidence');
    for (let i = 0; i < 6; i++) {
      f = fogStep(setup, f, undefined, true, null, [glow]);
      expect(sum(f.cases.map((fc) => fc.weight))).toBe(WAVE_TOTAL);
      for (const fc of f.cases)
        for (const cat of Object.values(fc.cats))
          expect(sum(cat.chain.map((e) => e.p))).toBe(1_000_000);
    }
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
    JSON.parse(JSON.stringify(f), (_k, v: unknown) => {
      if (typeof v === 'number') expect(Number.isInteger(v)).toBe(true);
      return v;
    });
  });
});

describe('the anchor treated as already seen, strain (03 §14)', () => {
  // glow sends the hero out; rumour at street.b lets pal hear it: they can meet (anchor.met)
  const pins = [glow, cardPin('rumour', { place: 'street.b' }, 10)];

  it('conditioning multiplies case weights by P(anchor | case); strain is the raw chance', () => {
    const setup = fogSetup(tiny, 1);
    const p = projectToEnd(setup, initialFog(setup, CATS), pins);
    const raw = p.fog.cases;
    const pa = raw.map((fc) => fc.q.facts['anchor.met'] ?? 0);
    expect(pa.some((x) => x === 0) && pa.some((x) => x > 0)).toBe(true);
    expect(p.anchor).toBe(anchorChance(setup, p.fog));
    expect(p.anchor).toBe(
      sum(raw.map((fc, i) => Math.trunc((fc.weight * (pa[i] ?? 0)) / WAVE_TOTAL))),
    );
    // cases that never reach the anchor are gone; the rest by Bayes' rule
    const reach = raw.filter((_, i) => (pa[i] ?? 0) > 0);
    const want = bayes(
      reach.map((fc) => fc.weight),
      pa.filter((x) => x > 0),
    );
    const got = p.conditioned.cases.map((fc) => fc.weight);
    expect(got.length).toBe(reach.length);
    got.forEach((x, i) => expect(Math.abs(x - (want[i] ?? 0))).toBeLessThanOrEqual(2));
    expect(sum(got)).toBe(WAVE_TOTAL);
    expect(sum(got)).toBeGreaterThan(sum(reach.map((fc) => fc.weight)));
  });

  it('with the knob off, or when no case reaches the anchor, the weights stay raw', () => {
    const off = loadChapter(readChapterDir(TINY_DIR), {
      ...tuning,
      waves: { ...tuning.waves, anchorConditioning: false },
    });
    const setupOff = fogSetup(off, 1);
    const p = projectToEnd(setupOff, initialFog(setupOff, CATS), pins);
    expect(p.conditioned).toBe(p.fog);
    const setup = fogSetup(tiny, 1);
    const none = projectToEnd(setup, initialFog(setup, CATS), []);
    expect(none.anchor).toBe(0);
    expect(conditionOnAnchor(setup, none.fog)).toBe(none.fog);
  });
});

describe('a projection’s fray (03 §16, docs/questions.md M2-12)', () => {
  it('P(alive) never rises; the fray is the first step after which it is below the floor', () => {
    const setup = fogSetup(tiny, 1);
    // poking the bell's special triggers the rite: riteDone, the tiny world's fraysIf, for sure
    const pins = [cardPin('poke', { object: 'bell' }, 5, true)];
    let f = initialFog(setup, CATS);
    let last = aliveChance(f);
    let first: number | null = null;
    while (f.tick < tiny.world.ticks) {
      const t = f.tick;
      f = fogStep(setup, f, undefined, true, null, pins);
      const alive = aliveChance(f);
      // never rises, up to truncation: 1 ppm per case (shares and merges round down)
      expect(alive).toBeLessThanOrEqual(last + f.cases.length);
      last = alive;
      if (first === null && alive < tiny.tuning.fog.frayBelowPpm) first = t;
    }
    expect(first).not.toBeNull();
    expect(first ?? 999).toBeLessThan(tiny.world.ticks);
    expect(projectToEnd(setup, initialFog(setup, CATS), pins).fray).toBe(first);
  });

  it('a projection that never reaches the anchor frays at the end; one that may does not fray', () => {
    const setup = fogSetup(tiny, 1);
    const fog = initialFog(setup, CATS);
    expect(projectToEnd(setup, fog, []).fray).toBe(tiny.world.ticks);
    const may = projectToEnd(setup, fog, [glow, cardPin('rumour', { place: 'street.b' }, 10)]);
    expect(may.anchor).toBeGreaterThan(tiny.tuning.fog.frayBelowPpm);
    expect(may.fray).toBeNull();
  });
});
