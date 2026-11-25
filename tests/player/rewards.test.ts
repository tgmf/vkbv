// Rewards (04 §7) and draws (04 §3.4): each key pays once, pressure raises a payout, the charge floor
// at the watched rain start and its variant, requirement items, the anchor, hooks, revealed places.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { TUNING_FILE } from '../../src/content/chapter1';
import { usePower } from '../../src/player/actions';
import { draw, payoutGain, reward } from '../../src/player/rewards';
import type { PlayerState } from '../../src/player/state';
import type { Content, WatchedFact, WatchedSummary } from '../../src/sim/types';
import { driver } from '../helpers/playthrough';
import { ch1, TINY_DIR } from '../sim/helpers';
import { game, revealing } from './helpers';

const summary = (more: Partial<WatchedSummary>): WatchedSummary => ({
  self: { node: 'flat.study', activity: 'read', interrupt: null },
  cats: [],
  storylets: [],
  detectors: [],
  factsSet: [],
  events: [],
  nodesSeen: [],
  paidBy: {},
  totalPressure: 0,
  weather: 'dry',
  ...more,
});
const fact = (tick: number, more: Partial<WatchedSummary>): WatchedFact => ({
  tick,
  cat: 'marti',
  digest: tick,
  summary: summary(more),
});
const withTuning = (c: Content, more: Partial<Content['tuning']>): Content => ({
  ...c,
  tuning: { ...c.tuning, ...more },
});

describe('payouts (04 §7)', () => {
  it('each key pays once; watching the same kind again pays nothing', () => {
    const p = game(ch1);
    const a = reward(ch1, p, fact(10, { storylets: ['door_lure.at_door'] }));
    expect([a.player.charge, a.rewards]).toEqual([
      15,
      [{ key: 'sl:door_lure.at_door', charge: 15 }],
    ]);
    const b = reward(ch1, a.player, fact(20, { storylets: ['door_lure.at_door'] }));
    expect([b.player, b.rewards]).toEqual([a.player, []]);
    // a state with no payout in economy.json pays nothing and records nothing
    const c = reward(ch1, p, fact(10, { storylets: ['door_lure.home'] }));
    expect([c.player, c.rewards]).toEqual([p, []]);
  });

  it('a state first watched under pressure pays more than its base', () => {
    // mult = min(3000, 1000 + trunc(pressure / 50) × 10 × 10) per mille
    expect(payoutGain(ch1, 60, 0)).toBe(60);
    expect(payoutGain(ch1, 60, 120)).toBe(72); // 1200‰
    expect(payoutGain(ch1, 60, 149)).toBe(72);
    expect(payoutGain(ch1, 60, 150)).toBe(78); // 1300‰
    expect(payoutGain(ch1, 60, 2000)).toBe(180); // capped at 3000‰
    const r = reward(ch1, game(ch1), fact(5, { storylets: ['door_lure.out'], totalPressure: 120 }));
    expect(r.player.charge).toBe(72);
  });

  it('charge never passes economy.charge.cap', () => {
    const p = { ...game(ch1), charge: 290 };
    expect(reward(ch1, p, fact(1, { storylets: ['under_the_boat.meeting'] })).player.charge).toBe(
      300,
    );
  });

  it('detectors, requirement items and the anchor', () => {
    const r = reward(
      ch1,
      game(ch1),
      fact(9, { detectors: ['near_miss'], factsSet: ['martiOut', 'anchor.meeting'] }),
    );
    expect(r.rewards.map((x) => [x.key, x.charge])).toEqual([
      ['det:near_miss', 25],
      ['req:0', 20], // martiOut
      ['req:6', 20], // anchor.meeting
      ['anchor', undefined],
    ]);
    expect(r.player.anchorWatched).toBe(true);
    // an `any` item pays once, whichever of its facts comes first
    const a = reward(ch1, game(ch1), fact(1, { factsSet: ['martiTurnedToSteps'] }));
    const b = reward(ch1, a.player, fact(2, { factsSet: ['martiWanderedToSea'] }));
    expect([a.rewards.map((x) => x.key), b.rewards]).toEqual([['req:2'], []]);
  });

  it('the charge floor at the watched rain start, and its variant', () => {
    const rain = fact(700, { events: ['rainStarted'], detectors: ['rain_started'] });
    const p = { ...game(ch1), charge: 20 };
    const on = reward(ch1, p, rain);
    expect([on.player.charge, on.player.paid]).toEqual([100, ['det:rain_started', 'rain']]);
    expect(reward(ch1, { ...p, charge: 150 }, rain).player.charge).toBe(150); // a floor, not a gift
    const off = withTuning(ch1, { charge: { ...ch1.tuning.charge, floorOn: false } });
    expect(reward(off, p, rain).player.charge).toBe(20);
    // the variant: the floor is off and rain_started pays floorAtRainStart as an ordinary payout
    const variant: Content = {
      ...ch1,
      economy: { ...ch1.economy, charge: { ...ch1.economy.charge, variantRainStartPays: true } },
    };
    const v = reward(variant, p, { ...rain, summary: { ...rain.summary, totalPressure: 120 } });
    expect(v.rewards.map((x) => [x.key, x.charge])).toEqual([
      ['det:rain_started', 120],
      ['rain', 0],
    ]);
    expect(v.player.charge).toBe(140);
  });

  it('a hook the followed cat voices joins the journal and gives its card; another cat’s does not', () => {
    const r = reward(
      ch1,
      game(ch1),
      fact(3, { events: ['voice:rokko:teaCraving', 'voice:teaCraving'] }),
    );
    expect(r.player.journal.hooks).toEqual(['teaCraving']);
    expect(r.player.cards['empty_teapot']?.zone).toBe('hand');
    expect(r.rewards).toEqual([
      { key: 'hook:teaCraving', hook: 'teaCraving', cards: ['empty_teapot'] },
    ]);
    const other = reward(ch1, game(ch1), fact(3, { events: ['voice:rokko:teaCraving'] }));
    expect(other.rewards).toEqual([]);
  });

  it('revealing: the places the followed cat sees join the map; flat places are already there', () => {
    const p = game(ch1);
    expect(p.revealed.every((n) => n.startsWith('flat.'))).toBe(true);
    const r = reward(ch1, p, fact(3, { nodesSeen: ['flat.study', 'town.porch', 'town.lane_n'] }));
    expect(r.player.revealed.filter((n) => n.startsWith('town.'))).toEqual([
      'town.lane_n',
      'town.porch',
    ]);
    expect(r.rewards).toEqual([
      { key: 'reveal:town.porch', revealed: ['town.porch'] },
      { key: 'reveal:town.lane_n', revealed: ['town.lane_n'] },
    ]);
  });
});

