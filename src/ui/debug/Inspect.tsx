// The State and Wave tabs (06 §10), which read the worker's `inspect` reply for the tick under the
// playhead: the lantern state (the M1.5 inspector, merged into the M5 dev page, now here), a picked
// fogged cat's chain per case, the cases with their links and weights, and the timeline's per-tick
// counts. The worker replays from a checkpoint for each request (up to a second), so it is asked only
// while the shuttle is paused and the tab is open, one request at a time.
import { createEffect, createSignal, For, Show } from 'solid-js';
import type { SimClient } from '../../bridge/client';
import type { InspectView } from '../../bridge/protocol';
import { clockText } from '../clock';
import type { Game } from '../game';

const short = (id: string) => id.slice(id.indexOf('.') + 1);
const INSPECT_MS = 750;

export interface Inspect {
  view: () => InspectView | null;
  stream: () => number;
  setStream: (n: number) => void;
  cat: () => string | null;
  setCat: (c: string | null) => void;
}

export function useInspect(game: () => Game, sim: () => SimClient, active: () => boolean): Inspect {
  const [stream, setStream] = createSignal(0);
  const [cat, setCat] = createSignal<string | null>(null);
  const [view, setView] = createSignal<InspectView | null>(null);
  let inFlight = false;
  let lastAt = -Infinity;
  let wanted: { tick: number; index: number; cat?: string } | null = null;
  const ask = () => {
    if (inFlight || !wanted || performance.now() - lastAt < INSPECT_MS) return;
    const req = wanted;
    wanted = null;
    inFlight = true;
    lastAt = performance.now();
    void sim()
      .request({ kind: 'inspect', ...req })
      .then((reply) => {
        inFlight = false;
        if (reply.kind === 'inspected') setView(reply.view);
        ask();
      });
  };
  createEffect(
    () => ({
      on: active(),
      tick: game().ui.playhead,
      index: stream(),
      cat: cat(),
      streaming: game().ui.streamedUpTo !== null,
      paused: game().ui.shuttle.dir === 'pause',
      edge: game().ui.edge,
    }),
    ({ on, tick, index, cat: picked, streaming, paused }) => {
      if (!on || streaming || !paused) return; // closed, re-running, or playing
      wanted = { tick, index, ...(picked !== null && { cat: picked }) };
      ask();
      setTimeout(ask, INSPECT_MS); // the last position, once the playhead rests
    },
  );
  return { view, stream, setStream, cat, setCat };
}

/** The lantern state at the playhead, or a reference history; a picked fogged cat's chain per case. */
export function StateTab(props: { game: Game; inspect: Inspect }) {
  const v = () => props.inspect.view();
  return (
    <div class="panel" data-testid="dev">
      <div class="controls">
        <label>
          stream{' '}
          <input
            type="number"
            min="0"
            data-testid="dev-stream"
            title="0: the lantern; i > 0: the reference history of stream i with these pins"
            value={props.inspect.stream()}
            onChange={(e) => props.inspect.setStream(Math.max(0, Number(e.currentTarget.value)))}
          />
        </label>
        <label>
          fogged cat{' '}
          <select
            data-testid="dev-cat"
            onChange={(e) => props.inspect.setCat(e.currentTarget.value || null)}
          >
            <option value="">—</option>
            <For each={props.game.content.cats}>{(c) => <option value={c.id}>{c.id}</option>}</For>
          </select>
        </label>
      </div>
      <Show
        when={v()}
        fallback={<p class="small">Pause to inspect the tick under the playhead.</p>}
      >
        {(view) => <StatePanel view={view()} />}
      </Show>
    </div>
  );
}

