// The world view (06 §2): the canvas, the animation loop that drives the shuttle and the renderer, the
// follow toggle. Floats live here and in src/render only.
import { createSignal, onSettled } from 'solid-js';
import { createGrayboxRenderer, type Bubble, type SceneView } from '../render';
import type { Game } from './game';

export interface WorldProps {
  game: Game;
  seed: number;
  labels: () => Readonly<Record<string, string>>;
  text: (key: string) => string;
  followName: () => string;
  focusLayer: boolean;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

export function World(props: WorldProps) {
  let canvas: HTMLCanvasElement | undefined;
  const [follow, setFollow] = createSignal(true);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let revealed: { list: readonly string[]; set: ReadonlySet<string> } = {
    list: [],
    set: new Set(),
  };

  const viewAt = (now: number): SceneView | null => {
    const { player, view, frac } = props.game.now();
    const tick = player.playhead;
    const frame = view.frames[tick];
    if (!frame) return null;
    const next = view.frames[tick + 1] ?? null;
    if (revealed.list !== player.revealed)
      revealed = { list: player.revealed, set: new Set(player.revealed) };
    const lanterns = frame.lanterns.map((l) => {
      const g = frame.cats[l.cat]?.[0];
      const h = next?.cats[l.cat]?.[0];
      const x = g ? (h ? lerp(g.pos[0], h.pos[0], frac) : g.pos[0]) : 0;
      const z = g ? (h ? lerp(g.pos[1], h.pos[1], frac) : g.pos[1]) : 0;
      return { cat: l.cat, pos: [x, z] as [number, number], sightM: l.rangeMm / 1000 };
    });
    const bubbles: Bubble[] = props.game
      .lines(now)
      .map((l) => ({ cat: l.cat, node: l.node, text: props.text(l.text) }));
    return {
      tick,
      frac,
      frame,
      next,
      samples: view.samples[tick] ?? null,
      nextSamples: view.samples[tick + 1] ?? null,
      lanterns,
      revealed: revealed.set,
      held: null,
      previousPath: null,
      settings: {
        focusLayer: props.focusLayer,
        assist: props.game.content.tuning.flags.assist,
        reducedMotion: motionQuery.matches,
      },
      bubbles,
      labels: props.labels(),
      follow: follow() ? (player.followed[0] ?? null) : null,
    };
  };

  onSettled(() => {
    const el = canvas;
    if (!el) return;
    const renderer = createGrayboxRenderer(props.game.content, {
      onPan: () => setFollow(false),
      seed: props.seed,
    });
    renderer.mount(el);
    const resize = () => renderer.resize(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      props.game.frame(dt, now);
      const v = viewAt(now);
      if (v) renderer.render(v, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
    };
  });

  return (
    <div class="world-view">
      <canvas ref={(e) => (canvas = e)} data-testid="scene" />
      <button
        type="button"
        class="follow"
        data-testid="follow"
        aria-pressed={follow() ? 'true' : 'false'}
        onClick={() => setFollow(!follow())}
      >
        {props.followName()}
      </button>
    </div>
  );
}
