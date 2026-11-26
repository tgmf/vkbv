// The game's controller: the player state, the latest re-run result and the shuttle, as plain data the
// animation loop reads every frame, mirrored into a Solid store for the components. It sends requests
// through the bridge and asks src/player for every rule; it never simulates and decides no rule.
// M6 adds holding a card or power, edits (a preview first, the break alert, commit or cancel), edit
// feedback, inspecting, and short notices where something was refused.
// M8 adds the debug panel's hooks (retune, strain, the Player tab's buttons), telemetry (07 §6) and
// assist mode's disruption warnings in the break alert (06 §2).
import { createStore, markRaw } from 'solid-js';
import type { SimClient } from '../bridge/client';
import type {
  Frame,
  Pin,
  RecomputeResult,
  RerunStats,
  TickSamples,
  WatchedFact,
  WorkerToMain,
} from '../bridge/protocol';
import type { Content } from '../content/schemas/content';
import type { Tuning } from '../content/schemas/tuning';
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
import { disruptions, type Disruption } from '../player/assist';
import { debugAction, type DebugAction } from '../player/debug';
import {
  forward,
  forwardLimit,
  PAUSED,
  press,
  type Shuttle,
  type ShuttleKey,
} from '../player/playback';
import type { Settings } from '../player/save';
import { addSorted, newGame, type PlayerState, type PlayerView } from '../player/state';
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
import {
  dismissHint,
  NO_HINTS,
  othersInView,
  stepHints,
  triggered,
  type HintId,
  type HintState,
} from './hints';
import type { Track } from '../telemetry';
import { storyDots } from './story';

/**
 * Where the day is (M7): the teaser before a new day (06 §9), "preparing the day" while the seed is
 * vetted live or the first re-run is out, then play.
 */
export type Phase = 'teaser' | 'preparing' | 'play';

/** The settings a first visit starts with (06 §8). */
export const defaultSettings = (c: Content): Settings => ({
  lang: 'en',
  textSize: 100,
  reducedMotion: 'system',
  focusLayer: true,
  assist: c.tuning.flags.assist,
  volume: 100,
  telemetry: true,
});

export interface GameOptions {
  settings?: Settings;
  /** Saves the player and the settings (04 §9); absent in the debug mode, which saves nothing. */
  save?: (player: PlayerState, settings: Settings) => void;
  /** Telemetry (07 §6); absent in tests. */
  track?: Track;
  /** What `session_start` records besides the game: the build and the viewport. */
  info?: () => { build: string; viewport: string };
}

