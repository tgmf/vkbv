// What the world view shares with the hand and the target list: the renderer once mounted (to pick what
// is under a point and to say where a target was drawn), and targets' screen positions, refreshed a few
// times a second, which the accessible target list carries for browser tests (02 §4).
import { createSignal, type Accessor } from 'solid-js';
import type { Target } from '../player/actions';
import type { Pick, SceneRenderer } from '../render';

export interface SceneHandle {
  renderer: SceneRenderer | null;
  canvas: HTMLCanvasElement | null;
  /** The pointer in client pixels while a card is dragged from the hand (the canvas has no hover then). */
  drag: [number, number] | null;
  positions: Accessor<Readonly<Record<string, [number, number]>>>;
  setPositions: (p: Record<string, [number, number]>) => void;
}

export function createSceneHandle(): SceneHandle {
  const [positions, setPositions] = createSignal<Readonly<Record<string, [number, number]>>>({});
  return { renderer: null, canvas: null, drag: null, positions, setPositions };
}

export const toTarget = (p: Pick): Target =>
  p.kind === 'cat' ? { cat: p.id } : p.kind === 'object' ? { object: p.id } : { place: p.id };

export const toPick = (t: Target): Pick =>
  'cat' in t
    ? { kind: 'cat', id: t.cat }
    : 'object' in t
      ? { kind: 'object', id: t.object }
      : { kind: 'place', id: t.place };

/** The key a target's screen position is kept under: `cat-…`, `object-…`, `place-…` (its test id). */
export const targetKey = (t: Target): string =>
  'cat' in t ? `cat-${t.cat}` : 'object' in t ? `object-${t.object}` : `place-${t.place}`;

/** What is under a client point of the canvas, as a target. */
export function pickAt(h: SceneHandle, x: number, y: number): Target | null {
  const p = h.renderer?.pick(x, y);
  return p ? toTarget(p) : null;
}

/** Whether a client point is over the canvas. */
export function overCanvas(h: SceneHandle, x: number, y: number): boolean {
  const r = h.canvas?.getBoundingClientRect();
  return r !== undefined && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
