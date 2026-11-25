// The accessible list of targets mirrored from the scene (02 §4, 06 §8): cats (one entry per cat, its
// most likely place and activity), places and objects. Visually hidden; tests assert on it.
import { For } from 'solid-js';
import type { Game } from './game';

export function Targets(props: { game: Game; text: (key: string) => string }) {
  const c = () => props.game.content;
  const frame = () => props.game.ui.view.frames[props.game.ui.playhead];
  const revealed = () => new Set(props.game.ui.player.revealed);
  const watched = () => props.game.ui.player.watched;
  /** A fingerprint of the watched facts, so a test can see that panning changes nothing. */
  const digest = () => {
    let h = 0x811c9dc5;
    for (const f of watched()) h = Math.imul(h ^ f.digest, 0x01000193) >>> 0;
    return h.toString(16);
  };
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
                data-node={top()?.node}
                data-activity={top()?.activity}
                data-ghosts={frame()?.cats[def.id]?.length ?? 0}
                data-solid={top()?.p === 1_000_000 ? 'true' : 'false'}
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
              data-revealed={revealed().has(n.id) ? 'true' : 'false'}
            >
              {props.text(n.nameKey)}
            </li>
          )}
        </For>
        <For each={c().objects}>
          {(o) => (
            <li data-testid={`object-${o.id}`} data-node={o.node}>
              {props.text(o.nameKey)}
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
