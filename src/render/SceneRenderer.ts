// The renderer interface (02 §4): what the world view gets every animation frame. Everything the
// dressed build replaces sits behind it. Floats live here and in src/ui only.
import type { CatId, Frame, NodeId, ObjectId, TickSamples } from '../sim/types';

/** Valid targets while a card or power is held (M6); null in the viewer. */
export interface Highlight {
  cats: CatId[];
  objects: ObjectId[];
  places: NodeId[];
}

/** What is under a screen point. It never decides a game rule. */
export type Pick =
  { kind: 'cat'; id: CatId } | { kind: 'object'; id: ObjectId } | { kind: 'place'; id: NodeId };

/** A speech bubble (06 §2): over a cat, or over a place when no cat holds the line. */
export interface Bubble {
  cat: CatId | null;
  node: NodeId;
  text: string;
}

export interface SceneView {
  tick: number; // integer tick at the playhead
  frac: number; // 0..1 inside the tick (presentation only)
  frame: Frame; // 03 §16, at tick
  next: Frame | null; // at tick + 1, for interpolation
  /** The focus layer's samples at tick and tick + 1 (03 §16), null where none have arrived. */
  samples: TickSamples | null;
  nextSamples: TickSamples | null;
  lanterns: { cat: CatId; pos: [number, number]; sightM: number }[];
  revealed: ReadonlySet<NodeId>;
  held: Highlight | null;
  previousPath: [number, number][] | null; // after an edit (06 §6)
  settings: { focusLayer: boolean; assist: boolean; reducedMotion: boolean };
  /** Speech bubbles at the playhead, their text already through t(). */
  bubbles: Bubble[];
  /** Display text by `node:<id>` and `cat:<id>`, already through t(). */
  labels: Readonly<Record<string, string>>;
  /** The cat the camera follows, or null when the player has panned away. */
  follow: CatId | null;
}

export interface SceneRenderer {
  mount(canvas: HTMLCanvasElement): void;
  render(view: SceneView, dtMs: number): void;
  pick(x: number, y: number): Pick | null;
  resize(width: number, height: number): void;
  dispose(): void;
}
