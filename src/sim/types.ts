// Simulation types (spec 03 §5, §6, §11). Everything here is plain JSON with integer numbers.
import type { PlaceSelector } from '../content/schemas/chapter';
import type { Condition, Effect } from '../content/schemas/dsl';
import type { Content } from '../content/schemas/content';
import type { PathMemo } from './space';

export type { Content };
export type CatId = string;
export type NodeId = string;
export type EdgeId = string;
export type ObjectId = string;
export type CardId = string;
export type PowerId = string;
export type PinId = string;
export type Pos = [number, number]; // integer metres [x, z]

// --- pins (03 §11) ------------------------------------------------------------------------------
export type Pin =
  | {
      id: PinId;
      seq: number;
      tick: number;
      kind: 'card';
      card: CardId;
      target: { cat: CatId } | { object: ObjectId } | { place: NodeId };
      special: boolean;
    }
  | { id: PinId; seq: number; tick: number; kind: 'power'; power: PowerId; place: NodeId };

// --- state of one history (03 §5) ---------------------------------------------------------------
export type CatPos =
  { at: NodeId } | { from: NodeId; to: NodeId; edge: EdgeId; left: number; of: number };

export interface GaugeMod {
  gauge: string;
  add: number;
  left: number;
  decayPerTick: number;
  pin: PinId | null;
}

export interface CatState {
  pos: CatPos;
  route: NodeId[]; // places still to visit after the current edge
  activity: string;
  boredom: number; // 0..1000; rises while at the activity's place, reset on a switch (03 §8.2)
  forcedLeft: number; // ticks left of a card's `delay` (03 §9.3); 0 = none
  lastKey: number; // hash32 of the decision key of the last decision (03 §8.2); -1 = none yet
  activityStart: number;
  activityPlace: NodeId | null; // null = here
  control: 'free' | 'storylet' | 'forced';
  interrupt: null | { action: string; left: number; by: string };
  base: Record<string, number>; // traits O C E A N and hooks
  initial: Record<string, number>; // base at tick 0
  mods: GaugeMod[];
  pressure: number;
  touchedBy: PinId[]; // sorted
  knowsClosed: EdgeId[]; // sorted
  heard: string[]; // sorted event names
  voiceAt: Record<string, number>; // last tick each hook voiced
}

export interface Flag {
  value: number;
  until: number | null;
}

export interface StoryletRun {
  state: string | null; // null = never activated; a terminal state stays here once reached
  enteredAt: number;
  roles: Record<string, CatId[]>;
  ended: boolean; // reached a terminal state at least once
}

export interface PartialMatch {
  stage: number;
  stageTick: number;
  count: number;
}

export interface RunningEffect {
  id: string; // `${pinId}:${index}`
  kind: 'attract' | 'repel' | 'flag';
  pin: PinId;
  source: { card: CardId } | { power: PowerId };
  place: NodeId;
  left: number;
  born: number;
  radiusM: number;
  strength: number;
  scale: { gauge: string; per: number; add: number } | { primeCount: string; add: number } | null;
  affects: { kinds: string[]; orTemperatureTenthsGte?: number | undefined } | null;
}

/** A socialSpread hop waiting to be re-emitted next tick (03 §9.3). */
export interface Echo {
  name: string;
  cat: CatId;
  radiusM: number;
  hops: number;
}

export interface SimState {
  tick: number;
  weather: { now: 'dry' | 'rain'; startedAt: number | null; stoppedAt: number | null };
  facts: string[]; // sorted, never removed
  flags: Record<string, Flag>; // `name` or `name@node`
  counters: Record<string, number>;
  cats: Record<CatId, CatState>; // keys in cast order
  storylets: Record<string, StoryletRun>;
  pools: Record<string, PartialMatch[]>;
  effects: RunningEffect[]; // creation order
  pins: Record<PinId, 'pending' | 'fired' | 'expired'>;
  echoes: Echo[];
  anchor: { reachedAt: number | null; deadAt: number | null };
}

// --- events (03 §6) -----------------------------------------------------------------------------
export type SimEvent = { tick: number } & (
  | { type: 'pinFired'; pin: PinId; special: boolean; card: CardId | null }
  | { type: 'fizzle'; pin: PinId; reason: 'noBranch' | 'wrongCat' | 'hidden' }
  | {
      type: 'emit';
      name: string;
      pos: Pos;
      node: NodeId;
      radiusM: number | null; // a sound when set
      source: CatId | null; // the cat that emitted it
      to: CatId | null;
      storylet: string | null;
      global: boolean; // weather: everyone perceives it
      hops: number; // socialSpread hops left
      factIfPerceivedBy: Record<CatId, string> | null;
    }
  | {
      type: 'voice';
      cat: CatId;
      hook: string;
      line: string;
      pos: Pos;
      node: NodeId;
      radiusM: number;
    }
  | { type: 'depart'; cat: CatId; from: NodeId; to: NodeId }
  | { type: 'arrive'; cat: CatId; node: NodeId }
  | { type: 'blocked'; cat: CatId; edge: EdgeId }
  | { type: 'activity'; cat: CatId; activity: string; place: NodeId | null }
  | { type: 'activityFinished'; cat: CatId; activity: string }
  | { type: 'interrupt'; cat: CatId; action: string; ticks: number; by: string }
  | { type: 'storylet'; id: string; state: string; roles: Record<string, CatId[]> }
  | { type: 'detector'; id: string }
  | { type: 'fact'; fact: string }
  | { type: 'anchor'; reached: boolean }
);
export type EventOf<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;

