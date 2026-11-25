// The graybox world view (06 §2): one orthographic three.js scene in the final 3/4 camera. Places as
// boxes, edges as paths, fog over unrevealed places, cats as cut-out billboards with ghosts, the
// lantern, the focus layer, objects, rain, barriers, running lures, Gaze rings, speech bubbles. Pan,
// zoom and follow. It draws what the view says and decides nothing.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OctahedronGeometry,
  OrthographicCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type CanvasTexture,
} from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Content } from '../../content/schemas/content';
import type { CatId, Ghost, NodeId } from '../../sim/types';
import type { Pick, SceneRenderer, SceneView } from '../SceneRenderer';
import { catTexture, rainTexture, softDisc, stripeTexture } from './textures';

const PPM = 1_000_000;
const PITCH = (55 * Math.PI) / 180; // camera elevation above the ground
const VIEW_M = 60; // metres shown top to bottom at zoom 1
const ZOOM = { min: 0.4, max: 5 };
const CAT_PX = 34; // cat billboard height on screen
const MAX_PER_PLACE = 4; // cat markers at one place before the rest join its cluster
const FOCUS_FADE_MS = 250;
const MAX_BUBBLES = 3; // lines shown at once over one cat or place
const LABELS_FROM_ZOOM = 0.75; // place names pile up when zoomed further out

/** A render-only seeded generator (06 §2: never Math.random, never the simulation's rand). */
function renderRandom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

interface Marker {
  cat: CatId;
  x: number;
  z: number;
  node: NodeId;
  opacity: number;
  solid: boolean;
  focus: boolean;
  score: number;
}

export interface GrayboxOptions {
  /** The player dragged the camera: the UI turns "follow" off. */
  onPan: () => void;
  /** Seeds the focus layer's render-only generator. */
  seed: number;
}

