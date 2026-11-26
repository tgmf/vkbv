// Assist mode (06 §2; Tagir, docs/questions.md M7-1, M8-1): story markers where a story tied to the
// anchor, a protagonist or a paid event is forming, the interactable objects at its place, a ring on
// the stories a held card could advance, and the forming stories an edit would disrupt. Rules the UI
// asks; the renderer only draws them.
import type { Condition, Prim, Score } from '../content/schemas/dsl';
import type { Content } from '../content/schemas/content';
import { mainStorylets } from '../sim/readers';
import type { CatId, Frame, NodeId, ObjectId, StoryletId } from '../sim/types';
import { inspect } from './actions';
import type { PlayerState, PlayerView } from './state';
import type { Held } from './targets';

/** One story marker at the playhead. */
export interface StoryMark {
  storylet: StoryletId;
  state: string;
  p: number; // ppm: the share of each pulse cycle it is lit
  cat: CatId;
  node: NodeId;
  objects: ObjectId[]; // interactable objects at its place
  ring: boolean; // the held card could advance it
}

/** What a condition, score or hazard term reads that a card could change: `gauge:`, `flag:`, `pin:`, `power:`, `activity:`, `heard:`. */
function reads(c: Content, cond: Condition, out: Set<string>): void {
  if ('all' in cond) for (const x of cond.all) reads(c, x, out);
  else if ('any' in cond) for (const x of cond.any) reads(c, x, out);
  else if ('not' in cond) reads(c, cond.not, out);
  else if ('gauge' in cond) out.add(`gauge:${gaugeName(cond.gauge)}`);
  else if ('flag' in cond) out.add(`flag:${cond.flag}`);
  else if ('pin' in cond) out.add(`pin:${cond.pin}`);
  else if ('power' in cond) out.add(`power:${cond.power}`);
  else if ('activity' in cond) out.add(`activity:${cond.is}`);
  else if ('heard' in cond) out.add(`heard:${cond.heard}`);
}

const gaugeName = (g: string): string => g.slice(g.indexOf('.') + 1);

function scoreReads(c: Content, sc: Score | undefined, out: Set<string>): void {
  for (const t of sc?.terms ?? []) {
    if ('if' in t && t.if) reads(c, t.if, out);
    if ('gauge' in t) out.add(`gauge:${gaugeName(t.gauge)}`);
    if ('primeCount' in t) for (const pr of c.world.primes.list) reads(c, pr.cond, out);
  }
}

/** What the exits of a storylet state read. */
export function stateReads(c: Content, storylet: StoryletId, state: string): Set<string> {
  const out = new Set<string>();
  for (const e of c.storylet[storylet]?.states[state]?.exits ?? []) {
    if (e.gate) reads(c, e.gate, out);
    scoreReads(c, e.score, out);
    for (const t of e.terms ?? []) reads(c, t.if, out);
  }
  return out;
}

/**
 * What a card or power writes, on any target or as a special: the keys `stateReads` uses, and
 * `storylet:` for a storylet it triggers.
 */
export function writes(c: Content, held: Held): Set<string> {
  const out = new Set<string>();
  let prims: Prim[];
  let pin: string;
  if ('card' in held) {
    const def = c.card[held.card];
    if (!def) return out;
    pin = `pin:${held.card}`;
    prims = [
      ...(def.on.cat ?? []),
      ...(def.on.object ?? []),
      ...(def.on.place ?? []),
      ...(def.special?.effects ?? []),
    ];
  } else {
    pin = `power:${held.power}`;
    prims = c.power[held.power]?.effects ?? [];
  }
  for (const x of prims)
    switch (x.prim) {
      case 'gaugeShift':
        out.add(`gauge:${x.gauge}`);
        break;
      case 'setFlag':
        out.add(`flag:${x.flag}`);
        break;
      case 'attract':
        out.add(pin);
        out.add('activity:attracted');
        break;
      case 'repel':
        out.add(pin);
        out.add('activity:repelled');
        break;
      case 'delay':
        out.add(`activity:${x.action}`);
        break;
      case 'socialSpread':
        out.add(`heard:${x.event}`);
        break;
      case 'triggerStorylet':
        out.add(`storylet:${x.storylet}`);
        break;
      case 'move':
        out.add('activity:goTo');
        break;
      case 'interrupt':
      case 'collapse':
        break;
      default: {
        const never: never = x;
        throw new Error(`unknown primitive ${JSON.stringify(never)}`);
      }
    }
  return out;
}

/** Whether a card or power could advance a forming story in `state` (06 §2, M8-1). */
export function couldAdvance(c: Content, held: Held, storylet: StoryletId, state: string): boolean {
  const w = writes(c, held);
  if (w.has(`storylet:${storylet}`)) return true;
  for (const k of stateReads(c, storylet, state)) if (w.has(k)) return true;
  return false;
}

