// Assist mode's rules (06 §2, M8-1): which forming stories are marked, where, with which objects, which
// a held card rings, and which an edit disrupts. On Chapter 1's content, with frames set up by hand
// from a real first frame.
import { describe, expect, it } from 'vitest';
import { couldAdvance, disruptions, storyMarks, tiedTo, writes } from '../../src/player/assist';
import type { PlayerState, PlayerView } from '../../src/player/state';
import type { Frame, Pin } from '../../src/sim/types';
import { ch1 } from '../sim/helpers';
import { game, newGameView } from './helpers';

const c = ch1;
const base = newGameView(c, 4);
const first = base.frames[0];
if (!first) throw new Error('no first frame');
const frame0: Frame = first;

/** A view whose frame at tick 0 has these forming stories (Marti at his start place). */
function viewWith(forming: Frame['forming']): PlayerView {
  return { ...base, frames: [{ ...frame0, forming }] };
}

const teaOnRoad: Pin = {
  id: 'pin1',
  seq: 1,
  tick: 180,
  kind: 'card',
  card: 'tea_break',
  target: { place: 'town.roadworks' },
  special: false,
};
const lurePin: Pin = {
  id: 'pin2',
  seq: 2,
  tick: 715,
  kind: 'power',
  power: 'lure',
  place: 'flat.door',
};

describe('what a card or power could advance (06 §2)', () => {
  it('a card that writes what the state’s exits read advances it', () => {
    // tea_break on a place sets `teaBreakCalled`, which the foreman's break choice reads
    expect(writes(c, { card: 'tea_break' }).has('flag:teaBreakCalled')).toBe(true);
    expect(couldAdvance(c, { card: 'tea_break' }, 'roadworks_day', 'working')).toBe(true);
    // tea_break shifts teaCraving: a prime (`noFreshTea`) the lure's door choice counts
    expect(couldAdvance(c, { card: 'tea_break' }, 'door_lure', 'at_door')).toBe(true);
    // box writes boxPull and `boxHere`: nothing door_lure reads
    expect(couldAdvance(c, { card: 'box' }, 'door_lure', 'at_door')).toBe(false);
    // a special that triggers a storylet advances it
    expect(couldAdvance(c, { card: 'something_shiny' }, 'whistle_blown', 'blowing')).toBe(true);
    // the lure is what door_lure's first choice is gated on
    expect(couldAdvance(c, { power: 'lure' }, 'door_lure', 'home')).toBe(true);
  });

  it('a state with no exits reads nothing', () => {
    expect(couldAdvance(c, { card: 'tea_break' }, 'door_lure', 'out')).toBe(false);
  });
});

describe('which forming stories are tied (06 §2: scarce)', () => {
  const p = game(c, 4);
  it('main storylets and storylets with a protagonist role', () => {
    const tied = tiedTo(p, c);
    expect(tied('door_lure', 'home')).toBe(true); // main
    expect(tied('rokko_morning', 'awake')).toBe(true); // main
    expect(tied('crew_chatter', 'tale')).toBe(true); // Marti holds a role
    expect(tied('roadworks_day', 'working')).toBe(false);
    expect(tied('parcel_drop', 'dropping')).toBe(false);
  });

  it('a story a pinned card or power could advance (a paid event in the making)', () => {
    const tied = tiedTo({ ...p, pins: [teaOnRoad] }, c);
    expect(tied('roadworks_day', 'working')).toBe(true);
    expect(tied('roadworks_day', 'on_break')).toBe(false); // nothing on_break reads is written
    expect(tied('parcel_drop', 'dropping')).toBe(false);
  });
});