/** An outcome the content leaves to chance (03 §6). */
export interface BranchPoint {
  key: string;
  options: { label: string; ppm: number }[];
}

/** Each cat and the world draw sampled noise from their own stream (03 §13). */
export type Streams = Record<string, number>;

/** How one history ends (03 §12.2): it reached the anchor, or died (fray, or the chapter's end). */
export type End = { kind: 'anchor' | 'dead'; tick: number };

export const catScope = (ctx: { streams: Streams }, cat: CatId): string =>
  `s${ctx.streams[cat] ?? 0}:${cat}`;
export const worldScope = (ctx: { streams: Streams }): string =>
  `s${ctx.streams['world'] ?? 0}:world`;

/** Everything one step works with. `s` is the step's own copy of the state, changed in place. */
export interface Ctx {
  c: Content;
  seed: number;
  streams: Streams;
  s: SimState;
  prev: SimState; // the step's input, untouched (hook voices compare against it)
  t: number;
  events: SimEvent[]; // this tick's events so far, in emission order
  pins: readonly Pin[]; // the whole log, sorted by (tick, seq)
  pick: (bp: BranchPoint) => number; // resolves a branch point to an option index
  chanceN: number; // counts `chance` effects this tick (purpose chance:<n>)
  memo: PathMemo; // path results for this map, shared across steps by the caller
  decisions: DecisionMemo; // decision reads and results (03 §8.2), shared by the caller
  /** The lantern's live cats (03 §13.4); absent = every cat is live (single-history mode). */
  live?: readonly CatId[];
  /** Storylets held by the fog (03 §13.4); phase 4 skips them. */
  held?: readonly string[];
  /** Placed cats still dwelling (03 §15.1): phase 6 makes no free decision for them. */
  dwell?: readonly CatId[];
  /**
   * In the lantern: effects of its storylets on fogged cats, collected for the fog (03 §13.4); a
   * storylet that went live with roles still fogged acts on them through the fog.
   */
  fogFx?: { cat: CatId; effect: Effect; scope: Scope }[];
  /** Set while the fog evaluates content: reads of fogged cats and fog quantities (03 §13.3). */
  fog?: FogReader;
  /** While a fog decision runs: fog leaves are rounded down to this many ppm (03 §8.2). */
  quantum?: number;
  /**
   * In the fog, per case and step: decision inputs already evaluated, by cat, input and (for
   * inputs that depend on the deciding state) its position and activity. Results are unchanged.
   */
  partsMemo?: Record<string, unknown>;
}

/**
 * The decision cache (03 §8.2): what each activity's gate and score read, and decision results by
 * their exact inputs. Owned by the caller for one recompute; `off` disables the result cache (the
 * cache-on/off test). `calls` and `hits` are measurements only.
 */
export interface DecisionMemo {
  reads: Record<string, DecisionReads>;
  /** What a cat's whole decision reads, by cat and (when not in its list) current activity. */
  unions: Record<string, DecisionReads>;
  results: Record<string, { cands: Candidate[]; ppm: number[] }>;
  off: boolean;
  calls: number;
  hits: number;
}

/** What an activity's gate and score terms read: gauge refs, other leaf conditions, place selectors that depend on the world. */
export interface DecisionReads {
  gauges: string[];
  leaves: Condition[];
  places: PlaceSelector[];
}

/** One option a decision may switch to: an activity, or an attract/repel offer (03 §8.2, §9.3). */
export interface Candidate {
  activity: string;
  score: number;
  effect: RunningEffect | null;
}

export const newDecisionMemo = (off = false): DecisionMemo => ({
  reads: {},
  unions: {},
  results: {},
  off,
  calls: 0,
  hits: 0,
});

/** A fogged cat's chain in one case, as stand-in cat states with their probability (ppm). */
export type StandIns = readonly { cat: CatState; p: number }[];

