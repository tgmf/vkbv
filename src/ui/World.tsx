// The world view (06 §2): the canvas, the animation loop that drives the shuttle and the renderer, the
// follow toggle. M6: the held card's or power's targets, clicks and taps that pin or inspect, Gaze's
// ring under the pointer, notices where something was refused, the special's confirm step and the
// inspect panel. Floats live here and in src/render only.
import { createSignal, For, onSettled, Show } from 'solid-js';
import type { Target } from '../player/actions';
import { createGrayboxRenderer, type Bubble, type SceneView } from '../render';
import type { Game } from './game';
import { pickAt, targetKey, toPick, toTarget, type SceneHandle } from './scene';

export interface WorldProps {
  game: Game;
  scene: SceneHandle;
  seed: number;
  labels: () => Readonly<Record<string, string>>;
  text: (key: string, p?: Record<string, string | number>) => string;
  followName: () => string;
  focusLayer: boolean;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const CLICK_PX = 6; // a press that moves less than this is a click or tap, not a pan
const POSITIONS_MS = 200;

export function World(props: WorldProps) {
  let canvas: HTMLCanvasElement | undefined;
  let box: HTMLDivElement | undefined;
  const [follow, setFollow] = createSignal(true);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let revealed: { list: readonly string[]; set: ReadonlySet<string> } = {
    list: [],
    set: new Set(),
  };
  let hover: [number, number] | null = null; // client pixels over the canvas
  let down: { x: number; y: number } | null = null;
  const c = () => props.game.content;
  const ui = () => props.game.ui;

  /** Gaze's radius in metres while a power with the `collapse` primitive is held (06 §5). */
  const ringOf = (power: string): number | null => {
    const fx = c().power[power]?.effects.find((e) => e.prim === 'collapse');
    return fx && fx.prim === 'collapse' ? fx.radiusM : null;
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
    const u = ui();
    const targets = u.targets;
    const pointer = props.scene.drag ?? hover;
    const rect = canvas?.getBoundingClientRect();
    return {
      tick,
      frac,
      frame,
      next,
      samples: view.samples[tick] ?? null,
      nextSamples: view.samples[tick + 1] ?? null,
      lanterns,
      revealed: revealed.set,
      held:
        targets && u.held
          ? {
              ...targets,
              focus: u.focus ? toPick(u.focus) : null,
              ring: 'power' in u.held ? ringOf(u.held.power) : null,
            }
          : null,
      previousPath: props.game.previousPath(now),
      settings: {
        focusLayer: props.focusLayer,
        assist: c().tuning.flags.assist,
        reducedMotion: motionQuery.matches,
      },
      bubbles,
      labels: props.labels(),
      follow: follow() ? (player.followed[0] ?? null) : null,
      pointer: pointer && rect ? [pointer[0] - rect.left, pointer[1] - rect.top] : null,
    };
  };

  /** Where a target is, relative to the world view (notices, the confirm step). */
  const locate = (t: Target): [number, number] | null =>
    props.scene.renderer?.screenOf(toPick(t)) ?? null;
  const local = (x: number, y: number): [number, number] => {
    const r = box?.getBoundingClientRect();
    return r ? [x - r.left, y - r.top] : [x, y];
  };

  onSettled(() => {
    const el = canvas;
    if (!el) return;
    const renderer = createGrayboxRenderer(c(), {
      onPan: () => setFollow(false),
      seed: props.seed,
    });
    renderer.mount(el);
    props.scene.renderer = renderer;
    props.scene.canvas = el;
    props.game.setLocator(locate);
    const resize = () => renderer.resize(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // pointer: hover sets the spot under a held card (the presence strip); a click pins or inspects
    const onMove = (e: PointerEvent) => {
      hover = [e.clientX, e.clientY];
      if (ui().held) props.game.setSpot(pickAt(props.scene, e.clientX, e.clientY));
    };
    const onDown = (e: PointerEvent) => {
      hover = [e.clientX, e.clientY];
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_PX) return;
      const hit = renderer.pick(e.clientX, e.clientY);
      const at = local(e.clientX, e.clientY);
      if (ui().held) {
        if (hit) props.game.pinOn(toTarget(hit), at);
        else props.game.hold(null); // empty space cancels (06 §4)
      } else if (hit?.kind === 'object') props.game.inspectObject(hit.id, at);
    };
    const onLeave = () => {
      hover = null;
      if (ui().held && !props.scene.drag) props.game.setSpot(null);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);

    let last = performance.now();
    let lastPositions = 0;
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      props.game.frame(dt, now);
      const v = viewAt(now);
      if (v) renderer.render(v, dt);
      if (now - lastPositions >= POSITIONS_MS) {
        lastPositions = now;
        const out: Record<string, [number, number]> = {};
        const rect = el.getBoundingClientRect();
        const all: Target[] = [
          ...c().cats.map((x) => ({ cat: x.id })),
          ...c().objects.map((x) => ({ object: x.id })),
          ...c().nodes.map((x) => ({ place: x.id })),
        ];
        for (const t of all) {
          const p = renderer.screenOf(toPick(t));
          if (p) out[targetKey(t)] = [Math.round(rect.left + p[0]), Math.round(rect.top + p[1])];
        }
        props.scene.setPositions(out);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
      props.scene.renderer = null;
      renderer.dispose();
    };
  });

  const inspected = () => ui().inspecting;
  const objectDef = () => c().object[inspected()?.object ?? ''];

  return (
    <div class="world-view" ref={(e) => (box = e)} data-held={ui().held ? 'true' : 'false'}>
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
      <For each={ui().notices}>
        {(n) => (
          <div
            class="notice"
            role="status"
            data-testid="notice"
            data-key={n.key}
            style={{ left: `${n.at[0]}px`, top: `${n.at[1]}px` }}
          >
            {props.text(n.key, n.params)}
          </div>
        )}
      </For>
      <Show when={ui().confirmStep}>
        {(step) => (
          <div
            class="confirm-step"
            role="group"
            aria-label={props.text('ui.special.title')}
            data-testid="special-confirm"
            style={{ left: `${step().at[0]}px`, top: `${step().at[1]}px` }}
          >
            <p>{props.text(`card.${step().card}.special`)}</p>
            <p class="once">{props.text('ui.special.once')}</p>
            <div class="buttons">
              <button
                type="button"
                data-testid="special-ok"
                ref={(e) => queueMicrotask(() => e.focus())}
                onClick={() => props.game.confirm()}
              >
                {props.text('ui.confirm')}
              </button>
              <button
                type="button"
                data-testid="special-cancel"
                onClick={() => props.game.cancel()}
              >
                {props.text('ui.cancel')}
              </button>
            </div>
          </div>
        )}
      </Show>
      <Show when={inspected()}>
        {(i) => (
          <section
            class="inspect"
            data-testid="inspect-panel"
            aria-label={props.text('ui.inspect')}
          >
            <h2>{props.text(objectDef()?.nameKey ?? '')}</h2>
            <p>{props.text(objectDef()?.storyKey ?? '')}</p>
            <Show when={i().card}>
              {(card) => (
                <p class="found" data-testid="inspect-card">
                  {props.text('ui.inspect.found', {
                    card: props.text(c().card[card()]?.nameKey ?? ''),
                  })}
                </p>
              )}
            </Show>
            <button
              type="button"
              data-testid="inspect-close"
              onClick={() => props.game.closeInspect()}
            >
              {props.text('ui.close')}
            </button>
          </section>
        )}
      </Show>
    </div>
  );
}