describe('draws, rule discard (04 §3.4)', () => {
  const discarding = (seed: number): PlayerState => {
    const p = game(ch1, seed);
    const cards = { ...p.cards };
    for (const id of ['something_shiny', 'tea_break', 'irresistible_junk', 'sudden_flea', 'box'])
      cards[id] = { zone: 'discard' };
    return { ...p, cards };
  };
  const order = (seed: number) => {
    let p = discarding(seed);
    const all: string[] = [];
    for (let i = 0; i < 5; i++) {
      const d = draw(p, 1);
      p = d.player;
      all.push(...d.drawn);
    }
    return { all, p };
  };

  it('reshuffles the discard pile in the seed’s order: the same for the same seed, another for another', () => {
    const a = order(4);
    expect(a.all).toEqual(order(4).all);
    expect([...a.all].sort()).toEqual([
      'box',
      'irresistible_junk',
      'something_shiny',
      'sudden_flea',
      'tea_break',
    ]);
    expect(a.p.reshuffles).toBe(1);
    expect(a.p.drawPile).toEqual([]);
    const others = [6, 7, 10, 12].map((s) => order(s).all.join());
    expect(others.some((x) => x !== a.all.join())).toBe(true);
  });

  it('with nothing discarded, nothing is drawn; a hook or a region under discard draws one', () => {
    expect(draw(game(ch1), 1).drawn).toEqual([]);
    const c = withTuning(ch1, { player: { ...ch1.tuning.player, playedCardRule: 'discard' } });
    const r = reward(c, discarding(4), fact(1, { nodesSeen: ['town.porch'] }));
    expect(r.rewards[0]?.cards).toHaveLength(1);
    expect(r.player.reshuffles).toBe(1);
  });
});

describe('Gaze (04 §7)', () => {
  it('fixes what its circle holds and pays nothing for it', () => {
    const d = driver({
      chapter: readChapterDir(TINY_DIR),
      tuning: TUNING_FILE,
      pinsets: { sets: {} },
    });
    d.start(1, 1);
    d.player = revealing({ ...d.player, charge: 100 }, 'street.c');
    d.playTo(5);
    expect(
      d.act((p, v, c) => usePower(p, v, c, { power: 'gaze', place: 'street.c' })).error,
    ).toBeUndefined();
    const paid = d.player.paid;
    d.playTo(12);
    expect(d.view.gazeFacts.map((g) => [g.tick, g.cat])).toEqual([
      [5, 'pal'],
      [6, 'pal'],
      [7, 'pal'],
    ]);
    expect(d.player.charge).toBe(95); // its cost, and nothing back
    expect(d.player.paid).toEqual(paid);
  });
});