/** What conditions read from the fog (03 §13.3, §13.6). */
export interface FogReader {
  /** The chain of a fogged cat in the current case; null for a live cat or the cat deciding. */
  chain(id: CatId): StandIns | null;
  /** The most likely state of a fogged cat (for `nearCat`), or null for a live cat. */
  likely(id: CatId): CatState | null;
  /** P(set) of a fact (`fact:<id>`), flag (`flag:<key>`) or storylet state (`state:<sl>.<st>`). */
  quantity(key: string): number;
  /** Expected value and variance of a counter. */
  counter(name: string): { mean: number; variance: number };
  /** P(the cat has perceived the event). */
  heard(cat: CatId, event: string): number;
  /** P(the fogged cat finished the activity this tick). */
  finished(cat: CatId, activity: string): number;
}

/** Whether a cat is simulated in this step: live in the lantern, or any cat in a single history. */
export const isLive = (ctx: Pick<Ctx, 'live'>, id: CatId): boolean =>
  ctx.live === undefined || ctx.live.includes(id);

/** What the lantern passes to `step` (03 §13.4). */
export interface LanternArgs {
  live: readonly CatId[];
  held: readonly string[];
  dwell?: readonly CatId[];
  /** The fog as the lantern reads it: fogged cats and fog quantities as ppm (03 §13.3, §14). */
  fog?: FogReader;
  /** Fog events a protagonist perceived, drawn into the lantern: perceived in phase 7 (03 §15.1). */
  incoming?: readonly SimEvent[];
}

/** Who `self` and `@role` mean while evaluating content. */
export interface Scope {
  self?: CatId | undefined;
  roles?: Readonly<Record<string, CatId[]>> | undefined;
  storylet?: string | undefined; // the storylet whose effects these are
  origin?: CatId | undefined; // where an event with no at/from comes from (a storylet's first role)
}

// --- wave and bridge types (filled in M2) -------------------------------------------------------
/** A cat in a watched view: where it stands and what it does. */
export interface SeenCat {
  cat: CatId;
  node: NodeId;
  activity: string;
}

/**
 * What a watched fact shows (03 §15.2). `self` and `cats` (the protagonist's own part and the cats
 * it sees) are there so a re-run can compare parts (§15.5).
 */
export interface WatchedSummary {
  self: { node: NodeId; activity: string; interrupt: string | null };
  cats: SeenCat[];
  storylets: string[]; // "storyletId.state" entered at the tick
  detectors: string[];
  factsSet: string[];
  events: string[];
  nodesSeen: NodeId[];
  paidBy: Record<string, PinId[]>;
  totalPressure: number;
  weather: 'dry' | 'rain';
}

export interface WatchedFact {
  tick: number;
  cat: CatId;
  digest: number;
  summary: WatchedSummary;
}

/** A fact Gaze fixed (03 §15.4): a fogged cat in the circle at a tick. */
export interface GazeFact {
  tick: number;
  pin: PinId;
  cat: CatId;
  node: NodeId;
  activity: string;
}

/** One distinct way a cat may stand at a tick (03 §16): a live cat has one, at 1 000 000. */
export interface Ghost {
  node: NodeId;
  pos: Pos;
  activity: string;
  interrupt: string | null;
  p: number;
}

/**
 * What the renderer and the player layer need at one tick (03 §16; `samples` wait for M5,
 * docs/questions.md M2-21). `happens`: P(it happens at this tick) per emitted event name,
 * `storylet:<id>.<state>` and `detector:<id>`. `requirements`: P per top-level item of the anchor's
 * requirement tree, in tree order; `progress` (04 §6) counts the items at `frontier.countAtPpm`.
 */
export interface Frame {
  tick: number;
  cats: Record<CatId, Ghost[]>;
  happens: Record<string, number>;
  rain: number;
  requirements: number[];
  progress: number;
}

/** Frames from tick `from` on, as a re-run streams them (02 §3). */
export interface FramesPatch {
  from: number;
  frames: Frame[];
}

/** How far the story has been played (04 §6): the re-run's frontier limit is read from it. */
export interface Frontier {
  story: number;
  pastTicks: number;
  storylets: string[];
}

/** Debug numbers of a re-run (03 §17), per tick 0..edge; its time is added by the worker. */
export interface RerunStats {
  cases: number[];
  live: number[];
  states: number[];
  strain: number | null; // only when asked for (the debug panel is open)
  localCauses: number;
  ms: number; // the re-run's time, measured by the worker (0 from src/sim, which reads no clock)
}

/** A re-run's result (03 §17): frames for ticks 0..edge, and how the lantern ends. */
export interface RecomputeResult {
  frames: Frame[];
  edge: number;
  end: { kind: 'anchor' | 'fray' | 'chapterEnd' | 'limit'; tick: number };
  reopened: WatchedFact[];
  breaks: WatchedFact[]; // the reopened facts that were paid (04 §4)
  gazeFacts: GazeFact[];
  stats: RerunStats;
}

/** Lookup that must succeed because content was cross-checked at load. */
export function need<T>(record: Readonly<Record<string, T>>, key: string, what: string): T {
  const v = record[key];
  if (v === undefined) throw new Error(`unknown ${what} ${key}`);
  return v;
}
