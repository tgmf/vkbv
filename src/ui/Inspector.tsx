// Dev inspector (docs/milestones/M1.5-inspector.md): one history of Chapter 1, tick by tick.
// Developer-only text, not translated. All simulation work happens in the worker.
import { createMemo, createSignal, For, onCleanup, onSettled, Show } from 'solid-js';
import type { SimClient } from '../bridge/client';
import type { InspectView } from '../bridge/protocol';
import type { Content } from '../content/schemas/content';

export interface InspectorProps {
  content: Content;
  pinsets: string[];
  sim: SimClient;
  speeds: number[]; // ticks per real second
}

const short = (id: string) => id.slice(id.indexOf('.') + 1);

/** The region drawn again, enlarged, in the corner: the flat is a few metres across. */
const INSET_REGION = 'flat';

export function Inspector(props: InspectorProps) {
  const [seed, setSeed] = createSignal(1);
  const [stream, setStream] = createSignal(0);
  const [chosenPinset, setPinset] = createSignal<string | null>(null);
  const [view, setView] = createSignal<InspectView | null>(null);
  const [playing, setPlaying] = createSignal(false);
  const [chosenSpeed, setSpeed] = createSignal<number | null>(null);
  const pinset = () => chosenPinset() ?? props.pinsets[0] ?? 'untouched';
  const speed = () => chosenSpeed() ?? props.speeds[0] ?? 4;

  /** Asks the worker for tick t; the client drops replies older than the latest request. */
  const show = (t: number) => {
    void props.sim
      .request({ kind: 'inspect', seed: seed(), stream: stream(), pinset: pinset(), tick: t })
      .then((reply) => {
        if (reply.kind === 'inspected') setView(reply.view);
      });
  };
  const tick = () => view()?.tick ?? 0;
  const last = () => view()?.lastTick ?? 0;
  onSettled(() => show(0));

  // Playback: a real-time accumulator on requestAnimationFrame; stops at the end of the history.
  let frame = 0;
  let before = 0;
  let carry = 0;
  const loop = (now: number) => {
    carry += ((now - before) / 1000) * speed();
    before = now;
    const steps = Math.floor(carry);
    carry -= steps;
    if (steps > 0) {
      if (tick() >= last()) setPlaying(false);
      else show(Math.min(last(), tick() + steps));
    }
    if (playing()) frame = requestAnimationFrame(loop);
  };
  const toggle = () => {
    setPlaying(!playing());
    if (playing()) {
      before = performance.now();
      carry = 0;
      frame = requestAnimationFrame(loop);
    } else cancelAnimationFrame(frame);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowRight') show(tick() + (e.shiftKey ? 10 : 1));
    else if (e.key === 'ArrowLeft') show(Math.max(0, tick() - (e.shiftKey ? 10 : 1)));
    else if (e.key === ' ') toggle();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => {
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(frame);
  });

  const change = (set: () => void) => {
    set();
    show(0);
  };

  return (
    <div class="inspector" data-testid="inspector">
      <div class="controls">
        <label>
          seed{' '}
          <input
            type="number"
            value={seed()}
            onChange={(e) => change(() => setSeed(Number(e.currentTarget.value)))}
          />
        </label>
        <label>
          stream{' '}
          <input
            type="number"
            value={stream()}
            onChange={(e) => change(() => setStream(Number(e.currentTarget.value)))}
          />
        </label>
        <label>
          pins{' '}
          <select
            data-testid="pinset"
            onChange={(e) => change(() => setPinset(e.currentTarget.value))}
          >
            <For each={props.pinsets}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </label>
        <button type="button" data-testid="play" onClick={toggle}>
          {playing() ? 'pause' : 'play'}
        </button>
        <select onChange={(e) => setSpeed(Number(e.currentTarget.value))}>
          <For each={props.speeds}>{(s) => <option value={s}>{s} ticks/s</option>}</For>
        </select>
        <input
          type="range"
          class="scrub"
          data-testid="scrub"
          min="0"
          max={last()}
          value={tick()}
          onInput={(e) => show(Number(e.currentTarget.value))}
        />
        <span class="clock" data-testid="clock">
          {view()?.clock ?? '--:--'} · tick {tick()}
        </span>
      </div>

      <Show when={view()}>
        {(v) => (
          <div class="body">
            <div class="maps">
              <MapView content={props.content} view={v()} main />
              <div class="inset">
                <MapView content={props.content} view={v()} region={INSET_REGION} />
              </div>
            </div>
            <Panel view={v()} />
          </div>
        )}
      </Show>
    </div>
  );
}