export interface View extends PlayerView {
  samples: TickSamples[];
  /** While a re-run streams: the last tick that has arrived (02 §3); null otherwise. */
  streamedUpTo: number | null;
  /** The last re-run's debug numbers and reopened facts (06 §10, the Wave tab); null before one. */
  stats: RerunStats | null;
  reopened: WatchedFact[];
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
  /** Assist mode: forming stories the edit would disrupt (06 §2), listed under their own heading. */
  disrupted: Disruption[];
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
const HINTS_EVERY_MS = 250; // how often the hints' triggers and the end screen are checked

export interface Game {
  readonly content: Content;
  /** The Solid mirror: replaced references, never copies (frames stay raw). */
  readonly ui: UiState;
  /** Plain state for the animation loop. */
  now(): { player: PlayerState; view: View; shuttle: Shuttle; frac: number };
  /** The debug panel's Pin sets tab: a seed played as given, with pins, no teaser. */
  start(seed: number, pins: Pin[], revealAll: boolean): void;
  /**
   * A new day (M7): the teaser plays while the seed is vetted (when `seed` is null) and the first
   * re-run runs; `notice` is a text key shown meanwhile (a save that could not be read).
   */
  newDay(requested: number, seed: number | null, notice?: string): void;
  /** A saved game: re-run from tick 0 to the frontier limit (04 §6), the playhead where it was. */
  resume(saved: PlayerState): void;
  skipTeaser(): void;
  dismissHint(): void;
  /** Closes the end screen and leaves the day open (06 §9). */
  keepPlaying(): void;
  setSettings(patch: Partial<Settings>): void;
  /** Saves now (the page is being left). */
  persist(): void;
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
  // M8: the debug panel and telemetry
  /** New content (a tuning change): the worker loads it, and the day is re-run from the player. */
  retune(next: Content): void;
  /** Strain (03 §14): a projection from the edge, tens of seconds of the worker's time. */
  computeStrain(): void;
  /** One of the Player tab's buttons (06 §10). */
  debug(action: DebugAction): void;
  /** Records a telemetry event the components see (the end screen's buttons). */
  track: Track;
  /** The page is being left: `session_end` (07 §6). */
  endSession(): void;
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
  phase: Phase;
  bootNotice: string | null;
  /** The hint showing now (06 §7). */
  hint: HintId | null;
  endOpen: boolean;
  settings: Settings;
  seen: string[];
  /** The tuning the game runs with (the debug panel's Tuning tab). */
  tuning: Tuning;
  strainRunning: boolean;
}

const emptyView = (): View => ({
  frames: [],
  samples: [],
  edge: 0,
  end: { kind: 'limit', tick: 0 },
  gazeFacts: [],
  streamedUpTo: null,
  stats: null,
  reopened: [],
});

const viewOf = (r: RecomputeResult): View => ({
  frames: r.frames,
  samples: r.samples,
  edge: r.edge,
  end: r.end,
  gazeFacts: r.gazeFacts,
  streamedUpTo: null,
  stats: r.stats,
  reopened: r.reopened,
});

const BEHIND_TICKS = 30; // `card_played.behindLimit`, `scroll_back` (07 §6)
const RECOMPUTE_EVERY = 10; // `recompute` events: every 10th, and every one over budget (07 §6)

const pinsKey = (pins: readonly Pin[]): string => JSON.stringify(pins);

export function createGame(content: Content, sim: SimClient, opts: GameOptions = {}): Game {
  // the content changes only when the debug panel retunes it (`retune`)
  let c = content;
  let flow = c.tuning.flow;
  const powerWith = (prim: string) =>
    c.powers.find((p) => p.effects.some((e) => e.prim === prim))?.id;
  let gazeId = powerWith('collapse');
  let lureId = powerWith('attract');
  const track: Track = opts.track ?? (() => undefined);
  const costOf = (id: string | undefined) => (id ? (c.power[id]?.cost ?? 0) : Infinity);
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
  // M7: the day's phase, settings, saving, hints and the end screen
  // nothing plays, triggers a hint or saves until a day starts (start, newDay, resume)
  let phase: Phase = 'preparing';
  let teaserUntil = 0;
  let ready = false; // the first re-run of the day has arrived
  let bootNotice: string | null = null;
  let settings: Settings = opts.settings ?? defaultSettings(c);
  let seen: string[] = [];
  let lastSave = 0;
  let hints: HintState = NO_HINTS;
  let lastHints = 0;
  let playbackMs = 0;
  let lastHead = 0;
  let ticksAfterBack: number | null = null;
  let pinnedOnProtagonistAt: number | null = null;
  let lurePlaced = false;
  let heldWithOther = false;
  let endOpen = false;
  let endClosed = false;
  let states: { watched: readonly WatchedFact[]; set: Set<string> } = {
    watched: [],
    set: new Set(),
  };
  // M8: telemetry's counters for this page load (07 §6)
  const counts = { pins: 0, withdrawals: 0, scrollBacks: 0, powers: 0, gazes: 0, recomputes: 0 };
  const watchedStates = new Set<string>(); // `story_watched`: first time in this session
  let maxPlayed = 0; // the highest tick ever played through (`behindLimit`)
  let back: { from: number; to: number } | null = null; // a backward move under way (`scroll_back`)
  let wasAtFray = false;
  let hadAnchor = false;
  let strainRunning = false;

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
    phase,
    bootNotice: null,
    hint: null,
    endOpen: false,
    settings,
    seen: [],
    tuning: markRaw(c.tuning),
    strainRunning: false,
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
            disrupted: pending.disrupted,
          })
        : null;
      d.feedback = feedback ? markRaw(feedback) : null;
      d.notices = markRaw(notices);
      d.inspecting = inspecting;
      d.arrived = markRaw(arrived);
      d.phase = phase;
      d.bootNotice = bootNotice;
      d.hint = hints.visible?.id ?? null;
      d.endOpen = endOpen;
      d.settings = settings;
      d.seen = markRaw(seen);
      d.tuning = markRaw(c.tuning);
      d.strainRunning = strainRunning;
    });
  };

  /** Saves the committed player (never an edit's preview) with what was shown and the settings. */
  const persist = () => {
    if (!opts.save || !ready) return;
    opts.save({ ...player, seen }, settings);
    lastSave = performance.now();
  };

  const see = (id: string) => {
    if (seen.includes(id)) return;
    seen = addSorted(seen, id);
    persist();
  };

  /** What the hint triggers read (06 §7), gathered from the controller's state. */
  const hintFacts = (nowMs: number) => {
    if (states.watched !== player.watched)
      states = {
        watched: player.watched,
        set: new Set(player.watched.flatMap((f) => f.summary.storylets)),
      };
    return {
      playing: phase === 'play',
      playbackMs,
      ticksAfterBack,
      inspected: player.journal.stories.length,
      hand: handOf(player, c).length,
      found: Object.values(player.cards).filter((x) => x.zone !== 'unfound').length,
      sincePinnedOnProtagonist:
        pinnedOnProtagonistAt === null ? null : nowMs - pinnedOnProtagonistAt,
      playhead: player.playhead,
      atFray:
        view.end.kind === 'fray' && view.streamedUpTo === null && player.playhead === view.edge,
      charge: player.charge,
      lureCost: costOf(lureId),
      gazeCost: costOf(gazeId),
      lurePlaced,
      watchedStates: states.set,
      heldWithOther,
      endClosed,
    };
  };

  const updateHints = (nowMs: number) => {
    const r = stepHints(hints, seen, triggered(hintFacts(nowMs), flow), nowMs, flow.hintMs);
    const changed = r.state.visible?.id !== hints.visible?.id;
    hints = r.state;
    if (changed && hints.visible) track('hint_shown', { id: hints.visible.id });
    if (r.seen.length !== seen.length) {
      seen = r.seen;
      persist();
    }
    if (changed) sync();
  };

  /** The end screen opens once, after the strike: playback has stopped at the anchor's end and the
   * last line has gone (06 §9). */
  const checkEnd = (nowMs: number) => {
    if (endOpen || seen.includes('end') || !player.anchorWatched || pending || busy) return;
    if (view.end.kind !== 'anchor' || view.streamedUpTo !== null) return;
    if (player.playhead !== view.edge || shuttle.dir !== 'pause') return;
    if (shown.some((l) => l.until > nowMs)) return;
    endOpen = true;
    see('end');
    sync();
  };

  /** Forgets everything shown and noticed in the last playthrough. */
  const newPlaythrough = (p: PlayerState) => {
    seen = [...p.seen];
    hints = NO_HINTS;
    playbackMs = 0;
    lastHead = p.playhead;
    ticksAfterBack = null;
    pinnedOnProtagonistAt = null;
    lurePlaced = p.pins.some((x) => x.kind === 'power' && x.power === lureId);
    heldWithOther = false;
    endOpen = false;
    endClosed = false;
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
    const t0 = performance.now();
    let firstMs: number | null = null;
    let fromTick = 0;
    const request = sim.request(
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
        if (first) {
          onFrom(from);
          firstMs = Math.round(performance.now() - t0);
          fromTick = from;
        }
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
    // telemetry (07 §6): the time to the first streamed frames, every 10th and every one over budget
    return request.then((reply) => {
      if (reply.kind === 'result') {
        counts.recomputes += 1;
        const r = reply.result;
        const ms = firstMs ?? Math.round(performance.now() - t0);
        if (counts.recomputes % RECOMPUTE_EVERY === 0 || ms > c.tuning.budgets.recomputeMs)
          track('recompute', {
            ms,
            ticks: Math.max(0, r.edge - fromTick),
            cases: r.stats.cases[r.edge] ?? 0,
            live: r.stats.live[r.edge] ?? 0,
          });
      }
      return reply;
    });
  }

  /** A day has started (the first re-run arrived): `session_start` and the counters it reads. */
  function started(): void {
    maxPlayed = player.watched.reduce((a, f) => Math.max(a, f.tick), 0);
    hadAnchor = player.anchorWatched;
    wasAtFray = false;
    back = null;
    const info = opts.info?.() ?? { build: 'test', viewport: '' };
    track('session_start', {
      ...info,
      locale: settings.lang,
      seed: player.seedRequested,
      vettedSeed: player.seed,
      playedCardRule: c.tuning.player.playedCardRule,
    });
  }

  /** A backward move ended: `scroll_back` when it went back 30 ticks or more (07 §6). */
  function flushBack(): void {
    if (back && back.from - back.to >= BEHIND_TICKS) {
      counts.scrollBacks += 1;
      track('scroll_back', { fromTick: back.from, toTick: back.to });
    }
    back = null;
  }

  /** The telemetry of an edit that landed (07 §6): what was played, withdrawn, moved, reopened. */
  function trackEdit(before: PlayerState, after: PlayerState, result: RecomputeResult): void {
    for (const x of after.pins) {
      const old = before.pins.find((y) => y.id === x.id);
      if (old) {
        if (old.tick !== x.tick)
          track('pin_moved', { kind: x.kind, fromTick: old.tick, toTick: x.tick });
        continue;
      }
      if (x.kind === 'card') {
        counts.pins += 1;
        track('card_played', {
          card: x.card,
          targetKind: 'cat' in x.target ? 'cat' : 'object' in x.target ? 'object' : 'place',
          tick: x.tick,
          special: x.special,
          behindLimit: x.tick <= maxPlayed - BEHIND_TICKS,
        });
      } else {
        counts.powers += 1;
        if (x.power === gazeId) counts.gazes += 1;
        track('power_used', { power: x.power, tick: x.tick, place: x.place });
      }
    }
    for (const x of before.pins)
      if (!after.pins.some((y) => y.id === x.id)) {
        counts.withdrawals += 1;
        track('pin_withdrawn', { kind: x.kind, fromTick: x.tick, toTick: null });
      }
    if (result.reopened.length > 0)
      track('reopened', {
        paid: result.breaks.length,
        unpaid: result.reopened.length - result.breaks.length,
      });
  }

  /** The earliest tick at which two pin lists differ (assist mode's disruption check starts there). */
  function editTickOf(a: readonly Pin[], b: readonly Pin[]): number {
    const key = (x: Pin) => JSON.stringify(x);
    const inB = new Set(b.map(key));
    const inA = new Set(a.map(key));
    const ticks = [
      ...a.filter((x) => !inB.has(key(x))).map((x) => x.tick),
      ...b.filter((x) => !inA.has(key(x))).map((x) => x.tick),
    ];
    return ticks.length > 0 ? Math.min(...ticks) : 0;
  }

  /** Clears the controller for a player state (a new game, a saved one); returns the new session. */
  function reset(p: PlayerState): number {
    const me = ++session;
    player = p;
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
    bootNotice = null;
    newPlaythrough(p);
    return me;
  }

  /** The day's first re-run, from tick 0 to the frontier limit; `then` runs on its result. */
  function firstRun(me: number, then: () => void): void {
    void recompute(player, false, () => undefined).then((reply) => {
      if (me !== session) return;
      if (reply.kind !== 'result') {
        console.error(`recompute: ${reply.kind === 'error' ? reply.message : reply.kind}`);
        return;
      }
      view = viewOf(reply.result);
      span = Math.max(view.edge, minSpan());
      then();
      sync();
    });
  }

  function start(seed: number, pins: Pin[], revealAll: boolean) {
    let p: PlayerState = { ...newGame(c, seed, seed), pins, nextSeq: pins.length + 1 };
    if (revealAll) p = { ...p, revealed: c.nodes.map((n) => n.id).sort() };
    const me = reset(p);
    phase = 'play';
    ready = true;
    sync();
    firstRun(me, started);
  }

  function newDay(requested: number, seed: number | null, notice?: string) {
    const me = reset(newGame(c, requested, seed ?? requested));
    phase = 'teaser';
    teaserUntil = performance.now() + flow.teaserMs;
    ready = false;
    bootNotice = notice ?? null;
    sync();
    const go = (vetted: number) => {
      if (me !== session) return;
      player = newGame(c, requested, vetted);
      firstRun(me, () => {
        ready = true;
        if (phase === 'preparing') phase = 'play';
        persist();
        started();
      });
    };
    if (seed !== null) go(seed);
    else
      void sim.request({ kind: 'vet', requestedSeed: requested }).then((r) => {
        if (r.kind === 'vetted') go(r.seed);
        else console.error(`vet: ${r.kind === 'error' ? r.message : r.kind}`);
      });
  }

  function resume(saved: PlayerState) {
    const me = reset(saved);
    phase = 'preparing';
    ready = false;
    sync();
    firstRun(me, () => {
      player = { ...player, playhead: Math.min(saved.playhead, view.edge) };
      lastHead = player.playhead;
      ready = true;
      phase = 'play';
      started();
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
    flushBack();
    if (r.error) {
      refuse(r.error, at);
      sync();
      return;
    }
    if (pinsKey(r.player.pins) === pinsKey(player.pins)) {
      markArrived(player, r.player);
      player = r.player;
      persist();
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
      disrupted: [],
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
      // assist mode: forming stories the edit drops by more than the knob's share (06 §2)
      const before = pending.before;
      const disrupted = settings.assist
        ? disruptions(
            before.player,
            c,
            before.view.frames,
            reply.result.frames,
            editTickOf(before.player.pins, after.pins),
          )
        : [];
      view = { ...viewOf(reply.result), streamedUpTo: null };
      if (notice.alert || disrupted.length > 0) {
        pending = { ...pending, phase: 'alert', notice, disrupted };
        sync();
      } else land();
    });
  }

  /** `break_alert` (07 §6): the alert was answered. */
  function trackAlert(confirmed: boolean): void {
    if (pending?.phase !== 'alert' || !pending.notice) return;
    const n = pending.notice;
    track('break_alert', {
      count: n.breaks.length + n.moves.length + pending.disrupted.length,
      confirmed,
    });
  }

  function cancelEdit(): void {
    if (!pending) return;
    trackAlert(false);
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
    trackAlert(true);
    trackEdit(before.player, p.after, result);
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
    lastHead = player.playhead; // an edit pulling the playhead back is not the player scrolling back
    // what the hints read (06 §7): a card on a protagonist, a lure placed
    if (
      pinnedOnProtagonistAt === null &&
      committed.pins.some(
        (x) => x.kind === 'card' && 'cat' in x.target && committed.followed.includes(x.target.cat),
      )
    )
      pinnedOnProtagonistAt = nowMs;
    lurePlaced ||= committed.pins.some((x) => x.kind === 'power' && x.power === lureId);
    persist();
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
    // telemetry (07 §6): each storylet state watched the first time, the anchor
    maxPlayed = Math.max(maxPlayed, reply.fact.tick + 1);
    for (const st of reply.fact.summary.storylets)
      if (!watchedStates.has(st)) {
        watchedStates.add(st);
        track('story_watched', { state: st, tick: reply.fact.tick });
      }
    if (!hadAnchor && player.anchorWatched) {
      hadAnchor = true;
      track('anchor_reached', {
        realSeconds: Math.round(performance.now() / 1000),
        pins: counts.pins,
        withdrawals: counts.withdrawals,
        scrollBacks: counts.scrollBacks,
        powers: counts.powers,
        gazes: counts.gazes,
      });
    }
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
      maxPlayed = Math.max(maxPlayed, t + 1);
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
    get content() {
      return c;
    },
    ui,
    now: () => ({ player, view, shuttle, frac }),
    start,
    newDay,
    resume,
    skipTeaser() {
      teaserUntil = 0;
    },
    dismissHint() {
      hints = dismissHint(hints);
      sync();
    },
    keepPlaying() {
      endOpen = false;
      endClosed = true;
      sync();
    },
    setSettings(patch) {
      settings = { ...settings, ...patch };
      persist();
      sync();
    },
    persist,
    press(key) {
      if (pending || confirmStep || phase !== 'play') return;
      shuttle = press(c, shuttle, key);
      acc = 0;
      if (shuttle.dir === 'pause') persist();
      sync();
    },
    scrubTo(tick) {
      if (pending || phase !== 'play') return;
      const r = setPlayhead(player, view, c, {
        tick: Math.max(0, Math.min(tick, view.edge)),
      });
      if (r.error) return;
      player = r.player;
      frac = 0;
      scrubbing = true;
      shown = [];
      persist();
      sync();
    },
    stepForward() {
      if (!pending && !confirmStep && phase === 'play') queued += 1;
    },
    frame(dtMs, nowMs) {
      if (phase !== 'play') {
        if (phase === 'teaser' && nowMs >= teaserUntil) {
          phase = ready ? 'play' : 'preparing';
          see('teaser');
          sync();
        }
        return;
      }
      // M8: telemetry's backward moves and the fray
      if (player.playhead < lastHead) back = { from: back?.from ?? lastHead, to: player.playhead };
      else if (back && player.playhead > back.to) flushBack();
      const atFray =
        view.end.kind === 'fray' && view.streamedUpTo === null && player.playhead === view.edge;
      if (atFray && !wasAtFray) track('fray_seen', { tick: player.playhead });
      wasAtFray = atFray;
      // M7: what the hints read, the hints, the end screen, saving during playback
      if (player.playhead < lastHead) ticksAfterBack ??= 0;
      else if (ticksAfterBack !== null) ticksAfterBack += player.playhead - lastHead;
      lastHead = player.playhead;
      if (shuttle.dir === 'fwd' && !pending && !confirmStep) {
        playbackMs += dtMs;
        if (nowMs - lastSave >= flow.saveEveryMs) persist();
      }
      if (nowMs - lastHints >= HINTS_EVERY_MS) {
        lastHints = nowMs;
        updateHints(nowMs);
        checkEnd(nowMs);
      }
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
      if (pending || confirmStep || phase !== 'play') return;
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
      // the `others` hint (06 §7): one roll per card held (presentation only, never the simulation's)
      const f = view.frames[player.playhead];
      if ('card' in next && f && !heldWithOther)
        heldWithOther = othersInView(f, player.followed, player.revealed, () =>
          Math.floor(Math.random() * 1_000_000),
        );
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
      if (pending || confirmStep || !held || phase !== 'play') return;
      pickCard(held, target, at);
    },
    inspectObject(object, at) {
      if (pending || confirmStep || phase !== 'play') return;
      whenIdle(() => {
        const r = inspect(player, view, c, { object });
        if (r.error) {
          refuse(r.error, at ?? locate({ object }) ?? undefined);
          sync();
          return;
        }
        const card = r.rewards?.flatMap((x) => x.cards ?? [])[0] ?? null;
        inspecting = { object, card };
        track('inspect', { object, tick: player.playhead });
        apply(r);
      });
    },
    closeInspect() {
      inspecting = null;
      sync();
    },
    act(fn, at) {
      if (pending || confirmStep || phase !== 'play') return;
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
    retune(next) {
      c = next;
      flow = c.tuning.flow;
      gazeId = powerWith('collapse');
      lureId = powerWith('attract');
      const p = { ...(pending ? pending.before.player : player), seen };
      ++session; // replies for the old content are dropped
      phase = 'preparing';
      ready = false;
      sync();
      void sim.request({ kind: 'init', tuning: next.tuning }).then((reply) => {
        if (reply.kind === 'ready') resume(p);
        else console.error(`init: ${reply.kind === 'error' ? reply.message : reply.kind}`);
      });
    },
    computeStrain() {
      if (pending || busy || strainRunning || phase !== 'play') return;
      shuttle = PAUSED;
      strainRunning = true;
      sync();
      const me = session;
      void sim
        .request({
          kind: 'recompute',
          seed: player.seed,
          pins: player.pins,
          watched: player.watched,
          frontier: player.frontier,
          preview: false,
          strain: true,
        })
        .then((reply) => {
          if (me !== session) return;
          strainRunning = false;
          if (reply.kind === 'result') view = { ...viewOf(reply.result), samples: view.samples };
          sync();
        });
    },
    debug(action) {
      if (pending || confirmStep || phase !== 'play') return;
      whenIdle(() => {
        const next = debugAction(player, c, action);
        // watched facts live in the worker's timeline too: the day is re-run without them
        if (action === 'clearWatched') {
          resume({ ...next, seen });
          return;
        }
        markArrived(player, next);
        player = next;
        persist();
        sync();
      });
    },
    track,
    endSession() {
      flushBack();
      track('session_end', {
        realSeconds: Math.round(performance.now() / 1000),
        story: player.frontier.story,
        lanternEdge: view.edge,
        anchorWatched: player.anchorWatched,
      });
    },
  };
}

/** The frame at the playhead, or null before the first one has arrived. */
export const frameAt = (view: View, tick: number): Frame | null => view.frames[tick] ?? null;
