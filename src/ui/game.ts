// The game's controller: the player state, the latest re-run result and the shuttle, as plain data the
// animation loop reads every frame, mirrored into a Solid store for the components. It sends requests
// through the bridge and asks src/player for every rule; it never simulates and decides no rule.
// M6 adds holding a card or power, edits (a preview first, the break alert, commit or cancel), edit
// feedback, inspecting, and short notices where something was refused.
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
import {
  advance,
  applyPreview,
  inspect,
  playCard,
  previewNotice,
  setPlayhead,
  usePower,
  type ActionResult,
  type PreviewNotice,
  type Refusal,
  type Target,
} from '../player/actions';
import {
  forward,
  forwardLimit,
  PAUSED,
  press,
  type Shuttle,
  type ShuttleKey,
} from '../player/playback';
import { newGame, type PlayerState, type PlayerView } from '../player/state';
import {
  handOf,
  heldRefusal,
  holdRefusal,
  needsConfirm,
  presence,
  targetsOf,
  type Held,
  type Targets,
} from '../player/targets';
import { storyDots } from './story';

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

/** A short notice at a point of the world view (a refusal and its reason), its text key and params. */
export interface Notice {
  id: number;
  key: string;
  params?: Record<string, string>;
  at: [number, number];
}

/** An edit on its way: previewed (streaming), then waiting for the break alert (06 §6). */
export interface Pending {
  phase: 'preview' | 'alert';
  /** The first tick the re-run replays (the ripple starts there). */
  from: number | null;
  notice: PreviewNotice | null;
  /** The player and pins as the edit makes them, before the preview's result is applied. */
  after: PlayerState;
  /** The view before the edit: the frames the facts the alert lists were watched in. */
  old: View;
}

/** What edit feedback shows after an edit lands (06 §6), until `until` (real ms). */
export interface Feedback {
  from: number;
  /** Story dots the edit removed (docs/questions.md M6-3), and changed-unwatched marks it added. */
  dotsGone: number[];
  marksNew: number[];
  /** Ordinary cards whose pins the new edge cut, flying back to the hand, from their ticks. */
  returned: { card: string; tick: number }[];
  /** Unique and power pins the new edge moved. */
  moved: string[];
  /** The timeline's end changed kind (to or from fray or anchor). */
  endChanged: boolean;
  until: number;
}

/** The special's confirm step (06 §6), shown at the target. */
export interface ConfirmStep {
  card: string;
  target: Target;
  at: [number, number];
}

const BUBBLE_MS = 4000;
const CATCH_UP = 3;
const NOTICE_MS = 2500;
const DOTS_MS = 2000;
const PATH_MS = 5000;
const SPAN_MS = 500; // the bar rescaling to a new edge after an edit

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
  /** Marti's path before the last edit, while it shows (06 §6), as positions in metres. */
  previousPath(nowMs: number): [number, number][] | null;
  /** Where a target is on screen, given by the world view once it is mounted. */
  setLocator(fn: (t: Target) => [number, number] | null): void;
  /** Hold a card or power, or put it down (null); the same thing again puts it down. */
  hold(held: Held | null, at?: [number, number]): void;
  /** The target under the pointer or keyboard focus while something is held (the presence strip). */
  setSpot(spot: Target | null): void;
  setFocus(focus: Target | null): void;
  /** Pin the held card or power on a target (a click, a drop, Enter). */
  pinOn(target: Target, at?: [number, number]): void;
  /** Inspect an object (a click with nothing held, 06 §6). */
  inspectObject(object: string, at?: [number, number]): void;
  closeInspect(): void;
  /** Any other action (withdraw, move a pin): an edit goes through a preview first. */
  act(fn: (p: PlayerState, v: View, c: Content) => ActionResult, at?: [number, number]): void;
  /** Confirm or cancel the special's confirm step or the break alert. */
  confirm(): void;
  cancel(): void;
  /** Escape: cancel a confirm step or the alert, else close a panel, else put the held thing down. */
  escape(): void;
}

export interface UiState {
  player: PlayerState;
  view: View;
  shuttle: Shuttle;
  playhead: number;
  edge: number;
  /** The span the bar draws, easing to max(edge, minSpanTicks) after an edit (06 §6). */
  span: number;
  end: RecomputeResult['end'];
  streamedUpTo: number | null;
  busy: boolean;
  held: Held | null;
  targets: Targets | null;
  spot: Target | null;
  focus: Target | null;
  presence: number[] | null;
  confirmStep: ConfirmStep | null;
  pending: Pending | null;
  feedback: Feedback | null;
  notices: Notice[];
  inspecting: { object: string; card: string | null } | null;
  /** Cards that just reached the hand (they arrive with a short animation). */
  arrived: string[];
}

