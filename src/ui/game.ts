// The viewer's controller (M5): the player state, the latest re-run result and the shuttle, as plain
// data the animation loop reads every frame, mirrored into a Solid store for the components. It
// sends requests through the bridge and asks src/player for every rule; it never simulates.
import { createStore, markRaw } from 'solid-js';
import type { SimClient } from '../bridge/client';
import type {
  Frame,
  Pin,
  RecomputeResult,
  TickSamples,
  WatchedFact,
  WorkerToMain,
} from '../bridge/protocol';
import type { Content } from '../content/schemas/content';
import { advance, setPlayhead } from '../player/actions';
import {
  forward,
  forwardLimit,
  PAUSED,
  press,
  type Shuttle,
  type ShuttleKey,
} from '../player/playback';
import { newGame, type PlayerState, type PlayerView } from '../player/state';

export interface View extends PlayerView {
  samples: TickSamples[];
  /** While a re-run streams: the last tick that has arrived (02 §3); null otherwise. */
  streamedUpTo: number | null;
}

/** A line shown as a speech bubble (06 §2), its text key not yet through t(). */
export interface ShownLine {
  cat: string | null;
  node: string;
  text: string;
  until: number; // real milliseconds
}

const BUBBLE_MS = 4000;
const CATCH_UP = 3;

export interface Game {
  readonly content: Content;
  /** The Solid mirror: replaced references, never copies (frames stay raw). */
  readonly ui: UiState;
  /** Plain state for the animation loop. */
  now(): { player: PlayerState; view: View; shuttle: Shuttle; frac: number };
  start(seed: number, pins: Pin[], revealAll: boolean): void;
  press(key: ShuttleKey): void;
  /** Scrub to a tick (a click, a drag, Home, End): within 0..edge, observes nothing. */
  scrubTo(tick: number): void;
  /** One tick forward as playback (→). */
  stepForward(): void;
  /** Advances the shuttle by `dtMs` of real time. */
  frame(dtMs: number, nowMs: number): void;
  /** Speech bubbles at the playhead: lines watched in the last seconds of playback, or the tick's own. */
  lines(nowMs: number): ShownLine[];
}

export interface UiState {
  player: PlayerState;
  view: View;
  shuttle: Shuttle;
  playhead: number;
  edge: number;
  end: RecomputeResult['end'];
  streamedUpTo: number | null;
  busy: boolean;
}

const emptyView = (): View => ({
  frames: [],
  samples: [],
  edge: 0,
  end: { kind: 'limit', tick: 0 },
  gazeFacts: [],
  streamedUpTo: null,
});

