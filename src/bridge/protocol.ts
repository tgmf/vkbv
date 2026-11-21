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
  | { kind: 'debugHistory'; reqId: number; tick: number; index: number };

export type WorkerToMain =
  | { kind: 'ready'; reqId: number }
  | { kind: 'vetted'; reqId: number; seed: number }
  | { kind: 'result'; reqId: number; result: RecomputeResult }
  | { kind: 'observed'; reqId: number; fact: WatchedFact; frames: FramesPatch }
  | { kind: 'history'; reqId: number; state: SimState; events: SimEvent[] }
  | { kind: 'error'; reqId: number; message: string };
