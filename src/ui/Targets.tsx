// The accessible list of targets mirrored from the scene (02 §4, 06 §8): cats (one entry per cat, its
// most likely place and activity), places and objects. Visually hidden; the scene draws a focus ring
// on the one focused. While a card or power is held its valid targets are focusable (Enter pins);
// with nothing held, objects are (Enter inspects, docs/questions.md M6-5). Each entry carries its
// screen position (`data-x`, `data-y`) for browser tests.
import { For } from 'solid-js';
import type { Target } from '../player/actions';
import type { Game } from './game';
import { targetKey, type SceneHandle } from './scene';

export function Targets(props: { game: Game; scene: SceneHandle; text: (key: string) => string }) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const frame = () => ui().view.frames[ui().playhead];
  const revealed = () => new Set(ui().player.revealed);
  const watched = () => ui().player.watched;
  /** A fingerprint of the watched facts, so a test can see that panning changes nothing. */
  const digest = () => {
    let h = 0x811c9dc5;
    for (const f of watched()) h = Math.imul(h ^ f.digest, 0x01000193) >>> 0;
    return h.toString(16);
  };
  const valid = (t: Target): boolean => {
    const ts = ui().targets;
    if (!ts) return false;
    return 'cat' in t
      ? ts.cats.includes(t.cat)
      : 'object' in t
        ? ts.objects.includes(t.object)
        : ts.places.includes(t.place);
  };
  const focusable = (t: Target) => (ui().held ? valid(t) : 'object' in t);
  const pos = (t: Target) => props.scene.positions()[targetKey(t)];

  /** The attributes (getters, so they stay reactive in a spread) and handlers every entry shares. */
  const entry = (t: Target) => ({
    get 'data-valid'() {
      return valid(t) ? 'true' : 'false';
    },
    get 'data-x'() {
      return pos(t)?.[0];
    },
    get 'data-y'() {
      return pos(t)?.[1];
    },
    get tabindex() {
      return focusable(t) ? 0 : -1;
    },
    get role() {
      return focusable(t) ? 'button' : undefined;
    },
    onFocus: () => {
      if (ui().held) props.game.setFocus(t);
    },
    onBlur: () => {
      if (ui().held) props.game.setFocus(null);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      if (ui().held) props.game.pinOn(t);
      else if ('object' in t) props.game.inspectObject(t.object);
    },
  });

  return (
    <div class="sr-only" data-testid="targets" aria-label={props.text('ui.targets')}>
      <span data-testid="watched" data-count={watched().length} data-digest={digest()} />
      <ul>
        <For each={c().cats}>
          {(def) => {
            const top = () => frame()?.cats[def.id]?.[0];
            return (
              <li
                data-testid={`cat-${def.id}`}
                data-target="cat"
                data-node={top()?.node}
                data-activity={top()?.activity}
                data-ghosts={frame()?.cats[def.id]?.length ?? 0}
                data-solid={top()?.p === 1_000_000 ? 'true' : 'false'}
                {...entry({ cat: def.id })}
              >
                {props.text(def.nameKey)}
              </li>
            );
          }}
        </For>
        <For each={c().nodes}>
          {(n) => (
            <li
              data-testid={`place-${n.id}`}
              data-target="place"
              data-revealed={revealed().has(n.id) ? 'true' : 'false'}
              {...entry({ place: n.id })}
            >
              {props.text(n.nameKey)}
            </li>
          )}
        </For>
        <For each={c().objects}>
          {(o) => (
            <li
              data-testid={`object-${o.id}`}
              data-target="object"
              data-node={o.node}
              {...entry({ object: o.id })}
            >
              {props.text(o.nameKey)}
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