/** The map: every place and edge, running effects, and the cats. `region` zooms onto one region. */
function MapView(props: { content: Content; view: InspectView; region?: string; main?: boolean }) {
  const c = () => props.content;
  // The view box around the shown places; sizes follow the zoom so both views read the same.
  const geo = createMemo(() => {
    const shown = props.region ? c().nodes.filter((n) => n.region === props.region) : c().nodes;
    const xs = shown.map((n) => n.pos[0]);
    const zs = shown.map((n) => n.pos[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const size = Math.max(x1 - x0, z1 - z0);
    const pad = size * 0.12 + 2;
    return {
      box: `${x0 - pad} ${z0 - pad} ${x1 - x0 + 2 * pad} ${z1 - z0 + 2 * pad}`,
      // The inset is about a third of the main map on screen, so it draws dots and labels 3x larger.
      k: (size / 110) * (props.region ? 3 : 1),
    };
  });
  const k = () => geo().k;
  const pos = (id: string) => c().node[id]?.pos ?? [0, 0];
  const fur = (id: string) => {
    const f = c().cat[id]?.look['fur'];
    return typeof f === 'string' ? f : '#888';
  };
  /** Cats on the same spot are spread on a small ring so all stay visible. */
  const at = (i: number): [number, number] => {
    const me = props.view.cats[i];
    if (!me) return [0, 0];
    const same = props.view.cats.filter((o) => o.pos[0] === me.pos[0] && o.pos[1] === me.pos[1]);
    if (same.length < 2) return me.pos;
    const a = (2 * Math.PI * same.indexOf(me)) / same.length;
    return [me.pos[0] + 2.4 * k() * Math.cos(a), me.pos[1] + 2.4 * k() * Math.sin(a)];
  };

  return (
    <svg
      class="map"
      viewBox={geo().box}
      data-weather={props.view.weather}
      style={{ '--k': k() }}
      preserveAspectRatio="xMidYMid meet"
    >
      <For each={c().edges}>
        {(e) => (
          <line
            x1={pos(e.a)[0]}
            y1={pos(e.a)[1]}
            x2={pos(e.b)[0]}
            y2={pos(e.b)[1]}
            class={{ edge: true, closed: props.view.closedEdges.includes(e.id) }}
          />
        )}
      </For>
      <For each={props.view.effects}>
        {(fx) => (
          <circle
            cx={pos(fx.place)[0]}
            cy={pos(fx.place)[1]}
            r={Math.max(fx.radiusM, 2 * k())}
            class={`effect ${fx.kind}`}
          />
        )}
      </For>
      <For each={c().nodes}>
        {(n) => (
          <g class={{ node: true, indoor: n.indoor }}>
            <circle cx={n.pos[0]} cy={n.pos[1]} r={1.4 * k()} />
            <text
              x={n.pos[0] + 1.8 * k()}
              y={n.pos[1] - 1.2 * k()}
              style={{ 'font-size': `${2.1 * k()}px` }}
            >
              {short(n.id)}
            </text>
          </g>
        )}
      </For>
      <For each={props.view.cats}>
        {(cat, i) => (
          <g
            class={{ cat: true, held: cat.interrupt !== null, marti: cat.id === 'marti' }}
            {...(props.main
              ? {
                  'data-testid': `cat-${cat.id}`,
                  'data-node': cat.node,
                  'data-activity': cat.activity,
                }
              : {})}
            transform={`translate(${at(i())[0]} ${at(i())[1]})`}
          >
            <title>{`${cat.id}: ${cat.activity}${cat.interrupt ? `, ${cat.interrupt}` : ''} @ ${cat.node}`}</title>
            <circle
              r={(cat.id === 'marti' ? 2.2 : 1.6) * k()}
              fill={fur(cat.id)}
              stroke-width={0.4 * k()}
            />
            <text y={-2.6 * k()} style={{ 'font-size': `${2 * k()}px` }}>
              {cat.id}
            </text>
          </g>
        )}
      </For>
    </svg>
  );
}

/** Text panels: this tick's events (newest first), cats, storylets, facts, flags and counters. */
function Panel(props: { view: InspectView }) {
  const v = () => props.view;
  return (
    <aside class="panel">
      <p>
        {v().weather === 'rain' ? 'rain' : 'dry'} · end: {v().end.kind} at {v().end.clock}
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
              <tr>
                <th>{cat.id}</th>
                <td>
                  {cat.activity}
                  {cat.interrupt ? ` ⏸ ${cat.interrupt}` : ''}
                  {cat.control !== 'free' ? ` [${cat.control}]` : ''}
                  <br />
                  <small>
                    {short(cat.node)}
                    {cat.route.length > 0 ? ` → ${cat.route.map(short).join(' → ')}` : ''}
                  </small>
                </td>
                <td class="gauges">{cat.hooks.map(([g, n]) => `${g} ${n}`).join(' · ')}</td>
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
    </aside>
  );
}
