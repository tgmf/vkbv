// The one-history invariants of 03 §18, checked over many seeds and streams (M1 acceptance).
// Each test file runs a slice of streams so Vitest can spread the work over its workers.
import { expect } from 'vitest';
import type { Content } from '../../src/content/load';
import { initialState, runHistory, uniformStreams } from '../../src/sim/history';
import { sample } from '../../src/sim/math';
import { rand } from '../../src/sim/rng';
import { step } from '../../src/sim/step';
import { catNode } from '../../src/sim/space';
import type { Pin, SimState } from '../../src/sim/types';

const TRAITS = ['O', 'C', 'E', 'A', 'N'];

/** A JSON number token with a fraction or an exponent (string values never start right after : [ ,). */
const NON_INTEGER = /[:[,]-?\d+(?:\.\d+|[eE])/;

function checkState(c: Content, s: SimState): void {
  const json = JSON.stringify(s);
  const bad = NON_INTEGER.exec(json);
  if (bad)
    expect.fail(
      `non-integer at tick ${s.tick}: …${json.slice(Math.max(0, bad.index - 40), bad.index + 20)}…`,
    );
  for (const [id, cs] of Object.entries(s.cats))
    for (const [g, v] of Object.entries(cs.base)) {
      const lo = TRAITS.includes(g) ? 0 : c.hooksFloor;
      if (v < lo || v > 1000) expect.fail(`gauge ${id}.${g} = ${v} at tick ${s.tick}`);
    }
}

/**
 * No pins: integers, gauge ranges, JSON round-trip; and on Chapter 1, B1 (Marti stays in the flat).
 * Steps the day here instead of runHistory so that only one state is alive at a time.
 */
export function checkUnpinned(c: Content, seeds: number[], streams: number[], b1: boolean): void {
  for (const seed of seeds)
    for (const stream of streams) {
      const streamsMap = uniformStreams(c, stream);
      const memo = {};
      let s = initialState(c, seed, streamsMap, memo);
      for (;;) {
        checkState(c, s);
        if (b1) {
          const marti = s.cats['marti'];
          const region = marti ? c.node[catNode(marti)]?.region : undefined;
          if (region !== 'flat')
            expect.fail(`B1: seed ${seed} stream ${stream}: Marti in ${region} at tick ${s.tick}`);
        }
        if (s.tick >= c.world.ticks) break;
        const t = s.tick;
        const next = step(
          c,
          seed,
          streamsMap,
          s,
          [],
          (bp) =>
            sample(
              bp.options.map((o) => o.ppm),
              rand(seed, `s${stream}:branch`, t, bp.key, 1_000_000),
            ),
          memo,
        ).state;
        if (!next) throw new Error('unexpected branch point');
        s = next;
      }
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
}

/** A pin set drawn with rand: 1 to 4 pins of any card or power on any target at any tick. */
export function randomPins(c: Content, k: number): Pin[] {
  const r = (purpose: string, n: number) => rand(k, 'pins', 0, purpose, n);
  const pins: Pin[] = [];
  const count = 1 + r('count', 4);
  for (let i = 0; i < count; i++) {
    const tick = r(`tick${i}`, c.world.ticks);
    const id = `r${k}.${i}`;
    if (r(`power${i}`, 5) === 0) {
      const power = c.powers[r(`which${i}`, c.powers.length)]?.id ?? '';
      pins.push({
        id,
        seq: i,
        tick,
        kind: 'power',
        power,
        place: c.nodes[r(`place${i}`, c.nodes.length)]?.id ?? '',
      });
      continue;
    }
    const card = c.cards[r(`card${i}`, c.cards.length)]?.id ?? '';
    const kind = r(`target${i}`, 3);
    const target =
      kind === 0
        ? { cat: c.cats[r(`cat${i}`, c.cats.length)]?.id ?? '' }
        : kind === 1
          ? { object: c.objects[r(`object${i}`, c.objects.length)]?.id ?? '' }
          : { place: c.nodes[r(`node${i}`, c.nodes.length)]?.id ?? '' };
    pins.push({
      id,
      seq: i,
      tick,
      kind: 'card',
      card,
      target,
      special: kind === 1 && r(`special${i}`, 2) === 0,
    });
  }
  return pins;
}

/** With pins: invariants hold, and the states up to the first pin's tick equal the unpinned ones. */
export function checkPinned(c: Content, sets: number[]): void {
  for (const k of sets) {
    const pins = randomPins(c, k);
    const seed = k;
    const stream = k % 32;
    const h = runHistory(c, seed, stream, pins);
    const plain = runHistory(c, seed, stream);
    for (const s of h.states) checkState(c, s);
    const first = Math.min(...pins.map((p) => p.tick));
    for (let t = 0; t <= first; t++) expect(h.states[t]).toEqual(plain.states[t]);
    expect(runHistory(c, seed, stream, pins)).toEqual(h); // same input, same history
  }
}

/** A pin that is invalid in every history changes nothing but its own fizzle event and pin status. */
export function checkFizzle(c: Content, pin: Pin, seeds: number[]): void {
  const strip = (s: SimState) => ({ ...s, pins: {} });
  for (const seed of seeds) {
    const plain = runHistory(c, seed, 0);
    const h = runHistory(c, seed, 0, [pin]);
    expect(h.states.map(strip)).toEqual(plain.states.map(strip));
    expect(h.events.map((list) => list.filter((e) => e.type !== 'fizzle'))).toEqual(plain.events);
    expect(h.events.flat().filter((e) => e.type === 'fizzle')).toHaveLength(1);
  }
}
