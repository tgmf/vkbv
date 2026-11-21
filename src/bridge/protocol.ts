// The single source of truth for every message between the main thread and the worker (spec 02 §3).
import type { Tuning } from '../content/schemas/tuning';
import type {
  CatId,
  FramesPatch,
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
      preview: boolean;
    }
  | { kind: 'commit'; reqId: number } // make a preview the current wave
  | { kind: 'observe'; reqId: number; tick: number; cat: CatId }
  | { kind: 'debugHistory'; reqId: number; tick: number; index: number }
  // Dev inspector (docs/milestones/M1.5-inspector.md): one history, viewed one tick at a time.
  | { kind: 'inspect'; reqId: number; seed: number; stream: number; pinset: string; tick: number };

export type WorkerToMain =
  | { kind: 'ready'; reqId: number }
  | { kind: 'vetted'; reqId: number; seed: number }
  | { kind: 'result'; reqId: number; result: RecomputeResult }
  | { kind: 'observed'; reqId: number; fact: WatchedFact; frames: FramesPatch }
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
