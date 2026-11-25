// The hand (06 §4): the cards in zone `hand` with name, one-line text and a target hint. Click or tap
// to hold one (again to put it down), or drag it onto a target. Under the played-card rule `discard`,
// the draw and discard counts sit by the hand.
import { For, Show } from 'solid-js';
import { handOf, piles, targetKinds } from '../player/targets';
import type { Game } from './game';
import { overCanvas, pickAt, type SceneHandle } from './scene';

const DRAG_PX = 8;

export function Hand(props: {
  game: Game;
  scene: SceneHandle;
  text: (key: string, p?: Record<string, string | number>) => string;
}) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const hand = () =>
    handOf(ui().player, c()).flatMap((id) => {
      const card = c().card[id];
      return card ? [card] : [];
    });
  const isHeld = (id: string) => {
    const h = ui().held;
    return h !== null && 'card' in h && h.card === id;
  };

  /** A press on a card: a click holds it; a drag carries it to a target and pins it there. */
  const onDown = (id: string, e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      if (!dragging && Math.hypot(m.clientX - start.x, m.clientY - start.y) < DRAG_PX) return;
      if (!dragging) {
        dragging = true;
        if (!isHeld(id)) props.game.hold({ card: id }, [m.clientX, m.clientY]);
      }
      props.scene.drag = [m.clientX, m.clientY];
      props.game.setSpot(
        overCanvas(props.scene, m.clientX, m.clientY)
          ? pickAt(props.scene, m.clientX, m.clientY)
          : null,
      );
    };
    const up = (u: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      props.scene.drag = null;
      if (!dragging) {
        props.game.hold({ card: id }, [u.clientX, u.clientY]);
        return;
      }
      const target = overCanvas(props.scene, u.clientX, u.clientY)
        ? pickAt(props.scene, u.clientX, u.clientY)
        : null;
      const box = props.scene.canvas?.getBoundingClientRect();
      if (target && isHeld(id))
        props.game.pinOn(target, box ? [u.clientX - box.left, u.clientY - box.top] : undefined);
      else props.game.hold(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <section class="hand" data-testid="hand" aria-label={props.text('ui.hand')}>
      <ul class="cards">
        <For each={hand()}>
          {(card, i) => (
            <li>
              <button
                type="button"
                class="card"
                data-testid={`card-${card.id}`}
                data-held={isHeld(card.id) ? 'true' : 'false'}
                data-arrived={ui().arrived.includes(card.id) ? 'true' : 'false'}
                aria-pressed={isHeld(card.id) ? 'true' : 'false'}
                aria-keyshortcuts={i() < 9 ? String(i() + 1) : undefined}
                disabled={ui().pending !== null}
                onPointerDown={(e) => onDown(card.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    props.game.hold({ card: card.id });
                  }
                }}
              >
                <span class="name">{props.text(card.nameKey)}</span>
                <span class="text">{props.text(card.textKey)}</span>
                <span class="hint">
                  {targetKinds(c(), card.id)
                    .map((k) => props.text(`ui.target.${k}`))
                    .join(' · ')}
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={piles(ui().player, c())}>
        {(n) => (
          <p class="piles" data-testid="piles">
            {props.text('ui.piles', { draw: n().draw, discard: n().discard })}
          </p>
        )}
      </Show>
    </section>
  );
}
