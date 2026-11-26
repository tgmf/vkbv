// The timeline (06 §3): clock ruler, weather band, story dots, pins, the presence strip, the playhead,
// the lantern edge as the bar's right end, a re-run streaming in, the fray, changed-unwatched marks,
// and the shuttle's controls. Clicks and drags on the bar reach only ticks at or before the playhead.
// Pins: drag to move, × or Delete to withdraw, a lock on unique pins, hollow or half-filled when they
// fizzled. Edit feedback (06 §6): pulsing dots, the ripple, the end animating, cards flying home.
import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import type { Pin } from '../bridge/protocol';
import { movePin, withdraw } from '../player/actions';
import { clickable, shuttleTps } from '../player/playback';
import { isLocked, pinStatus } from '../player/targets';
import { clockText } from './clock';
import type { Game } from './game';
import { storyDots } from './story';

const PAD = 16;
const Y = { ruler: 14, weather: 24, story: 44, pins: 64, presence: 84, bottom: 92 };

type Text = (key: string, p?: Record<string, string | number>) => string;

export function Timeline(props: { game: Game; text: Text }) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const [width, setWidth] = createSignal(800);
  const [hovered, setHovered] = createSignal<string | null>(null);
  const [focused, setFocused] = createSignal<string | null>(null);
  const [drag, setDrag] = createSignal<{ id: string; tick: number } | null>(null);
  let box: HTMLDivElement | undefined;
  onSettled(() => {
    const el = box;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  });

  /** Rokko's locked thread after the anchor (06 §9): the name of the anchor's `lockedThread` cat. */
  const lockedName = () => c().cat[c().anchor.afterAnchor.lockedThread]?.nameKey ?? '';
  const span = () => Math.max(ui().span, 1);
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
  /** Runs of equal values as rects: the weather band and the presence strip. */
  const runs = (values: readonly number[]) => {
    const out: { from: number; to: number; p: number }[] = [];
    values.forEach((p, t) => {
      const last = out[out.length - 1];
      if (p === 0) return;
      if (last && last.to === t - 1 && last.p === p) last.to = t;
      else out.push({ from: t, to: t, p });
    });
    return out;
  };
  const rain = createMemo(() => runs(ui().view.frames.map((f) => f.rain)));
  // the presence strip, coarsened to 1/50 steps so equal runs merge
  const presence = createMemo(() =>
    runs((ui().presence ?? []).map((p) => Math.ceil(p / 20_000) * 20_000)),
  );
  const story = createMemo(() => storyDots(c(), ui().player.watched));

  const pinName = (p: Pin) =>
    props.text(
      p.kind === 'card' ? (c().card[p.card]?.nameKey ?? '') : (c().power[p.power]?.nameKey ?? ''),
    );
  /** Pins sharing a tick fan out sideways so none hides another. */
  const fan = (p: Pin): number => {
    const all = ui().pending?.after.pins ?? ui().player.pins;
    const same = all.filter((q) => q.tick === p.tick);
    return (same.indexOf(p) - (same.length - 1) / 2) * 20;
  };
  const unique = (p: Pin) => isLocked(c(), p);
  const status = (p: Pin) => pinStatus(ui().view, c(), p);
  const fill = (p: Pin): 'unknown' | 'full' | 'half' | 'hollow' => {
    const s = status(p).fizzled;
    return s === null ? 'unknown' : s === 0 ? 'full' : s >= 1_000_000 ? 'hollow' : 'half';
  };
  const explain = (p: Pin): string => {
    const s = status(p);
    if (!s.fizzled || !s.reason) return '';
    const why = props.text(`ui.fizzle.${s.reason}`);
    const base = props.text(s.fizzled >= 1_000_000 ? 'ui.pin.fizzled' : 'ui.pin.partly', { why });
    return s.firesAt === null
      ? base
      : `${base} ${props.text('ui.pin.firesAt', { time: clockText(c(), s.firesAt) })}`;
  };
  /** What a pin sits on: its cat, object or place (a power's place). */
  const targetName = (p: Pin) => {
    if (p.kind === 'power') return props.text(c().node[p.place]?.nameKey ?? p.place);
    const t = p.target;
    return props.text(
      'cat' in t
        ? (c().cat[t.cat]?.nameKey ?? t.cat)
        : 'object' in t
          ? (c().object[t.object]?.nameKey ?? t.object)
          : (c().node[t.place]?.nameKey ?? t.place),
    );
  };
  const label = (p: Pin) =>
    [
      props.text('ui.pin.label', {
        name: pinName(p),
        target: targetName(p),
        time: clockText(c(), p.tick),
      }),
      unique(p) ? props.text('ui.pin.locked') : '',
      explain(p),
    ]
      .filter((s) => s !== '')
      .join('. ');

  // scrubbing the bar
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

  // dragging a pin moves it (04 §3.3); a unique pin is locked
  const onPinDown = (p: Pin, e: PointerEvent) => {
    e.stopPropagation();
    if (unique(p) || ui().pending) return;
    const el = e.currentTarget as SVGGElement;
    const svg = el.ownerSVGElement;
    if (!svg) return;
    el.setPointerCapture(e.pointerId);
    const rect = svg.getBoundingClientRect();
    const start = e.clientX;
    const at = (m: PointerEvent) => Math.max(0, Math.min(ui().edge, tickAt(m.clientX - rect.left)));
    const move = (m: PointerEvent) => {
      if (Math.abs(m.clientX - start) < 4 && !drag()) return;
      setDrag({ id: p.id, tick: at(m) });
    };
    const up = (u: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const d = drag();
      setDrag(null);
      if (!d) {
        el.focus();
        return;
      }
      const tick = at(u);
      if (tick !== p.tick) props.game.act((pl, v, cc) => movePin(pl, v, cc, { pin: p.id, tick }));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const remove = (p: Pin) => props.game.act((pl, v, cc) => withdraw(pl, v, cc, { pin: p.id }));

  const fwd = () => ui().shuttle.dir === 'fwd';
  const speed = () => shuttleTps(c(), ui().shuttle);
  const frayed = () => ui().end.kind === 'fray' && ui().streamedUpTo === null;
  const fb = () => ui().feedback;
  const ripple = () => {
    const p = ui().pending;
    const head = ui().streamedUpTo;
    return p && p.from !== null && head !== null ? { from: p.from, to: head } : null;
  };

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
            <linearGradient id="ripple-fade" x1="0" x2="1">
              <stop offset="0" stop-color="var(--accent)" stop-opacity="0" />
              <stop offset="1" stop-color="var(--accent)" stop-opacity="0.45" />
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
          <Show when={ripple()}>
            {(r) => (
              <rect
                class="ripple"
                data-testid="ripple"
                data-from={r().from}
                data-to={r().to}
                x={x(r().from)}
                y={Y.weather - 4}
                width={Math.max(2, x(r().to) - x(r().from))}
                height={Y.bottom - Y.weather}
                fill="url(#ripple-fade)"
              />
            )}
          </Show>
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
                <circle
                  class="dot"
                  data-testid="story-dot"
                  data-tick={d.t}
                  cx={x(d.t)}
                  cy={Y.story}
                  r={4}
                />
              )
            }
          </For>
          <For each={fb()?.dotsGone ?? []}>
            {(t) => (
              <circle
                class="dot gone pulse"
                data-testid="dot-pulse"
                data-tick={t}
                cx={x(t)}
                cy={Y.story}
                r={4}
              />
            )}
          </For>
          <For each={ui().player.marks.changedUnwatched}>
            {(t) => (
              <circle
                class={(fb()?.marksNew ?? []).includes(t) ? 'changed pulse' : 'changed'}
                data-testid="changed"
                data-tick={t}
                cx={x(t)}
                cy={Y.story}
                r={5}
              />
            )}
          </For>
          <For each={presence()}>
            {(r) => (
              <rect
                class="presence"
                x={x(r.from)}
                y={Y.presence - 6}
                width={Math.max(1, x(r.to + 1) - x(r.from))}
                height={8}
                opacity={0.15 + (0.85 * r.p) / 1_000_000}
              />
            )}
          </For>
          <Show when={ui().presence}>
            {(p) => (
              <g
                data-testid="presence"
                data-ticks={p()
                  .map((v, t) => (v > 0 ? t : -1))
                  .filter((t) => t >= 0)
                  .join(',')}
              />
            )}
          </Show>
          <For each={fb()?.returned ?? []}>
            {(r) => (
              <g transform={`translate(${x(r.tick)} ${Y.pins})`}>
                <g class="fly-home" data-testid="fly-home" data-card={r.card}>
                  <rect x={-9} y={-9} width={18} height={18} rx={4} />
                </g>
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
            <g
              class={fb()?.endChanged ? 'fray arrive' : 'fray'}
              data-testid="fray"
              data-tick={ui().end.tick}
            >
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
          <line
            class={fb()?.endChanged ? 'edge arrive' : 'edge'}
            data-testid="edge"
            data-tick={ui().edge}
            data-end={ui().end.kind}
            x1={x(ui().edge)}
            x2={x(ui().edge)}
            y1={Y.weather - 4}
            y2={Y.bottom}
          />
          <g
            class="playhead"
            data-testid="playhead"
            data-tick={ui().playhead}
            data-edge={ui().edge}
            data-streamed={ui().streamedUpTo ?? ''}
            data-pending={ui().pending?.phase ?? ''}
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
          <For each={ui().pending?.after.pins ?? ui().player.pins}>
            {(p) => {
              const tick = () => (drag()?.id === p.id ? (drag()?.tick ?? p.tick) : p.tick);
              const shown = () => hovered() === p.id || focused() === p.id || drag()?.id === p.id;
              return (
                <g
                  class={[
                    'pin',
                    fill(p),
                    { locked: unique(p), moved: (fb()?.moved ?? []).includes(p.id) },
                  ]}
                  data-testid={`pin-${p.id}`}
                  data-tick={p.tick}
                  data-fill={fill(p)}
                  data-unique={unique(p) ? 'true' : 'false'}
                  tabindex={0}
                  role="button"
                  aria-label={label(p)}
                  aria-keyshortcuts="Delete"
                  style={{
                    transform: `translate(${x(tick()) + (drag()?.id === p.id ? 0 : fan(p))}px, ${Y.pins}px)`,
                  }}
                  data-dragging={drag()?.id === p.id ? 'true' : 'false'}
                  onPointerDown={(e) => onPinDown(p, e)}
                  onPointerEnter={() => setHovered(p.id)}
                  onPointerLeave={() => setHovered((a) => (a === p.id ? null : a))}
                  onFocus={() => setFocused(p.id)}
                  onBlur={() => setFocused((a) => (a === p.id ? null : a))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
                    e.preventDefault();
                    e.stopPropagation();
                    remove(p);
                  }}
                >
                  <title>{label(p)}</title>
                  <rect class="frame" x={-9} y={-9} width={18} height={18} rx={4} />
                  <Show when={fill(p) === 'full' || fill(p) === 'unknown'}>
                    <rect class="body" x={-9} y={-9} width={18} height={18} rx={4} />
                  </Show>
                  <Show when={fill(p) === 'half'}>
                    <rect class="body" x={-9} y={0} width={18} height={9} rx={2} />
                  </Show>
                  <text y={5}>{pinName(p).slice(0, 1).toUpperCase()}</text>
                  <Show when={unique(p)}>
                    <path class="lock" d="M5 -14 h8 v6 h-8 z M6.5 -14 v-2 a2.5 2.5 0 0 1 5 0 v2" />
                  </Show>
                  <Show when={shown() && !unique(p)}>
                    <g
                      class="withdraw"
                      data-testid={`withdraw-${p.id}`}
                      role="button"
                      aria-label={props.text('ui.pin.withdraw')}
                      transform="translate(12 -12)"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        remove(p);
                      }}
                    >
                      <circle r={7} />
                      <path d="M-3 -3 L3 3 M3 -3 L-3 3" />
                    </g>
                  </Show>
                  <Show when={shown() && explain(p) !== ''}>
                    <text
                      class="why"
                      y={26}
                      x={x(p.tick) < width() / 3 ? -9 : x(p.tick) > (2 * width()) / 3 ? 9 : 0}
                      style={{
                        'text-anchor':
                          x(p.tick) < width() / 3
                            ? 'start'
                            : x(p.tick) > (2 * width()) / 3
                              ? 'end'
                              : 'middle',
                      }}
                    >
                      {explain(p)}
                    </text>
                  </Show>
                </g>
              );
            }}
          </For>
        </svg>
        <Show when={ui().player.anchorWatched}>
          <div
            class="locked-thread"
            data-testid="locked-thread"
            tabindex="0"
            aria-label={`${props.text(lockedName())}. ${props.text(c().anchor.afterAnchor.endKey)}`}
            style={{ 'margin-left': `${PAD}px`, width: `${Math.max(0, width() - 2 * PAD)}px` }}
          >
            <span class="lock" aria-hidden="true">
              🔒
            </span>
            <span class="name">{props.text(lockedName())}</span>
            <span class="tip" role="tooltip" data-testid="locked-tip">
              {props.text(c().anchor.afterAnchor.endKey)}
            </span>
          </div>
        </Show>
      </div>
    </section>
  );
}