export function createGame(content: Content, sim: SimClient): Game {
  let player = newGame(content, 0, 0);
  let view = emptyView();
  let shuttle: Shuttle = PAUSED;
  let acc = 0;
  let frac = 0;
  let busy = false; // an observe is on its way: playback waits for it (02 §3)
  let session = 0; // a new start drops replies of the old one
  let shown: ShownLine[] = [];
  let scrubbing = false; // the last move was a scrub: bubbles show the playhead's tick only
  let queued = 0; // → presses waiting for the observe in flight
  const [ui, setUi] = createStore<UiState>({
    player: markRaw(player),
    view: markRaw(view),
    shuttle,
    playhead: 0,
    edge: 0,
    end: view.end,
    streamedUpTo: null,
    busy: false,
  });
  const sync = () =>
    setUi((d) => {
      d.player = markRaw(player);
      d.view = markRaw(view);
      d.shuttle = shuttle;
      d.playhead = player.playhead;
      d.edge = view.edge;
      d.end = view.end;
      d.streamedUpTo = view.streamedUpTo;
      d.busy = busy;
    });

  const factAt = (t: number): WatchedFact | undefined => {
    const cat = player.followed[0];
    return player.watched.find((f) => f.tick === t && f.cat === cat);
  };

  /** The lines of a watched tick that the fact shows (06 §2: only what Marti perceives). */
  const linesOf = (t: number, until: number): ShownLine[] => {
    const fact = factAt(t);
    const frame = view.frames[t];
    if (!fact || !frame) return [];
    const shows = new Set([...fact.summary.storylets, ...fact.summary.events]);
    return frame.lines
      .filter((l) => shows.has(l.shows))
      .map((l) => ({ cat: l.cat, node: l.node, text: l.text, until }));
  };

  function start(seed: number, pins: Pin[], revealAll: boolean) {
    const me = ++session;
    player = { ...newGame(content, seed, seed), pins, nextSeq: pins.length + 1 };
    if (revealAll) player = { ...player, revealed: content.nodes.map((n) => n.id).sort() };
    view = { ...emptyView(), streamedUpTo: 0 };
    shuttle = PAUSED;
    busy = false;
    acc = 0;
    queued = 0;
    shown = [];
    sync();
    void sim
      .request(
        {
          kind: 'recompute',
          seed,
          pins,
          watched: [],
          frontier: player.frontier,
          preview: false,
        },
        (patch) => {
          if (me !== session) return;
          const { from, frames } = patch.frames;
          view = {
            ...view,
            frames: [...view.frames.slice(0, from), ...frames],
            samples: view.samples.slice(0, from),
            edge: patch.upTo,
            streamedUpTo: patch.upTo,
          };
          sync();
        },
      )
      .then((reply) => {
        if (me !== session || reply.kind !== 'result') return;
        const r = reply.result;
        view = {
          frames: r.frames,
          samples: r.samples,
          edge: r.edge,
          end: r.end,
          gazeFacts: r.gazeFacts,
          streamedUpTo: null,
        };
        sync();
      });
  }

  /** Applies a watched fact the worker returned for the playhead's tick, then moves on (04 §7). */
  function observed(reply: WorkerToMain, until: number) {
    if (reply.kind !== 'observed') {
      console.error(`observe: ${reply.kind === 'error' ? reply.message : reply.kind}`);
      shuttle = PAUSED;
      return;
    }
    if (reply.frames.frames.length > 0) {
      view = {
        ...view,
        frames: [...view.frames.slice(0, reply.frames.from), ...reply.frames.frames],
        edge: reply.edge,
        end: reply.end,
        gazeFacts: [...view.gazeFacts, ...reply.gazeFacts],
      };
    }
    view = {
      ...view,
      samples: [...view.samples.slice(0, reply.samples.from), ...reply.samples.ticks],
    };
    const r = advance(player, view, content, { fact: reply.fact });
    if (r.error) {
      console.error(`advance at ${player.playhead}: ${r.error}`);
      shuttle = PAUSED;
      return;
    }
    player = r.player;
    shown = [
      ...shown.filter((l) => l.until > until - BUBBLE_MS),
      ...linesOf(reply.fact.tick, until),
    ];
  }

  /** Moves the playhead one tick forward from t: watched (playback) or scrubbed. */
  function stepFrom(t: number, watch: boolean, nowMs: number): void {
    const limit = forwardLimit(view.edge, view.end, view.streamedUpTo);
    if (t + 1 > limit) {
      acc = 0;
      if (view.streamedUpTo === null && t >= view.edge) shuttle = PAUSED; // the end, or the fray
      return;
    }
    if (!watch) {
      const r = setPlayhead(player, view, content, { tick: t + 1 });
      if (!r.error) player = r.player;
      scrubbing = true;
      return;
    }
    scrubbing = false;
    const cat = player.followed[0] ?? 'marti';
    if (factAt(t) && t + 1 <= view.edge) {
      const r = advance(player, view, content, { fact: null });
      if (!r.error) player = r.player;
      shown = [...shown, ...linesOf(t, nowMs + BUBBLE_MS)];
      return;
    }
    busy = true;
    const me = session;
    void sim.request({ kind: 'observe', tick: t, cat }).then((reply) => {
      if (me !== session) return;
      busy = false;
      observed(reply, performance.now() + BUBBLE_MS);
      sync();
    });
  }

  return {
    content,
    ui,
    now: () => ({ player, view, shuttle, frac }),
    start,
    press(key) {
      shuttle = press(content, shuttle, key);
      acc = 0;
      sync();
    },
    scrubTo(tick) {
      const r = setPlayhead(player, view, content, {
        tick: Math.max(0, Math.min(tick, view.edge)),
      });
      if (r.error) return;
      player = r.player;
      frac = 0;
      scrubbing = true;
      shown = [];
      sync();
    },
    stepForward() {
      queued += 1;
    },
    frame(dtMs, nowMs) {
      if (queued > 0 && !busy) {
        // → : one tick forward as playback, each press in turn
        queued -= 1;
        const t = player.playhead;
        stepFrom(t, true, nowMs);
        if (player.playhead === t && !busy) queued = 0; // at a limit
        sync();
      }
      if (shuttle.dir === 'pause') {
        frac = 0;
        return;
      }
      const before = player.playhead;
      const wasBusy = busy;
      const was = shuttle;
      if (shuttle.dir === 'back') {
        acc += (dtMs / 1000) * (content.tuning.player.shuttleTps[shuttle.speed] ?? 0);
        const steps = Math.floor(acc);
        acc -= steps;
        if (steps > 0) {
          const r = setPlayhead(player, view, content, { tick: Math.max(0, before - steps) });
          if (!r.error) player = r.player;
          if (player.playhead === 0) shuttle = PAUSED;
          scrubbing = true;
          shown = [];
        }
        frac = 0;
      } else {
        // forward: each tick passed is watched or scrubbed, at the rate of the tick it starts from
        const { tps } = forward(content, shuttle, before, view.edge);
        // while an observe is out playback waits on its tick (02 §3); the time keeps counting, up to
        // CATCH_UP ticks, so a slow fog step is caught up on the cheap ticks after it
        acc = Math.min(acc + (dtMs / 1000) * tps, busy ? CATCH_UP : Infinity);
        while (acc >= 1 && !busy && shuttle.dir === 'fwd') {
          const t = player.playhead;
          stepFrom(t, forward(content, shuttle, t, view.edge).watch, nowMs);
          if (player.playhead === t && !busy) break; // stopped at a limit
          acc -= 1;
        }
        frac = busy ? 0.999 : Math.min(acc, 0.999);
      }
      if (player.playhead !== before || busy !== wasBusy || shuttle !== was) sync();
    },
    lines(nowMs) {
      if (scrubbing) return linesOf(player.playhead, nowMs + 1);
      shown = shown.filter((l) => l.until > nowMs);
      return shown;
    },
  };
}

/** The frame at the playhead, or null before the first one has arrived. */
export const frameAt = (view: View, tick: number): Frame | null => view.frames[tick] ?? null;