/**
 * Whether assist mode may mark a forming story (06 §2, "scarce"; M8-1): a main storylet (tied to the
 * anchor), one with a role that binds a followed protagonist, or one a pinned card or power could
 * advance in that state (a paid event in the making: a story with a card on it).
 */
export function tiedTo(
  p: PlayerState,
  c: Content,
): (storylet: StoryletId, state: string) => boolean {
  const main = mainStorylets(c);
  const held: Held[] = p.pins.map((x) =>
    x.kind === 'card' ? { card: x.card } : { power: x.power },
  );
  const memo: Record<string, boolean> = {};
  return (storylet, state) => {
    const key = `${storylet}.${state}`;
    const known = memo[key];
    if (known !== undefined) return known;
    const def = c.storylet[storylet];
    const yes =
      main.includes(storylet) ||
      Object.values(def?.roles ?? {}).some((r) => 'cat' in r && p.followed.includes(r.cat)) ||
      held.some((h) => couldAdvance(c, h, storylet, state));
    memo[key] = yes;
    return yes;
  };
}

/** Every storylet state watched in this timeline, as `storylet.state`. */
const watchedStates = (p: PlayerState): Set<string> =>
  new Set(p.watched.flatMap((f) => f.summary.storylets));

/**
 * Whether a forming story has not happened yet (06 §2, M8): some state its current state leads to has
 * not been watched in this timeline. (Marti perceives every storylet he holds a role in from its first
 * state, so "the storylet was watched" would hide the lure's story from dawn.)
 */
const unseen = (c: Content, seen: Set<string>, storylet: StoryletId, state: string): boolean =>
  (c.storylet[storylet]?.states[state]?.exits ?? []).some((e) => !seen.has(`${storylet}.${e.to}`));

/** The story markers at the playhead (06 §2), with assist mode `on`: tied, not yet happened, forming, on a cat. */
export function storyMarks(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  held: Held | null,
  on: boolean,
): StoryMark[] {
  const frame = view.frames[p.playhead];
  if (!on || !frame) return [];
  const tied = tiedTo(p, c);
  const seen = watchedStates(p);
  const out: StoryMark[] = [];
  for (const f of frame.forming) {
    if (f.cat === null || !tied(f.storylet, f.state)) continue;
    if (!unseen(c, seen, f.storylet, f.state)) continue;
    const node = frame.cats[f.cat]?.[0]?.node;
    if (node === undefined) continue;
    const objects = c.objects
      .filter((o) => o.node === node && !inspect(p, view, c, { object: o.id }).error)
      .map((o) => o.id);
    out.push({
      storylet: f.storylet,
      state: f.state,
      p: f.p,
      cat: f.cat,
      node,
      objects,
      ring: held !== null && 'card' in held && couldAdvance(c, held, f.storylet, f.state),
    });
  }
  return out;
}

/**
 * A forming story an edit would disrupt: its highest chance after the edit tick, before and after, and
 * where the alert places it (the tick of that peak before the edit and the cat it formed on).
 */
export interface Disruption {
  storylet: StoryletId;
  before: number;
  after: number;
  tick: number;
  cat: CatId | null;
}

interface Peak {
  p: number;
  tick: number;
  cat: CatId | null;
}

/** Each tied, unwatched story's highest forming chance over frames `from`..end (the first such tick). */
function peaks(
  p: PlayerState,
  c: Content,
  frames: readonly Frame[],
  from: number,
  tied: (storylet: StoryletId, state: string) => boolean,
): Record<string, Peak> {
  const seen = watchedStates(p);
  const out: Record<string, Peak> = {};
  for (let t = Math.max(0, from); t < frames.length; t++)
    for (const f of frames[t]?.forming ?? [])
      if (
        unseen(c, seen, f.storylet, f.state) &&
        tied(f.storylet, f.state) &&
        f.p > (out[f.storylet]?.p ?? 0)
      )
        out[f.storylet] = { p: f.p, tick: t, cat: f.cat };
  return out;
}

/**
 * The forming stories an edit drops by more than `assist.disruptSharePm` (06 §2): each story tied (as
 * the player stood before the edit) and not yet watched, its highest forming chance from the edit tick
 * to the edge, in the frames before the edit and in the preview's. In content order.
 */
export function disruptions(
  p: PlayerState,
  c: Content,
  before: readonly Frame[],
  after: readonly Frame[],
  from: number,
): Disruption[] {
  const tied = tiedTo(p, c);
  const was = peaks(p, c, before, from, tied);
  const now = peaks(p, c, after, from, tied);
  const share = c.tuning.assist.disruptSharePm;
  return c.storylets.flatMap((sl) => {
    const b = was[sl.id];
    const a = now[sl.id]?.p ?? 0;
    if (!b || a * 1000 >= b.p * (1000 - share)) return [];
    return [{ storylet: sl.id, before: b.p, after: a, tick: b.tick, cat: b.cat }];
  });
}
