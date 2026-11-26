// The break alert (06 §6): before an edit lands that would undo watched paid facts or move unique or
// power pins to the new edge, a bar above the timeline lists them with Confirm and Cancel. Information,
// not a penalty; not a modal: the rest of the screen stays visible, but the edit waits for the choice.
// M8: with assist mode on, forming stories the edit would disrupt, under their own heading (06 §2).
import { For, Show } from 'solid-js';
import type { WatchedFact } from '../bridge/protocol';
import { clockText } from './clock';
import type { Game } from './game';

type Text = (key: string, p?: Record<string, string | number>) => string;

export function BreakAlert(props: { game: Game; text: Text }) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const notice = () => (ui().pending?.phase === 'alert' ? ui().pending?.notice : null);
  const disrupted = () => ui().pending?.disrupted ?? [];
  const catName = (id: string | null) =>
    id === null ? '' : props.text(c().cat[id]?.nameKey ?? '');

  /** A watched fact as the alert names it: the lines it showed, or its time. */
  const what = (f: WatchedFact): string => {
    const frame = ui().pending?.old.frames[f.tick];
    const shows = new Set([...f.summary.storylets, ...f.summary.events]);
    const lines = (frame?.lines ?? []).filter((l) => shows.has(l.shows));
    const time = clockText(c(), f.tick);
    return lines.length > 0
      ? `${time} ${lines.map((l) => props.text(l.text)).join(' ')}`
      : props.text('ui.alert.watched', { time });
  };
  const pinName = (id: string) => {
    const p = ui().pending?.after.pins.find((x) => x.id === id);
    if (!p) return id;
    return props.text(
      p.kind === 'card' ? (c().card[p.card]?.nameKey ?? '') : (c().power[p.power]?.nameKey ?? ''),
    );
  };

  return (
    <Show when={notice()}>
      {(n) => (
        <section class="break-alert" data-testid="break-alert" aria-live="polite">
          <h2>{props.text('ui.alert.title')}</h2>
          <ul>
            <For each={n().breaks}>{(f) => <li data-testid="break">{what(f)}</li>}</For>
            <For each={n().moves}>
              {(m) => (
                <li data-testid="move">
                  {props.text('ui.alert.moves', {
                    name: pinName(m.pin),
                    time: clockText(c(), m.to),
                  })}
                </li>
              )}
            </For>
          </ul>
          <Show when={disrupted().length > 0}>
            <h3>{props.text('ui.alert.stories')}</h3>
            <ul>
              <For each={disrupted()}>
                {(d) => (
                  <li data-testid="disrupted" data-storylet={d.storylet}>
                    {d.cat === null
                      ? props.text('ui.alert.storyAt', { time: clockText(c(), d.tick) })
                      : props.text('ui.alert.story', {
                          name: catName(d.cat),
                          time: clockText(c(), d.tick),
                        })}
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <div class="buttons">
            <button
              type="button"
              data-testid="alert-confirm"
              ref={(e) => queueMicrotask(() => e.focus())}
              onClick={() => props.game.confirm()}
            >
              {props.text('ui.confirm')}
            </button>
            <button type="button" data-testid="alert-cancel" onClick={() => props.game.cancel()}>
              {props.text('ui.cancel')}
            </button>
          </div>
        </section>
      )}
    </Show>
  );
}
