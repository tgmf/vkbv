// The teaser (06 §9): the anchor shown before the day starts, as a composition of the scene's own shapes.
// The anchor storylet's named cats stand at the place its trigger names (Chapter 1: Marti and Rokko by the
// upturned boat), in the rain. It is a presentation frame built here: it is never sent to the
// simulation and collapses nothing.
import type { Frame } from '../bridge/protocol';
import type { Content } from '../content/schemas/content';
import type { SceneView } from '../render';

const SIGHT_M = 14; // the crisp circle around the two cats
const APART_M = 4; // the two silhouettes stand this far apart

/** The anchor storylet's place and its cats, read from the content. */
export function anchorScene(c: Content): { node: string; cats: string[] } | null {
  const s = c.storylets.find((x) => x.anchor);
  if (!s) return null;
  const cats = Object.values(s.roles).flatMap((r) => ('cat' in r ? [r.cat] : []));
  let node: string | null = null;
  const walk = (v: unknown): void => {
    if (node || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    const near = (v as { near?: unknown }).near;
    if (Array.isArray(near))
      for (const x of near) if (typeof x === 'string' && c.node[x] && !node) node = x;
    Object.values(v).forEach(walk);
  };
  walk(s.trigger);
  return node && cats.length > 0 ? { node, cats } : null;
}

/** The teaser's scene view, or null when the content names no anchor place. */
export function teaserView(
  c: Content,
  labels: Readonly<Record<string, string>>,
  reducedMotion: boolean,
): SceneView | null {
  const scene = anchorScene(c);
  const at = scene && c.node[scene.node];
  if (!scene || !at) return null;
  const [x, z] = at.pos;
  const cats: Frame['cats'] = {};
  scene.cats.forEach((cat, i) => {
    const pos: [number, number] = [x + (i - (scene.cats.length - 1) / 2) * APART_M, z];
    cats[cat] = [{ node: scene.node, pos, activity: 'none', interrupt: null, p: 1_000_000 }];
  });
  const first = scene.cats[0] ?? '';
  const frame: Frame = {
    tick: 0,
    cats,
    happens: {},
    rain: 1_000_000,
    requirements: [],
    progress: 0,
    visible: {},
    powers: [],
    closed: {},
    effects: [],
    gazes: [],
    lanterns: [{ cat: first, rangeMm: SIGHT_M * 1000, seen: [scene.node] }],
    lines: [],
    pins: {},
    forming: [],
  };
  return {
    tick: 0,
    frac: 0,
    frame,
    next: null,
    samples: null,
    nextSamples: null,
    lanterns: [{ cat: first, pos: [x, z], sightM: SIGHT_M }],
    revealed: new Set([scene.node]),
    held: null,
    previousPath: null,
    settings: { focusLayer: false, assist: false, reducedMotion },
    bubbles: [],
    labels,
    follow: first,
    pointer: null,
  };
}
