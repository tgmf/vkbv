// The dev page (`?dev=1`, M5 item 6; the M1.5 inspector merged in, docs/questions.md M5-2): a seed
// field (played as typed, not vetted: M5-3), a pin-set menu loading any set of 05 §5.1 into the log,
// "reveal all" (on; off shows the map revealed as Marti sees it),
// and the inspector's state panel for the tick under the playhead: the lantern, or a reference
// history with the same pins. Developer-only text, not translated (decisions.md M0). Moves into the
// debug panel in M8.
import { createEffect, createSignal, For, Show, untrack } from 'solid-js';
import type { SimClient } from '../bridge/client';
import type { InspectView, Pin } from '../bridge/protocol';
import type { Game } from './game';

const short = (id: string) => id.slice(id.indexOf('.') + 1);
const INSPECT_MS = 750;

export interface DevProps {
  game: Game;
  sim: SimClient;
  pinsets: Record<string, Pin[]>;
  seed: number;
}

export function DevPanel(props: DevProps) {
  const names = () => Object.keys(props.pinsets);
  const [seed, setSeed] = createSignal(untrack(() => props.seed));
  const [pinset, setPinset] = createSignal('untouched');
  const [stream, setStream] = createSignal(0);
  const [reveal, setReveal] = createSignal(true);
  const [view, setView] = createSignal<InspectView | null>(null);
  // a written signal reads its old value until Solid flushes, so the new values are passed in
  const load = (s: number, name: string, all: boolean) =>
    props.game.start(s, props.pinsets[name] ?? [], all);

  // The state panel follows the playhead while the shuttle is paused, one request at a time: each
  // replays the lantern and the fog from a checkpoint (up to a second of the worker's time), which
  // would starve playback's observes.
  let inFlight = false;
  let lastAt = -Infinity;
  let wanted: { tick: number; index: number } | null = null;
  const ask = () => {
    if (inFlight || !wanted || performance.now() - lastAt < INSPECT_MS) return;
    const req = wanted;
    wanted = null;
    inFlight = true;
    lastAt = performance.now();
    void props.sim.request({ kind: 'inspect', ...req }).then((reply) => {
      inFlight = false;
      if (reply.kind === 'inspected') setView(reply.view);
      ask();
    });
  };
  createEffect(
    () => ({
      tick: props.game.ui.playhead,
      index: stream(),
      streaming: props.game.ui.streamedUpTo !== null,
      paused: props.game.ui.shuttle.dir === 'pause',
    }),
    ({ tick, index, streaming, paused }) => {
      if (streaming || !paused) return; // re-running, or playing
      wanted = { tick, index };
      ask();
      setTimeout(ask, INSPECT_MS); // the last position, once the playhead rests
    },
  );

  return (
    <details class="dev" data-testid="dev" open>
      <summary>dev</summary>
      <div class="controls">
        <label>
          seed{' '}
          <input
            type="number"
            data-testid="dev-seed"
            value={seed()}
            onChange={(e) => {
              const s = Number(e.currentTarget.value);
              setSeed(s);
              load(s, pinset(), reveal());
            }}
          />
        </label>
        <label>
          pins{' '}
          <select
            data-testid="pinset"
            onChange={(e) => {
              const name = e.currentTarget.value;
              setPinset(name);
              load(seed(), name, reveal());
            }}
          >
            <For each={names()}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </label>
        <label>
          stream{' '}
          <input
            type="number"
            min="0"
            data-testid="dev-stream"
            title="0: the lantern; i > 0: the reference history of stream i with these pins"
            value={stream()}
            onChange={(e) => setStream(Math.max(0, Number(e.currentTarget.value)))}
          />
        </label>
        <label title="every place revealed (M5 item 6); off: the map is revealed as Marti sees it">
          <input
            type="checkbox"
            data-testid="dev-reveal"
            checked={reveal()}
            onChange={(e) => {
              const all = e.currentTarget.checked;
              setReveal(all);
              load(seed(), pinset(), all);
            }}
          />{' '}
          reveal all
        </label>
      </div>
      <Show when={view()}>{(v) => <Panel view={v()} />}</Show>
    </details>
  );
}

/** The inspector's text panels: the events that led here, cats, storylets, facts, flags, counters. */
function Panel(props: { view: InspectView }) {
  const v = () => props.view;
  return (
    <div class="panel">
      <p data-testid="dev-clock">
        {v().clock} · tick {v().tick} · {v().weather} · end: {v().end.kind} at {v().end.clock}
      </p>
      <h3>events that led here, newest first</h3>
      <pre class="log" data-testid="log">
        {[...v().events].reverse().join('\n')}
      </pre>
      <h3>cats</h3>
      <table>
        <tbody>
          <For each={v().cats}>
            {(cat) => (
              <tr class={{ fogged: !cat.live }}>
                <th>{cat.id}</th>
                <td>
                  {cat.live ? cat.activity : 'fog'}
                  {cat.live && cat.interrupt ? ` ⏸ ${cat.interrupt}` : ''}
                  {cat.live && cat.control !== 'free' ? ` [${cat.control}]` : ''}
                  <br />
                  <small>
                    {cat.live ? short(cat.node) : ''}
                    {cat.live && cat.route.length > 0
                      ? ` → ${cat.route.map(short).join(' → ')}`
                      : ''}
                  </small>
                </td>
                <td class="gauges">
                  {cat.live ? cat.hooks.map(([g, n]) => `${g} ${n}`).join(' · ') : ''}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <h3>storylets</h3>
      <ul>
        <For each={v().storylets}>
          {(s) => (
            <li class={{ ended: s.ended }}>
              {s.id}.<b>{s.state}</b> <small>{s.roles}</small>
            </li>
          )}
        </For>
      </ul>
      <h3>facts</h3>
      <p class="small">{v().facts.join(', ') || '—'}</p>
      <h3>flags, counters</h3>
      <p class="small">
        {[...v().flags, ...v().counters.map(([key, n]) => `${key}=${n}`)].join(', ') || '—'}
      </p>
    </div>
  );
}