const emptyView = (): View => ({
  frames: [],
  samples: [],
  edge: 0,
  end: { kind: 'limit', tick: 0 },
  gazeFacts: [],
  streamedUpTo: null,
});

const viewOf = (r: RecomputeResult): View => ({
  frames: r.frames,
  samples: r.samples,
  edge: r.edge,
  end: r.end,
  gazeFacts: r.gazeFacts,
  streamedUpTo: null,
});

const pinsKey = (pins: readonly Pin[]): string => JSON.stringify(pins);

export function createGame(content: Content, sim: SimClient): Game {
  const c = content;
  let player = newGame(c, 0, 0);
  let view = emptyView();
  let shuttle: Shuttle = PAUSED;
  let acc = 0;
  let frac = 0;
  let busy = false; // an observe is on its way: playback waits for it (02 §3)
  let session = 0; // a new start drops replies of the old one
  let shown: ShownLine[] = [];
  let scrubbing = false; // the last move was a scrub: bubbles show the playhead's tick only
  let queued = 0; // → presses waiting for the observe in flight
  let span = 0;
  let spanAnim: { from: number; to: number; t0: number } | null = null;
  let held: Held | null = null;
  let spot: Target | null = null;
  let focus: Target | null = null;
  let pending: (Omit<Pending, 'old'> & { before: { player: PlayerState; view: View } }) | null =
    null;
  let preview: RecomputeResult | null = null;
  let confirmStep: ConfirmStep | null = null;
  let feedback: Feedback | null = null;
  let prevPath: { points: [number, number][]; until: number } | null = null;
  let notices: Notice[] = [];
  let noticeId = 0;
  let inspecting: UiState['inspecting'] = null;
  let arrived: string[] = [];
  /** An action asked for while an observe was out: it runs when the reply has been applied. */
  let waiting: (() => void) | null = null;
  let locate: (t: Target) => [number, number] | null = () => null;

  const minSpan = () => Math.max(c.tuning.timeline.minSpanTicks, 1);
  const targetsNow = (): Targets | null => (held ? targetsOf(player, view, c, held) : null);
  const presenceNow = (): number[] | null =>
    held && spot ? presence(player, view, c, held, spot) : null;

  const [ui, setUi] = createStore<UiState>({
    player: markRaw(player),
    view: markRaw(view),
    shuttle,
    playhead: 0,
    edge: 0,
    span: minSpan(),
    end: view.end,
    streamedUpTo: null,
    busy: false,
    held: null,
    targets: null,
    spot: null,
    focus: null,
    presence: null,
    confirmStep: null,
    pending: null,
    feedback: null,
    notices: [],
    inspecting: null,
    arrived: [],
  });
  const sync = () => {
    const targets = targetsNow();
    const strip = presenceNow();
    setUi((d) => {
      d.player = markRaw(player);
      d.view = markRaw(view);
      d.shuttle = shuttle;
      d.playhead = player.playhead;
      d.edge = view.edge;
      d.span = span;
      d.end = view.end;
      d.streamedUpTo = view.streamedUpTo;
      d.busy = busy;
      d.held = held;
      d.targets = targets ? markRaw(targets) : null;
      d.spot = spot;
      d.focus = focus;
      d.presence = strip ? markRaw(strip) : null;
      d.confirmStep = confirmStep;
      d.pending = pending
        ? markRaw({
            phase: pending.phase,
            from: pending.from,
            notice: pending.notice,
            after: pending.after,
            old: pending.before.view,
          })
        : null;
      d.feedback = feedback ? markRaw(feedback) : null;
      d.notices = markRaw(notices);
      d.inspecting = inspecting;
      d.arrived = markRaw(arrived);
    });
  };

  /** The bar's span follows the edge; a jump (an edit, a new game) eases over SPAN_MS. */
  const spanTo = (edge: number, nowMs: number, ease: boolean) => {
    const goal = Math.max(edge, minSpan());
    spanAnim = ease && goal !== span ? { from: span, to: goal, t0: nowMs } : null;
    if (!spanAnim) span = goal;
  };

  const notify = (
    key: string,
    at: [number, number] | undefined,
    params?: Record<string, string>,
  ) => {
    const id = ++noticeId;
    notices = [...notices, { id, key, at: at ?? [24, 24], ...(params && { params }) }];
    setTimeout(() => {
      notices = notices.filter((n) => n.id !== id);
      sync();
    }, NOTICE_MS);
  };
  const refuse = (why: Refusal, at?: [number, number]) => notify(`ui.refusal.${why}`, at);

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

  /** Cards that reached the hand by `next`, for their arrival animation. */
  const markArrived = (before: PlayerState, next: PlayerState) => {
    const had = handOf(before, c);
    const fresh = handOf(next, c).filter((id) => !had.includes(id));
    if (fresh.length === 0) return;
    arrived = [...arrived, ...fresh];
    setTimeout(() => {
      arrived = arrived.filter((id) => !fresh.includes(id));
      sync();
    }, 1200);
  };

  /** A re-run of `pins` (an edit's preview, or the committed pins), streamed into the view. */
  function recompute(p: PlayerState, isPreview: boolean, onFrom: (from: number) => void) {
    const me = session;
    let first = true;
    return sim.request(
      {
        kind: 'recompute',
        seed: p.seed,
        pins: p.pins,
        watched: p.watched,
        frontier: p.frontier,
        preview: isPreview,
      },
      (patch) => {
        if (me !== session) return;
        const { from, frames } = patch.frames;
        if (first) onFrom(from);
        first = false;
        view = {
          ...view,
          frames: [...view.frames.slice(0, from), ...frames],
          samples: view.samples.slice(0, from),
          edge: patch.upTo,
          streamedUpTo: patch.upTo,
        };
        sync();
      },
    );
  }

  function start(seed: number, pins: Pin[], revealAll: boolean) {
    const me = ++session;
    player = { ...newGame(c, seed, seed), pins, nextSeq: pins.length + 1 };
    if (revealAll) player = { ...player, revealed: c.nodes.map((n) => n.id).sort() };
    view = { ...emptyView(), streamedUpTo: 0 };
    shuttle = PAUSED;
    busy = false;
    acc = 0;
    queued = 0;
    shown = [];
    held = spot = focus = null;
    pending = null;
    preview = null;
    confirmStep = null;
    feedback = null;
    prevPath = null;
    inspecting = null;
    waiting = null;
    span = minSpan();
    spanAnim = null;
    sync();
    void recompute(player, false, () => undefined).then((reply) => {
      if (me !== session || reply.kind !== 'result') return;
      view = viewOf(reply.result);
      span = Math.max(view.edge, minSpan());
      sync();
    });
  }

  // --- edits (04 §4, 06 §6) ----------------------------------------------------------------------

  /** Runs an action now, or once the observe in flight has been applied (the playhead may move). */
  function whenIdle(fn: () => void): void {
    if (busy) waiting = fn;
    else fn();
  }

  /** Applies an action's result: a refusal becomes a notice; an edit goes through a preview. */
  function apply(r: ActionResult, at?: [number, number]): void {
    if (r.error) {
      refuse(r.error, at);
      sync();
      return;
    }
    if (pinsKey(r.player.pins) === pinsKey(player.pins)) {
      markArrived(player, r.player);
      player = r.player;
      sync();
      return;
    }
    // an edit: the shuttle waits until it lands or is cancelled (docs/questions.md M6-2)
    shuttle = PAUSED;
    acc = 0;
    held = null;
    spot = focus = null;
    pending = {
      phase: 'preview',
      from: null,
      notice: null,
      after: r.player,
      before: { player, view },
    };
    const me = session;
    const after = r.player;
    sync();
    void recompute(after, true, (from) => {
      if (pending) pending = { ...pending, from };
    }).then((reply) => {
      if (me !== session || !pending) return;
      if (reply.kind !== 'result') {
        console.error(`preview: ${reply.kind === 'error' ? reply.message : reply.kind}`);
        cancelEdit();
        return;
      }
      preview = reply.result;
      const notice = previewNotice(after, c, reply.result);
      view = { ...viewOf(reply.result), streamedUpTo: null };
      if (notice.alert) {
        pending = { ...pending, phase: 'alert', notice };
        sync();
      } else land();
    });
  }

  function cancelEdit(): void {
    if (!pending) return;
    player = pending.before.player;
    view = pending.before.view;
    pending = null;
    preview = null;
    sync();
  }

  /** The edit lands: the worker commits the preview; reopened facts and cut pins are applied. */
  function land(): void {
    const p = pending;
    const result = preview;
    if (!p || !result) return;
    const me = session;
    const nowMs = performance.now();
    const committed = applyPreview(p.after, view, c, { result }).player;
    const before = p.before;
    // edit feedback (06 §6)
    const dotsBefore = storyDots(c, before.player.watched).map((d) => d.t);
    const dotsAfter = new Set(storyDots(c, committed.watched).map((d) => d.t));
    const returned = p.after.pins
      .filter((x) => x.kind === 'card' && !committed.pins.some((y) => y.id === x.id))
      .map((x) => ({ card: x.kind === 'card' ? x.card : '', tick: x.tick }));
    const moved = committed.pins
      .filter((x) => p.after.pins.some((y) => y.id === x.id && y.tick !== x.tick))
      .map((x) => x.id);
    feedback = {
      from: p.from ?? 0,
      dotsGone: dotsBefore.filter((t) => !dotsAfter.has(t)),
      marksNew: committed.marks.changedUnwatched.filter(
        (t) => !before.player.marks.changedUnwatched.includes(t),
      ),
      returned,
      moved,
      endChanged: before.view.end.kind !== result.end.kind,
      until: nowMs + DOTS_MS,
    };
    setTimeout(() => {
      if (feedback && feedback.until <= performance.now()) feedback = null;
      sync();
    }, DOTS_MS + 50);
    prevPath = previousPathOf(before.view, view, p.from ?? 0, nowMs);
    markArrived(before.player, committed);
    player = committed;
    pending = null;
    preview = null;
    spanTo(view.edge, nowMs, true);
    sync();
    void sim.request({ kind: 'commit' }).then((ok) => {
      if (me !== session) return;
      if (ok.kind !== 'ready') console.error(`commit: ${ok.kind}`);
      // pins the new edge moved: the committed timeline is re-run with them (decisions.md, M3)
      if (pinsKey(committed.pins) !== pinsKey(p.after.pins))
        void recompute(committed, false, () => undefined).then((reply) => {
          if (me !== session || reply.kind !== 'result') return;
          view = viewOf(reply.result);
          sync();
        });
    });
  }

  /** Marti's path before the edit (06 §6), from the first tick where the new frames differ. */
  function previousPathOf(
    old: View,
    now: View,
    from: number,
    nowMs: number,
  ): { points: [number, number][]; until: number } | null {
    const cat = player.followed[0] ?? '';
    const pos = (v: View, t: number) => v.frames[t]?.cats[cat]?.[0]?.pos;
    let t = from;
    while (t <= old.edge) {
      const a = pos(old, t);
      const b = pos(now, t);
      if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) break;
      t++;
    }
    const points: [number, number][] = [];
    for (let u = Math.max(0, t - 1); u <= old.edge; u++) {
      const a = pos(old, u);
      if (a) points.push([a[0], a[1]]);
    }
    return points.length > 1 ? { points, until: nowMs + PATH_MS } : null;
  }

  // --- playback (M5) ------------------------------------------------------------------------------

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
      spanTo(view.edge, until, false);
    }
    view = {
      ...view,
      samples: [...view.samples.slice(0, reply.samples.from), ...reply.samples.ticks],
    };
    // the player may have scrubbed while the observe was out: the fact was still watched in playback
    // at its tick, so it is recorded there, and the playhead goes back to where the scrub left it
    const at = player.playhead;
    const moved = at !== reply.fact.tick;
    const r = advance({ ...player, playhead: reply.fact.tick }, view, c, { fact: reply.fact });
    if (r.error) {
      console.error(`advance at ${reply.fact.tick}: ${r.error}`);
      shuttle = PAUSED;
      return;
    }
    markArrived(player, r.player);
    player = moved ? { ...r.player, playhead: Math.min(at, view.edge) } : r.player;
    if (moved) return;
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
      const r = setPlayhead(player, view, c, { tick: t + 1 });
      if (!r.error) player = r.player;
      scrubbing = true;
      return;
    }
    scrubbing = false;
    const cat = player.followed[0] ?? 'marti';
    if (factAt(t) && t + 1 <= view.edge) {
      const r = advance(player, view, c, { fact: null });
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
      const next = waiting;
      waiting = null;
      next?.();
      sync();
    });
  }

  const pickCard = (h: Held, target: Target, at?: [number, number]) => {
    whenIdle(() => {
      const why = heldRefusal(player, view, c, h, target);
      if (why) {
        refuse(why, at ?? locate(target) ?? undefined);
        sync();
        return;
      }
      if ('card' in h && needsConfirm(player, c, h, target)) {
        shuttle = PAUSED;
        confirmStep = { card: h.card, target, at: at ?? locate(target) ?? [24, 24] };
        sync();
        return;
      }
      apply(
        'card' in h
          ? playCard(player, view, c, { card: h.card, target })
          : 'place' in target
            ? usePower(player, view, c, { power: h.power, place: target.place })
            : { player, error: 'noBranch' },
        at,
      );
    });
  };

  function confirm(): void {
    if (confirmStep) {
      const step = confirmStep;
      confirmStep = null;
      apply(playCard(player, view, c, { card: step.card, target: step.target }), step.at);
      return;
    }
    if (pending?.phase === 'alert') land();
  }

  function cancel(): void {
    if (confirmStep) {
      confirmStep = null;
      sync();
      return;
    }
    if (pending?.phase === 'alert') cancelEdit();
  }

  return {
    content,
    ui,
    now: () => ({ player, view, shuttle, frac }),
    start,
    press(key) {
      if (pending || confirmStep) return;
      shuttle = press(c, shuttle, key);
      acc = 0;
      sync();
    },
    scrubTo(tick) {
      if (pending) return;
      const r = setPlayhead(player, view, c, {
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
      if (!pending && !confirmStep) queued += 1;
    },
    frame(dtMs, nowMs) {
      if (spanAnim) {
        const k = Math.min(1, (nowMs - spanAnim.t0) / SPAN_MS);
        span = spanAnim.from + (spanAnim.to - spanAnim.from) * (1 - (1 - k) ** 3);
        if (k >= 1) {
          span = spanAnim.to;
          spanAnim = null;
        }
        sync();
      }
      if (pending || confirmStep) {
        frac = 0;
        return;
      }
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
        acc += (dtMs / 1000) * (c.tuning.player.shuttleTps[shuttle.speed] ?? 0);
        const steps = Math.floor(acc);
        acc -= steps;
        if (steps > 0) {
          const r = setPlayhead(player, view, c, { tick: Math.max(0, before - steps) });
          if (!r.error) player = r.player;
          if (player.playhead === 0) shuttle = PAUSED;
          scrubbing = true;
          shown = [];
        }
        frac = 0;
      } else {
        // forward: each tick passed is watched or scrubbed, at the rate of the tick it starts from
        const { tps } = forward(c, shuttle, before, view.edge);
        // while an observe is out playback waits on its tick (02 §3); the time keeps counting, up to
        // CATCH_UP ticks, so a slow fog step is caught up on the cheap ticks after it
        acc = Math.min(acc + (dtMs / 1000) * tps, busy ? CATCH_UP : Infinity);
        while (acc >= 1 && !busy && shuttle.dir === 'fwd') {
          const t = player.playhead;
          stepFrom(t, forward(c, shuttle, t, view.edge).watch, nowMs);
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
    previousPath(nowMs) {
      if (!prevPath || prevPath.until < nowMs) return null;
      return prevPath.points;
    },
    setLocator(fn) {
      locate = fn;
    },
    hold(next, at) {
      if (pending || confirmStep) return;
      const same =
        next !== null &&
        held !== null &&
        (('card' in next && 'card' in held && next.card === held.card) ||
          ('power' in next && 'power' in held && next.power === held.power));
      if (next === null || same) {
        held = spot = focus = null;
        sync();
        return;
      }
      const why = holdRefusal(player, view, c, next);
      if (why) {
        refuse(why, at);
        sync();
        return;
      }
      held = next;
      spot = focus = null;
      sync();
    },
    setSpot(next) {
      if (JSON.stringify(next) === JSON.stringify(spot)) return;
      spot = next;
      sync();
    },
    setFocus(next) {
      focus = next;
      spot = next;
      sync();
    },
    pinOn(target, at) {
      if (pending || confirmStep || !held) return;
      pickCard(held, target, at);
    },
    inspectObject(object, at) {
      if (pending || confirmStep) return;
      whenIdle(() => {
        const r = inspect(player, view, c, { object });
        if (r.error) {
          refuse(r.error, at ?? locate({ object }) ?? undefined);
          sync();
          return;
        }
        const card = r.rewards?.flatMap((x) => x.cards ?? [])[0] ?? null;
        inspecting = { object, card };
        apply(r);
      });
    },
    closeInspect() {
      inspecting = null;
      sync();
    },
    act(fn, at) {
      if (pending || confirmStep) return;
      whenIdle(() => apply(fn(player, view, c), at));
    },
    confirm,
    cancel,
    escape() {
      if (confirmStep || pending?.phase === 'alert') return cancel();
      if (inspecting) {
        inspecting = null;
        sync();
        return;
      }
      if (held) {
        held = spot = focus = null;
        sync();
      }
    },
  };
}

/** The frame at the playhead, or null before the first one has arrived. */
export const frameAt = (view: View, tick: number): Frame | null => view.frames[tick] ?? null;