export function createGrayboxRenderer(c: Content, opts: GrayboxOptions): SceneRenderer {
  const scene = new Scene();
  scene.background = new Color('#14161a');
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  const target = new Vector3(3, 0, 6);
  let zoom = 0.9;
  let canvasEl: HTMLCanvasElement | null = null;
  let gl: WebGLRenderer | null = null;
  const css = new CSS2DRenderer();
  let size = { w: 1, h: 1 };
  let time = 0;
  const random = renderRandom(opts.seed);
  const disc = softDisc();
  const rain = rainTexture();
  const stripes = stripeTexture();

  // --- places, edges, fog, labels ---------------------------------------------------------------
  const placeSize = (id: NodeId) => (c.node[id]?.region === 'flat' ? 3 : 5);
  const baseColour = (id: NodeId): Color => {
    const n = c.node[id];
    if (!n) return new Color('#444');
    if (n.tags.includes('shore')) return new Color('#a8956a');
    if (n.indoor) return new Color('#5d4b3b');
    return new Color('#47524a');
  };
  const places: Record<NodeId, { mesh: Mesh<BoxGeometry, MeshBasicMaterial>; base: Color }> = {};
  const fog: Record<NodeId, Mesh> = {};
  const labels: Record<string, CSS2DObject> = {};
  const fogMat = new MeshBasicMaterial({ color: '#1e2127' });
  for (const n of c.nodes) {
    const s = placeSize(n.id);
    const mesh = new Mesh(
      new BoxGeometry(s, 0.4, s),
      new MeshBasicMaterial({ color: baseColour(n.id) }),
    );
    mesh.position.set(n.pos[0], 0.2, n.pos[1]);
    mesh.userData = { pick: { kind: 'place', id: n.id } satisfies Pick };
    scene.add(mesh);
    places[n.id] = { mesh, base: baseColour(n.id) };
    const f = new Mesh(new BoxGeometry(s + 0.6, 0.5, s + 0.6), fogMat);
    f.position.set(n.pos[0], 0.3, n.pos[1]);
    f.renderOrder = 1;
    scene.add(f);
    fog[n.id] = f;
    const label = cssLabel('scene-label');
    label.position.set(n.pos[0], 0.5, n.pos[1] + s / 2 + 0.6);
    scene.add(label);
    labels[`node:${n.id}`] = label;
  }
  const edges: Record<string, Mesh<BoxGeometry, MeshBasicMaterial>> = {};
  const barriers: Record<string, Mesh<BoxGeometry, MeshBasicMaterial>> = {};
  for (const e of c.edges) {
    const a = c.node[e.a]?.pos;
    const b = c.node[e.b]?.pos;
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const mesh = new Mesh(
      new BoxGeometry(len, 0.08, e.door ? 1.2 : 0.8),
      new MeshBasicMaterial({ color: e.door ? '#6c6455' : '#343840' }),
    );
    mesh.position.set((a[0] + b[0]) / 2, 0.04, (a[1] + b[1]) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    scene.add(mesh);
    edges[e.id] = mesh;
    if (e.when) {
      const bar = new Mesh(
        new BoxGeometry(0.4, 1, 3),
        new MeshBasicMaterial({ map: stripes, transparent: true, opacity: 0 }),
      );
      bar.position.set((a[0] + b[0]) / 2, 0.5, (a[1] + b[1]) / 2);
      bar.rotation.y = -Math.atan2(dz, dx);
      bar.renderOrder = 3;
      scene.add(bar);
      barriers[e.id] = bar;
    }
  }

  // --- objects ------------------------------------------------------------------------------------
  const objects: Record<string, Mesh<OctahedronGeometry, MeshBasicMaterial>> = {};
  const perNode: Record<NodeId, number> = {};
  for (const o of c.objects) {
    const i = (perNode[o.node] = (perNode[o.node] ?? 0) + 1) - 1;
    const p = c.node[o.node]?.pos ?? [0, 0];
    const r = placeSize(o.node) * 0.32;
    const a = (i * 2 * Math.PI) / 5 + 0.6;
    const mesh = new Mesh(
      new OctahedronGeometry(0.4),
      new MeshBasicMaterial({ color: '#e8c66a', transparent: true }),
    );
    mesh.position.set(p[0] + r * Math.cos(a), 0.9, p[1] + r * Math.sin(a));
    mesh.userData = { pick: { kind: 'object', id: o.id } satisfies Pick };
    mesh.renderOrder = 2;
    scene.add(mesh);
    objects[o.id] = mesh;
  }

  // --- rain over outdoor places ---------------------------------------------------------------------
  const rainMat = new MeshBasicMaterial({
    map: rain,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rainOver: Record<NodeId, Mesh> = {};
  for (const n of c.nodes) {
    if (n.indoor) continue;
    const s = placeSize(n.id) + 2;
    const m = new Mesh(new PlaneGeometry(s, s), rainMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(n.pos[0], 0.6, n.pos[1]);
    m.renderOrder = 4;
    scene.add(m);
    rainOver[n.id] = m;
  }
  // the camera stays over the map: its target within the places' bounds, a margin around them
  const xs = c.nodes.map((n) => n.pos[0]);
  const zs = c.nodes.map((n) => n.pos[1]);
  const bounds = {
    x0: Math.min(...xs) - 10,
    x1: Math.max(...xs) + 10,
    z0: Math.min(...zs) - 10,
    z1: Math.max(...zs) + 10,
  };

  // --- lantern, pools ------------------------------------------------------------------------------
  const lantern = new Mesh(
    new CircleGeometry(1, 48),
    new MeshBasicMaterial({
      map: disc,
      color: '#ffe7a8',
      transparent: true,
      opacity: 0.07,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  lantern.rotation.x = -Math.PI / 2;
  lantern.renderOrder = 5;
  scene.add(lantern);

  const textures: Record<CatId, CanvasTexture> = {};
  for (const def of c.cats) textures[def.id] = catTexture(def.look);
  const glowTexture = catTexture({ fur: '#fff3c4', accent: '#ffffff' });

  const sprites: Sprite[] = [];
  const spriteAt = (i: number): Sprite => {
    let s = sprites[i];
    if (!s) {
      s = new Sprite(new SpriteMaterial({ transparent: true, depthTest: false }));
      s.center.set(0.5, 0);
      s.renderOrder = 10;
      scene.add(s);
      sprites.push(s);
    }
    s.visible = true;
    return s;
  };
  const rings: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  const ringAt = (i: number, radius: number, colour: string, opacity: number) => {
    let r = rings[i];
    if (!r) {
      r = new Mesh(new RingGeometry(0.92, 1, 64), new MeshBasicMaterial({ transparent: true }));
      r.rotation.x = -Math.PI / 2;
      r.renderOrder = 6;
      scene.add(r);
      rings.push(r);
    }
    r.visible = true;
    r.scale.setScalar(radius);
    r.material.color.set(colour);
    r.material.opacity = opacity;
    return r;
  };
  const cssPool: Record<string, CSS2DObject[]> = { cluster: [], bubble: [], name: [] };
  const cssAt = (kind: string, i: number): CSS2DObject => {
    const pool = cssPool[kind] ?? [];
    let o = pool[i];
    if (!o) {
      o = cssLabel(`scene-${kind}`);
      scene.add(o);
      pool.push(o);
      cssPool[kind] = pool;
    }
    o.visible = true;
    return o;
  };
  const path = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({ color: '#c9d4ff', transparent: true, opacity: 0.45 }),
  );
  path.renderOrder = 7;
  scene.add(path);

  // --- the focus layer's trajectory choice ----------------------------------------------------------
  const focus = { k: 0, prev: -1, since: 0, last: -Infinity };

  // --- camera ---------------------------------------------------------------------------------------
  const wpp = () => VIEW_M / zoom / size.h; // world metres per screen pixel, vertically
  function placeCamera() {
    target.x = Math.min(bounds.x1, Math.max(bounds.x0, target.x));
    target.z = Math.min(bounds.z1, Math.max(bounds.z0, target.z));
    const halfH = VIEW_M / 2 / zoom;
    const halfW = halfH * (size.w / size.h);
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    camera.position.set(target.x, 100 * Math.sin(PITCH), target.z + 100 * Math.cos(PITCH));
    camera.lookAt(target);
    if (canvasEl)
      canvasEl.dataset['camera'] =
        `${target.x.toFixed(1)},${target.z.toFixed(1)},${zoom.toFixed(2)}`;
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const before = pointers.get(e.pointerId);
    if (!before) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      if (!p || !q) return;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (pinch > 0) zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, (zoom * d) / pinch));
      pinch = d;
      placeCamera();
      return;
    }
    const dx = e.clientX - before.x;
    const dy = e.clientY - before.y;
    if (dx === 0 && dy === 0) return;
    target.x -= dx * wpp();
    target.z -= (dy * wpp()) / Math.sin(PITCH);
    placeCamera();
    opts.onPan();
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom * Math.exp(-e.deltaY * 0.0015)));
    placeCamera();
  };

  // --- one frame ------------------------------------------------------------------------------------
  function markersOf(view: SceneView): { shown: Marker[]; folded: Record<NodeId, Set<CatId>> } {
    const { frame, next, frac } = view;
    const lit = view.lanterns.map((l) => ({ ...l, r2: l.sightM * l.sightM }));
    const inLantern = (x: number, z: number) =>
      lit.some((l) => (l.pos[0] - x) ** 2 + (l.pos[1] - z) ** 2 <= l.r2);
    const held = new Set(view.held?.cats ?? []);
    const all: Marker[] = [];
    for (const def of c.cats) {
      const ghosts = frame.cats[def.id] ?? [];
      const solo = ghosts.length === 1 && ghosts[0]?.p === PPM;
      for (const g of ghosts) {
        let [x, z] = g.pos;
        const after = next?.cats[def.id];
        if (solo && after?.length === 1 && after[0]) {
          x = lerp(x, after[0].pos[0], frac);
          z = lerp(z, after[0].pos[1], frac);
        }
        const protagonist = lit.some((l) => l.cat === def.id);
        const d = Math.hypot(x - target.x, z - target.z);
        const score = protagonist
          ? 4 * PPM
          : inLantern(x, z) && solo
            ? 3 * PPM
            : held.has(def.id)
              ? 2 * PPM + g.p
              : g.p / (1 + d / 30);
        all.push({
          cat: def.id,
          x,
          z,
          node: g.node,
          opacity: solo ? 1 : Math.max(0.1, g.p / PPM),
          solid: solo,
          focus: false,
          score,
        });
      }
    }
    all.sort((a, b) => b.score - a.score);
    const shown: Marker[] = [];
    const folded: Record<NodeId, Set<CatId>> = {};
    const atPlace: Record<NodeId, Set<CatId>> = {};
    const budget = c.tuning.render.displayBudget;
    for (const m of all) {
      const here = (atPlace[m.node] ??= new Set());
      const crowded = !here.has(m.cat) && here.size >= MAX_PER_PLACE && m.score < 3 * PPM;
      if (shown.length < budget && !crowded) {
        shown.push(m);
        here.add(m.cat);
      } else (folded[m.node] ??= new Set()).add(m.cat);
    }
    for (const [node, cats] of Object.entries(folded))
      for (const cat of atPlace[node] ?? []) cats.delete(cat);
    return { shown, folded };
  }

  /** The focus layer: trajectory k's ghost of each fogged cat, moving toward its next one. */
  function focusMarkers(view: SceneView, k: number, alpha: number): Marker[] {
    const s = view.samples;
    if (!s || alpha <= 0) return [];
    const out: Marker[] = [];
    for (const def of c.cats) {
      const i = s.cats[def.id]?.[k];
      const g: Ghost | undefined = i === undefined ? undefined : view.frame.cats[def.id]?.[i];
      if (!g) continue;
      const j = view.nextSamples?.cats[def.id]?.[k];
      const h = j === undefined ? undefined : view.next?.cats[def.id]?.[j];
      const x = h ? lerp(g.pos[0], h.pos[0], view.frac) : g.pos[0];
      const z = h ? lerp(g.pos[1], h.pos[1], view.frac) : g.pos[1];
      out.push({
        cat: def.id,
        x,
        z,
        node: g.node,
        opacity: 0.55 * alpha,
        solid: false,
        focus: true,
        score: 0,
      });
    }
    return out;
  }

  function render(view: SceneView, dtMs: number) {
    if (!gl) return;
    const motion = !view.settings.reducedMotion;
    time += dtMs / 1000;
    const revealed = view.revealed;
    const seen = new Set(view.frame.lanterns.flatMap((l) => l.seen));

    // follow
    const followed = view.lanterns.find((l) => l.cat === view.follow);
    if (followed) {
      const k = Math.min(1, dtMs / 250);
      target.x = lerp(target.x, followed.pos[0], k);
      target.z = lerp(target.z, followed.pos[1], k);
    }
    placeCamera();

    // places, fog, labels
    for (const n of c.nodes) {
      const p = places[n.id];
      const open = revealed.has(n.id);
      if (p)
        p.mesh.material.color.copy(p.base).lerp(new Color('#ffffff'), seen.has(n.id) ? 0.18 : 0);
      const f = fog[n.id];
      if (f) f.visible = !open;
      const r = rainOver[n.id];
      if (r) r.visible = open;
      const label = labels[`node:${n.id}`];
      if (label) {
        label.visible = open && zoom >= LABELS_FROM_ZOOM;
        const text = view.labels[`node:${n.id}`] ?? n.id;
        if (label.element.textContent !== text) label.element.textContent = text;
      }
    }
    for (const e of c.edges) {
      const m = edges[e.id];
      if (m) m.visible = revealed.has(e.a) || revealed.has(e.b);
      const bar = barriers[e.id];
      if (bar) {
        const p = (view.frame.closed[e.id] ?? 0) / PPM;
        bar.visible = p > 0 && (revealed.has(e.a) || revealed.has(e.b));
        bar.material.opacity = p;
      }
    }
    for (const o of c.objects) {
      const m = objects[o.id];
      if (!m) continue;
      const p = (view.frame.visible[o.id] ?? PPM) / PPM;
      m.visible = revealed.has(o.node) && p > 0;
      m.material.opacity = p;
      m.scale.setScalar(motion ? 1 + 0.12 * Math.sin(time * 2.4) : 1);
      m.rotation.y = motion ? time * 0.6 : 0;
    }
    rainMat.opacity = 0.55 * (view.frame.rain / PPM);
    if (motion) rain.offset.set(time * 0.4, time * 1.6);

    // the lantern
    const l = view.lanterns[0];
    lantern.visible = l !== undefined;
    if (l) {
      lantern.position.set(l.pos[0], 0.45, l.pos[1]);
      lantern.scale.setScalar(Math.max(1, l.sightM));
    }

    // cats: markers within the display budget, clusters, the focus layer
    const { shown, folded } = markersOf(view);
    let focusOn = view.settings.focusLayer && motion && view.samples !== null;
    const K = c.tuning.render.focusSamples;
    if (focusOn) {
      const period = 1 / Math.min(3, c.tuning.render.focusLayerHz);
      if (time - focus.last >= period) {
        focus.prev = focus.k;
        focus.k = Math.floor(random() * K);
        focus.since = time;
        focus.last = time;
      }
    }
    const fade = Math.min(1, ((time - focus.since) * 1000) / FOCUS_FADE_MS);
    const focusMarks = focusOn
      ? [...focusMarkers(view, focus.prev, 1 - fade), ...focusMarkers(view, focus.k, fade)]
      : [];
    if (focusMarks.length === 0) focusOn = false;
    const marks = [...shown, ...focusMarks];
    // spread markers on the same spot on a small ring
    const spots: Record<string, Marker[]> = {};
    for (const m of shown) (spots[`${Math.round(m.x)},${Math.round(m.z)}`] ??= []).push(m);
    const h = CAT_PX * wpp();
    let si = 0;
    for (const m of marks) {
      const sprite = spriteAt(si++);
      const mat = sprite.material;
      mat.map = textures[m.cat] ?? null;
      mat.blending = m.solid || m.focus ? NormalBlending : AdditiveBlending;
      const shimmer = !m.solid && !m.focus && motion ? 0.85 + 0.15 * Math.sin(time * 3 + si) : 1;
      mat.opacity = m.opacity * shimmer;
      mat.needsUpdate = true;
      const group = m.focus ? undefined : spots[`${Math.round(m.x)},${Math.round(m.z)}`];
      let ox = 0;
      if (group && group.length > 1) {
        const i = group.indexOf(m);
        ox = (i - (group.length - 1) / 2) * h * 0.75;
      }
      sprite.position.set(m.x + ox, 0.45, m.z);
      sprite.scale.set(h * 0.8, h, 1);
      sprite.userData = { pick: { kind: 'cat', id: m.cat } satisfies Pick };
    }
    // running effects: a power's glowing cat, a card's faint ring; Gaze rings
    let ri = 0;
    for (const fx of view.frame.effects) {
      const p = c.node[fx.place]?.pos;
      if (!p) continue;
      if ('power' in fx.source) {
        const sprite = spriteAt(si++);
        sprite.material.map = glowTexture;
        sprite.material.blending = AdditiveBlending;
        sprite.material.opacity = 0.75 + (motion ? 0.25 * Math.sin(time * 4) : 0);
        sprite.material.needsUpdate = true;
        sprite.position.set(p[0], 0.5, p[1] - 1);
        sprite.scale.set(h, h * 1.25, 1);
        sprite.userData = {};
        ringAt(ri++, fx.radiusM, '#ffe7a8', 0.25).position.set(p[0], 0.5, p[1]);
      } else ringAt(ri++, fx.radiusM, '#f2c230', 0.2).position.set(p[0], 0.5, p[1]);
    }
    for (const g of view.frame.gazes) {
      const p = c.node[g.place]?.pos;
      if (p) ringAt(ri++, g.radiusM, '#7fd6ff', 0.6).position.set(p[0], 0.55, p[1]);
    }
    for (let i = si; i < sprites.length; i++) {
      const s = sprites[i];
      if (s) s.visible = false;
    }
    for (let i = ri; i < rings.length; i++) {
      const r = rings[i];
      if (r) r.visible = false;
    }

    // clusters, protagonists' names, bubbles
    let ci = 0;
    for (const [node, cats] of Object.entries(folded)) {
      if (cats.size === 0) continue;
      const p = c.node[node]?.pos;
      if (!p) continue;
      const o = cssAt('cluster', ci++);
      o.element.textContent = `+${cats.size}`;
      o.position.set(p[0] + placeSize(node) / 2, 0.6, p[1] - placeSize(node) / 2);
    }
    hideFrom('cluster', ci);
    let ni = 0;
    for (const lt of view.lanterns) {
      const o = cssAt('name', ni++);
      o.element.textContent = view.labels[`cat:${lt.cat}`] ?? lt.cat;
      o.position.set(lt.pos[0], 0.2, lt.pos[1] + 0.8);
    }
    hideFrom('name', ni);
    // bubbles over one cat (or place) form one stack, newest at the bottom, the last few only
    const stacks: { key: string; x: number; z: number; texts: string[] }[] = [];
    for (const b of view.bubbles) {
      const m = b.cat ? shown.find((x) => x.cat === b.cat) : undefined;
      const likely = b.cat ? view.frame.cats[b.cat]?.[0]?.pos : undefined; // a fogged cat's likeliest
      const p = m ? [m.x, m.z] : (likely ?? c.node[b.node]?.pos);
      if (!p) continue;
      const key = b.cat ? `cat:${b.cat}` : `node:${b.node}`;
      let st = stacks.find((x) => x.key === key);
      if (!st) stacks.push((st = { key, x: p[0] ?? 0, z: p[1] ?? 0, texts: [] }));
      st.texts.push(b.text);
    }
    let bi = 0;
    for (const st of stacks) {
      const o = cssAt('bubble', bi++);
      const texts = st.texts.slice(-MAX_BUBBLES);
      const joined = texts.join('|');
      if (o.element.dataset['texts'] !== joined) {
        o.element.dataset['texts'] = joined;
        o.element.replaceChildren(
          ...texts.map((text) => {
            const el = document.createElement('div');
            el.className = 'bubble';
            el.textContent = text;
            return el;
          }),
        );
      }
      o.position.set(st.x, 0.45 + h * 1.15, st.z);
    }
    hideFrom('bubble', bi);

    // the previous path (06 §6)
    path.visible = view.previousPath !== null;
    if (view.previousPath)
      path.geometry.setFromPoints(view.previousPath.map(([x, z]) => new Vector3(x, 0.5, z)));

    if (canvasEl) {
      canvasEl.dataset['tick'] = String(view.tick);
      canvasEl.dataset['focus'] = focusOn ? String(focus.k) : 'off';
      canvasEl.dataset['pulse'] = motion ? 'on' : 'off';
    }
    gl.render(scene, camera);
    css.render(scene, camera);
  }

  function hideFrom(kind: string, i: number) {
    for (const o of (cssPool[kind] ?? []).slice(i)) o.visible = false;
  }

  const raycaster = new Raycaster();
  return {
    mount(canvas) {
      canvasEl = canvas;
      gl = new WebGLRenderer({ canvas, antialias: true });
      gl.setPixelRatio(Math.min(2, window.devicePixelRatio));
      const layer = css.domElement;
      layer.className = 'scene-css';
      canvas.parentElement?.appendChild(layer);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      placeCamera();
    },
    render,
    pick(x, y) {
      if (!canvasEl) return null;
      const rect = canvasEl.getBoundingClientRect();
      const ndc = new Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        -((y - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(
        [
          ...sprites.filter((s) => s.visible),
          ...Object.values(objects),
          ...Object.values(places).map((p) => p.mesh),
        ],
        false,
      );
      for (const h of hits) {
        const p = h.object.userData['pick'] as Pick | undefined;
        if (p) return p;
      }
      return null;
    },
    resize(width, height) {
      size = { w: Math.max(1, width), h: Math.max(1, height) };
      gl?.setSize(size.w, size.h, false);
      css.setSize(size.w, size.h);
      placeCamera();
    },
    dispose() {
      if (canvasEl) {
        canvasEl.removeEventListener('pointerdown', onDown);
        canvasEl.removeEventListener('pointermove', onMove);
        canvasEl.removeEventListener('pointerup', onUp);
        canvasEl.removeEventListener('pointercancel', onUp);
        canvasEl.removeEventListener('wheel', onWheel);
      }
      css.domElement.remove();
      gl?.dispose();
      gl = null;
    },
  };
}

function cssLabel(className: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = className;
  return new CSS2DObject(el);
}