describe('story markers at the playhead (06 §2)', () => {
  const p = game(c, 4);
  const marti = frame0.cats['marti']?.[0]?.node ?? '';

  it('mark tied, unwatched forming stories on their cat, with the interactable objects there', () => {
    const v = viewWith([
      { storylet: 'door_lure', state: 'home', p: 400_000, cat: 'marti' },
      { storylet: 'parcel_drop', state: 'dropping', p: 900_000, cat: 'marti' },
      { storylet: 'roadworks_day', state: 'working', p: 700_000, cat: null },
    ]);
    const marks = storyMarks(p, v, c, null, true);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
      storylet: 'door_lure',
      p: 400_000,
      cat: 'marti',
      node: marti,
      ring: false,
    });
    const here = c.objects.filter((o) => o.node === marti).map((o) => o.id);
    expect(marks[0]?.objects).toEqual(here);
  });

  it('off: none', () => {
    const v = viewWith([{ storylet: 'door_lure', state: 'home', p: 400_000, cat: 'marti' }]);
    expect(storyMarks(p, v, c, null, false)).toEqual([]);
  });

  it('a storylet already watched is not marked', () => {
    const v = viewWith([{ storylet: 'door_lure', state: 'home', p: 400_000, cat: 'marti' }]);
    const watched: PlayerState = { ...p, frontier: { ...p.frontier, storylets: ['door_lure'] } };
    expect(storyMarks(watched, v, c, null, true)).toEqual([]);
  });

  it('a held card rings the stories it could advance; a power rings none', () => {
    const v = viewWith([
      { storylet: 'door_lure', state: 'at_door', p: 500_000, cat: 'marti' },
      { storylet: 'crew_chatter', state: 'tale', p: 300_000, cat: 'marti' },
    ]);
    const tea = storyMarks(p, v, c, { card: 'tea_break' }, true);
    expect(tea.map((m) => [m.storylet, m.ring])).toEqual([
      ['door_lure', true],
      ['crew_chatter', false],
    ]);
    expect(storyMarks(p, v, c, { power: 'lure' }, true).some((m) => m.ring)).toBe(false);
  });
});

describe('disruption warnings (06 §2)', () => {
  const p = game(c, 4);
  const at = (t: number, forming: Frame['forming']): Frame => ({ ...frame0, tick: t, forming });
  const door = (x: number): Frame['forming'] => [
    { storylet: 'door_lure', state: 'at_door', p: x, cat: 'marti' },
  ];

  it('an edit that drops a forming story’s peak by more than the share lists it', () => {
    const before = [at(0, []), at(1, door(800_000)), at(2, door(600_000))];
    const after = [at(0, []), at(1, door(300_000)), at(2, door(100_000))];
    expect(disruptions(p, c, before, after, 1)).toEqual([
      { storylet: 'door_lure', before: 800_000, after: 300_000 },
    ]);
  });

  it('a drop of exactly the share, or a rise, is not listed', () => {
    const before = [at(0, door(800_000))];
    expect(disruptions(p, c, before, [at(0, door(400_000))], 0)).toEqual([]);
    expect(disruptions(p, c, before, [at(0, door(900_000))], 0)).toEqual([]);
  });

  it('only from the edit tick on, only tied and unwatched stories', () => {
    const before = [at(0, door(900_000)), at(1, [])];
    expect(disruptions(p, c, before, [at(0, []), at(1, [])], 1)).toEqual([]);
    const parcel: Frame['forming'] = [
      { storylet: 'parcel_drop', state: 'dropping', p: 900_000, cat: null },
    ];
    expect(disruptions(p, c, [at(0, parcel)], [at(0, [])], 0)).toEqual([]);
    const watched: PlayerState = { ...p, frontier: { ...p.frontier, storylets: ['door_lure'] } };
    expect(disruptions(watched, c, [at(0, door(900_000))], [at(0, [])], 0)).toEqual([]);
  });

  it('a story tied by a pin the edit withdraws is judged as the player stood before', () => {
    const work: Frame['forming'] = [
      { storylet: 'roadworks_day', state: 'working', p: 700_000, cat: null },
    ];
    const withPin = { ...p, pins: [teaOnRoad, lurePin] };
    expect(disruptions(withPin, c, [at(0, work)], [at(0, [])], 0)).toEqual([
      { storylet: 'roadworks_day', before: 700_000, after: 0 },
    ]);
  });
});
