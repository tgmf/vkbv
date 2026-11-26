// The Events tab (06 §10): the lantern's events from tick 0 to the edge, filterable by type; a click
// moves the playhead there (a scrub). Asked of the worker when the tab opens or on refresh.
import { createSignal, For, onSettled } from 'solid-js';
import type { SimClient } from '../../bridge/client';
import type { EventLine } from '../../bridge/protocol';
import { clockText } from '../clock';
import type { Game } from '../game';

const SHOWN = 1500; // lines drawn at once, newest last

export function EventsTab(props: { game: Game; sim: SimClient }) {
  const [lines, setLines] = createSignal<EventLine[]>([]);
  const [type, setType] = createSignal('');
  const load = () =>
    void props.sim.request({ kind: 'events' }).then((r) => {
      if (r.kind === 'events') setLines(r.events);
    });
  onSettled(load);
  const types = () => [...new Set(lines().map((l) => l.type))].sort();
  const shown = () => lines().filter((l) => type() === '' || l.type === type());
  return (
    <div class="panel" data-testid="debug-events">
      <div class="controls">
        <select
          data-testid="events-type"
          aria-label="event type"
          onChange={(e) => setType(e.currentTarget.value)}
        >
          <option value="">every type</option>
          <For each={types()}>{(t) => <option value={t}>{t}</option>}</For>
        </select>
        <button type="button" data-testid="events-refresh" onClick={load}>
          refresh
        </button>
        <span class="small">{shown().length} events</span>
      </div>
      <ol class="events">
        <For each={shown().slice(-SHOWN)}>
          {(l) => (
            <li>
              <button
                type="button"
                class="link"
                data-testid="event-line"
                data-tick={l.tick}
                onClick={() => props.game.scrubTo(l.tick)}
              >
                {clockText(props.game.content, l.tick)} {l.type} {l.text}
              </button>
            </li>
          )}
        </For>
      </ol>
    </div>
  );
}
