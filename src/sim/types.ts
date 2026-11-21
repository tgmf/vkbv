// Simulation types. M0 holds only what the bridge protocol names (spec 02 §3).
// Pin and WatchedFact follow spec 03 §11 and §15.2. SimState, SimEvent, RecomputeResult and
// FramesPatch are placeholders here: M1 and M2 complete them from spec 03 §5, §16 and §17.

export type CatId = string;
export type NodeId = string;
export type ObjectId = string;
export type CardId = string;
export type PowerId = string;
export type PinId = string;

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

export interface WatchedFact {
  tick: number;
  cat: CatId;
  digest: number;
  summary: Record<string, unknown>; // shape fixed in M2 (spec 03 §15.2 step 5)
}

/** Placeholder until M1 (spec 03 §5). */
export interface SimState {
  tick: number;
}

/** Placeholder until M1 (spec 03 §5, §6). */
export interface SimEvent {
  tick: number;
  type: string;
}

/** Placeholder until M2 (spec 03 §16). */
export type FramesPatch = Record<string, unknown>;

/** Placeholder until M2 (spec 03 §17). */
export interface RecomputeResult {
  end: { kind: 'anchor' | 'fray' | 'chapterEnd'; tick: number };
}
