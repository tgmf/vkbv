// The timeline (06 §3): clock ruler, weather band, story dots, pins (read only in M5), the playhead,
// the lantern edge as the bar's right end, a re-run streaming in, the fray, changed-unwatched marks,
// and the shuttle's controls. Clicks and drags reach only ticks at or before the playhead.
import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import { clickable, shuttleTps } from '../player/playback';
import { clockText } from './clock';
import type { Game } from './game';

const PAD = 16;
const Y = { ruler: 14, weather: 24, story: 44, pins: 64, bottom: 80 };

export function Timeline(props: {
  game: Game;
  text: (key: string, p?: Record<string, string | number>) => string;
}) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const [width, setWidth] = createSignal(800);
  let box: HTMLDivElement | undefined;
  onSettled(() => {
    const el = box;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  });

  const span = () => Math.max(ui().edge, c().tuning.timeline.minSpanTicks, 1);
  const x = (t: number) => PAD + (t / span()) * (width() - 2 * PAD);
  const tickAt = (px: number) => Math.round(((px - PAD) / (width() - 2 * PAD)) * span());

  const hours = createMemo(() => {
    const [h, m] = c().world.startClock.split(':').map(Number);
    const start = (h ?? 0) * 60 + (m ?? 0);
    const out: { t: number; label: string }[] = [];
    for (let t = 0; t <= ui().edge; t++)
      if ((start + t * c().world.tickMinutes) % 60 === 0) out.push({ t, label: clockText(c(), t) });
    return out;
  });
  const rain = createMemo(() => {
    const runs: { from: number; to: number; p: number }[] = [];
    ui().view.frames.forEach((f, t) => {
      const last = runs[runs.length - 1];
      if (f.rain === 0) return;
      if (last && last.to === t - 1 && last.p === f.rain) last.to = t;
      else runs.push({ from: t, to: t, p: f.rain });
    });
    return runs;
  });
  const payouts = () => c().economy.payouts;
  const story = createMemo(() => {
    const dots: { t: number; key: string; anchor: boolean }[] = [];
    for (const f of ui().player.watched) {
      const shown =
        f.summary.storylets.some((s) => {
          const [id, state] = s.split('.');
          const def = c().storylet[id ?? ''];
          return (
            payouts().storyletState[s] !== undefined ||
            (state !== undefined && def?.states[state]?.textKey !== undefined)
          );
        }) || f.summary.detectors.some((d) => payouts().detector[d] !== undefined);
      const anchor = f.summary.factsSet.includes(c().anchor.id);
      if (shown || anchor) dots.push({ t: f.tick, key: `${f.tick}`, anchor });
    }
    return dots;
  });

  let bound = 0;
  let dragging = false;
  const onDown = (e: PointerEvent) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const t = tickAt(e.clientX - rect.left);
    if (!clickable(ui().playhead, t)) return;
    bound = ui().playhead;
    dragging = true;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    props.game.scrubTo(t);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    props.game.scrubTo(Math.min(bound, tickAt(e.clientX - rect.left)));
  };
  const onUp = () => (dragging = false);

  const fwd = () => ui().shuttle.dir === 'fwd';
  const speed = () => shuttleTps(c(), ui().shuttle);
  const frayed = () => ui().end.kind === 'fray' && ui().streamedUpTo === null;

  return (
    <section class="timeline" aria-label={props.text('ui.timeline')} data-testid="timeline">
      <div class="controls">
        <button
          type="button"
          data-testid="shuttle-back"
          aria-label={props.text('ui.shuttle.back')}
          aria-pressed={ui().shuttle.dir === 'back' ? 'true' : 'false'}
          onClick={() => props.game.press('back')}
        >
          ◀◀
        </button>
        <button
          type="button"
          data-testid="play"
          aria-label={props.text(fwd() ? 'ui.pause' : 'ui.play')}
          onClick={() => props.game.press('play')}
        >
          {fwd() ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          data-testid="shuttle-forward"
          aria-label={props.text('ui.shuttle.forward')}
          aria-pressed={fwd() && ui().shuttle.dir === 'fwd' ? 'true' : 'false'}
          onClick={() => props.game.press('fwd')}
        >
          ▶▶
        </button>
        <span class="speed" data-testid="speed" data-tps={speed()} data-dir={ui().shuttle.dir}>
          {ui().shuttle.dir === 'pause' ? '' : props.text('ui.speed', { n: speed() })}
        </span>
        <Show when={c().tuning.flags.jumpToEdge}>
          <button
            type="button"
            data-testid="jump-edge"
            onClick={() => props.game.scrubTo(ui().edge)}
          >
            {props.text('ui.edge.jump')}
          </button>
        </Show>
      </div>
      <div class="tracks" ref={(e) => (box = e)}>
        <svg
          width={width()}
          height={Y.bottom + 24}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <defs>
            <linearGradient id="fray-fade" x1="0" x2="1">
              <stop offset="0" stop-color="var(--bg)" stop-opacity="0" />
              <stop offset="1" stop-color="var(--bg)" stop-opacity="0.9" />
            </linearGradient>
          </defs>
          <rect
            class="bar"
            x={PAD}
            y={Y.weather - 4}
            width={Math.max(0, x(ui().edge) - PAD)}
            height={Y.bottom - Y.weather}
          />
          <For each={hours()}>
            {(h) => (
              <g class="hour">
                <line x1={x(h.t)} x2={x(h.t)} y1={Y.ruler + 2} y2={Y.bottom} />
                <text x={x(h.t) + 3} y={Y.ruler}>
                  {h.label}
                </text>
              </g>
            )}
          </For>
          <For each={rain()}>
            {(r) => (
              <rect
                class="rain"
                x={x(r.from)}
                y={Y.weather}
                width={Math.max(1, x(r.to + 1) - x(r.from))}
                height={10}
                opacity={r.p / 1_000_000}
              />
            )}
          </For>
          <For each={story()}>
            {(d) =>
              d.anchor ? (
                <path
                  class="strike"
                  data-testid="strike"
                  data-tick={d.t}
                  d={`M${x(d.t) - 4} ${Y.story - 8} l6 6 -4 2 6 8 -8 -6 4 -2 z`}
                />
              ) : (
                <circle class="dot" cx={x(d.t)} cy={Y.story} r={4} />
              )
            }
          </For>
          <For each={ui().player.marks.changedUnwatched}>
            {(t) => <circle class="changed" cx={x(t)} cy={Y.story} r={5} />}
          </For>
          <For each={ui().player.pins}>
            {(p) => (
              <g
                class="pin"
                data-testid={`pin-${p.id}`}
                transform={`translate(${x(p.tick)} ${Y.pins})`}
              >
                <rect x={-9} y={-9} width={18} height={18} rx={4} />
                <text y={5}>
                  {(p.kind === 'card' ? p.card : p.power).slice(0, 1).toUpperCase()}
                </text>
              </g>
            )}
          </For>
          <Show when={ui().streamedUpTo !== null}>
            <line
              class="stream"
              x1={x(ui().streamedUpTo ?? 0)}
              x2={x(ui().streamedUpTo ?? 0)}
              y1={Y.weather - 4}
              y2={Y.bottom}
            />
          </Show>
          <Show when={frayed()}>
            <g class="fray" data-testid="fray" data-tick={ui().end.tick}>
              <rect
                x={x(Math.max(0, ui().end.tick - 40))}
                y={Y.weather - 4}
                width={Math.max(0, x(ui().end.tick) - x(Math.max(0, ui().end.tick - 40)))}
                height={Y.bottom - Y.weather}
                fill="url(#fray-fade)"
              />
              <line
                x1={x(ui().end.tick)}
                x2={x(ui().end.tick)}
                y1={Y.weather - 6}
                y2={Y.bottom + 2}
              />
            </g>
          </Show>
          <g
            class="playhead"
            data-testid="playhead"
            data-tick={ui().playhead}
            data-edge={ui().edge}
            data-streamed={ui().streamedUpTo ?? ''}
            role="slider"
            aria-label={props.text('ui.playhead')}
            aria-valuemin={0}
            aria-valuemax={ui().edge}
            aria-valuenow={ui().playhead}
            aria-valuetext={clockText(c(), ui().playhead)}
            transform={`translate(${x(ui().playhead)} 0)`}
          >
            <line y1={Y.ruler + 2} y2={Y.bottom + 4} />
            <circle cy={Y.bottom + 8} r={6} />
            <text
              x={x(ui().playhead) > width() - 80 ? -8 : 8}
              y={Y.bottom + 20}
              text-anchor={x(ui().playhead) > width() - 80 ? 'end' : 'start'}
            >
              {clockText(c(), ui().playhead)}
            </text>
          </g>
        </svg>
      </div>
    </section>
  );
}
