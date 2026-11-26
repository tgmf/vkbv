// The renderer interface (02 §4): what the world view gets every animation frame. Everything the
// dressed build replaces sits behind it. Floats live here and in src/ui only.
import type { CatId, Frame, NodeId, ObjectId, TickSamples } from '../sim/types';

/** Valid targets while a card or power is held (06 §4), as src/player computed them. */
export interface Highlight {
  cats: CatId[];
  objects: ObjectId[];
  places: NodeId[];
  /** The target keyboard focus is on (06 §8), drawn with a focus ring. */
  focus: Pick | null;
  /** A ring of this radius in metres under the pointer: Gaze's circle (06 §5). */
  ring: number | null;
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

/**
 * A story marker of assist mode (06 §2, M8), as src/player computed it: on a cat, pulsing for a share
 * `p` (ppm) of each cycle, with the interactable objects at its place marked with it and a ring when
 * the held card could advance it. `key` seeds its cycle (render only).
 */
export interface AssistMarker {
  key: string;
  cat: CatId;
  p: number;
  ring: boolean;
  objects: ObjectId[];
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
  /**
   * Added in M6: the pointer over the canvas in CSS pixels from its top left, or null. While something
   * is held the magnifying ring (and Gaze's ring) sits there (06 §4, §5).
   */
  pointer: [number, number] | null;
  /** Added in M8: assist mode's story markers (empty with assist mode off). */
  assist: AssistMarker[];
}

export interface SceneRenderer {
  mount(canvas: HTMLCanvasElement): void;
  render(view: SceneView, dtMs: number): void;
  /** What is under a screen point; while something is held, a highlighted hit before any other. */
  pick(x: number, y: number): Pick | null;
  /** Where a cat, object or place was last drawn, in CSS pixels from the canvas's top left (M6). */
  screenOf(target: Pick): [number, number] | null;
  resize(width: number, height: number): void;
  dispose(): void;
}
