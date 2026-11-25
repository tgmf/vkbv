// The single source of truth for every message between the main thread and the worker (spec 02 §3).
import type { Tuning } from '../content/schemas/tuning';
import type {
  CatId,
  FramesPatch,
  Frontier,
  Pin,
  RecomputeResult,
  SimEvent,
  SimState,
  WatchedFact,
} from '../sim/types';

export type MainToWorker =
  | { kind: 'init'; reqId: number; tuning?: Partial<Tuning> }
  | { kind: 'vet'; reqId: number; requestedSeed: number }
  | {
      kind: 'recompute';
      reqId: number;
      seed: number;
      pins: Pin[];
      watched: WatchedFact[];
      frontier: Frontier;
      preview: boolean; // true: kept apart until `commit`; false: becomes the current wave at once
      strain?: boolean; // also compute strain (a projection from the edge): debug panel only
    } // a re-run (03 §17) against the current (committed) wave
  | { kind: 'commit'; reqId: number } // make the last finished preview the current wave; replies `ready`
  | { kind: 'observe'; reqId: number; tick: number; cat: CatId }
  | { kind: 'debugHistory'; reqId: number; tick: number; index: number }
  // Dev inspector (docs/milestones/M1.5-inspector.md): one history, viewed one tick at a time.
  | { kind: 'inspect'; reqId: number; seed: number; stream: number; pinset: string; tick: number };

/** A request as the caller writes it: any MainToWorker message without its reqId. */
export type Request = MainToWorker extends infer M
  ? M extends unknown
    ? Omit<M, 'reqId'>
    : never
  : never;

export type WorkerToMain =
  | { kind: 'ready'; reqId: number }
  | { kind: 'vetted'; reqId: number; seed: number }
  // Streamed while a re-run runs: frames from `frames.from` (the replayed checkpoint) to `upTo`. Frames
  // before the first patch's `from` are the current wave's; nothing past `upTo` exists yet.
  | { kind: 'rerun'; reqId: number; upTo: number; frames: FramesPatch }
  | { kind: 'result'; reqId: number; result: RecomputeResult }
  // A watched fact (03 §15.2). At the lantern edge the edge moves one tick: `frames` holds the new
  // edge's frame, and `edge` and `end` say where the timeline now stands; behind it `frames` is empty.
  | {
      kind: 'observed';
      reqId: number;
      fact: WatchedFact;
      frames: FramesPatch;
      edge: number;
      end: RecomputeResult['end'];
    }
  | { kind: 'history'; reqId: number; state: SimState; events: SimEvent[] }
  | { kind: 'inspected'; reqId: number; view: InspectView }
  | { kind: 'error'; reqId: number; message: string };

/** What the dev inspector shows at one tick of one history. Plain data; floats never occur. */
export interface InspectView {
  tick: number;
  lastTick: number;
  clock: string; // HH:MM
  end: { kind: 'anchor' | 'dead'; tick: number; clock: string };
  weather: 'dry' | 'rain';
  cats: {
    id: CatId;
    pos: [number, number];
    node: string;
    activity: string;
    place: string | null;
    control: string;
    interrupt: string | null;
    route: string[];
    hooks: [string, number][]; // gauge values, hooks only
  }[];
  storylets: { id: string; state: string; ended: boolean; roles: string }[];
  facts: string[];
  flags: string[];
  counters: [string, number][];
  closedEdges: string[];
  effects: { kind: string; place: string; radiusM: number; left: number; source: string }[];
  events: string[]; // trace lines of the ticks before this one (what led to this state), oldest first
}