function StatePanel(props: { view: InspectView }) {
  const v = () => props.view;
  return (
    <>
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
                  {cat.live
                    ? [
                        ...cat.hooks.map(([g, n]) => `${g} ${n}`),
                        `pressure ${cat.pressure}`,
                        cat.touchedBy.length > 0 ? `touchedBy ${cat.touchedBy.join(',')}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : ''}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={v().chain}>
        {(ch) => (
          <>
            <h3>{ch().cat}: chain per case</h3>
            <For each={ch().cases}>
              {(fc) => (
                <>
                  <p class="small">
                    case {fc.index} · weight {fc.weightPpm} ppm
                  </p>
                  <pre class="log" data-testid="dev-chain">
                    {fc.states.map((s) => `${String(s.p).padStart(7)}  ${s.text}`).join('\n')}
                  </pre>
                </>
              )}
            </For>
          </>
        )}
      </Show>
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
      <h3>pools</h3>
      <p class="small">{v().pools.join(', ') || '—'}</p>
    </>
  );
}

/** A small chart of one number per tick, the playhead marked. */
function Spark(props: { label: string; values: readonly number[]; at: number; testid: string }) {
  const W = 560;
  const H = 40;
  const max = () => Math.max(1, ...props.values);
  const points = () =>
    props.values
      .map(
        (y, i) =>
          `${((i / Math.max(1, props.values.length - 1)) * W).toFixed(1)},${(H - (y / max()) * H).toFixed(1)}`,
      )
      .join(' ');
  const x = () => (props.at / Math.max(1, props.values.length - 1)) * W;
  return (
    <figure class="spark" data-testid={props.testid}>
      <figcaption>
        {props.label}: {props.values[props.at] ?? '—'} at the playhead · max {max()}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={props.label}>
        <polyline points={points()} fill="none" stroke="currentColor" stroke-width="1" />
        <line x1={x()} x2={x()} y1="0" y2={H} stroke="#f2c230" stroke-width="1" />
      </svg>
    </figure>
  );
}

/** Cases, live cats and fog states per tick; strain; the last re-run; the cases at the playhead. */
export function WaveTab(props: { game: Game; inspect: Inspect }) {
  const v = () => props.inspect.view();
  const stats = () => props.game.ui.view.stats;
  const c = () => props.game.content;
  return (
    <div class="panel" data-testid="debug-wave">
      <dl class="numbers">
        <dt>strain</dt>
        <dd data-testid="wave-strain">
          {stats()?.strain === null || stats() === null
            ? '—'
            : `${String(stats()?.strain)} ppm (at ${clockText(c(), props.game.ui.view.edge)})`}{' '}
          <button
            type="button"
            data-testid="wave-strain-compute"
            disabled={props.game.ui.busy || props.game.ui.strainRunning}
            onClick={() => props.game.computeStrain()}
          >
            {props.game.ui.strainRunning ? 'computing… (tens of seconds)' : 'compute strain'}
          </button>
        </dd>
        <dt>last re-run</dt>
        <dd data-testid="wave-ms">{stats() ? `${stats()?.ms} ms` : '—'}</dd>
        <dt>local causes</dt>
        <dd data-testid="wave-local">{v()?.stats.localCauses ?? stats()?.localCauses ?? '—'}</dd>
        <dt>reopened by the last re-run</dt>
        <dd data-testid="wave-reopened">
          {props.game.ui.view.reopened.map((f) => clockText(c(), f.tick)).join(', ') || 'none'}
        </dd>
      </dl>
      <Show
        when={v()}
        fallback={<p class="small">Pause to read the per-tick counts and the cases.</p>}
      >
        {(view) => (
          <>
            <Spark label="cases" values={view().stats.cases} at={view().tick} testid="wave-cases" />
            <Spark
              label="live cats"
              values={view().stats.live}
              at={view().tick}
              testid="wave-live"
            />
            <Spark
              label="fog states"
              values={view().stats.states}
              at={view().tick}
              testid="wave-states"
            />
            <h3>cases at {view().clock}</h3>
            <table data-testid="wave-case-table">
              <tbody>
                <For each={view().cases}>
                  {(fc) => (
                    <tr>
                      <th scope="row">#{fc.index}</th>
                      <td class="value">{fc.weightPpm} ppm</td>
                      <td>{fc.links.join(', ') || '—'}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </>
        )}
      </Show>
    </div>
  );
}
