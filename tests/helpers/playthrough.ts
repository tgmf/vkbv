// A headless playthrough (M3): the worker's own code (`createHost`) in-process with a synchronous
// scheduler, a `PlayerState` and the latest view, as the UI will hold them. Edits are previewed, their
// break alert read, then committed; playback observes every tick and pays; scrubbing sends nothing.
import { createHost } from '../../src/bridge/host';
import type { Request, WorkerToMain } from '../../src/bridge/protocol';
import { loadChapter, loadTuning, type ChapterFiles } from '../../src/content/load';
import type { Tuning } from '../../src/content/schemas/tuning';
import {
  advance,
  applyPreview,
  previewNotice,
  setPlayhead,
  type ActionResult,
  type PreviewNotice,
  type Refusal,
} from '../../src/player/actions';
import { newGame, type PlayerState, type PlayerView, type Reward } from '../../src/player/state';
import { canonicalJson } from '../../src/sim/hash';
import type { Content, RecomputeResult } from '../../src/sim/types';

export interface Driver {
  readonly c: Content;
  player: PlayerState;
  view: PlayerView;
  /** Every reward paid so far, in order. */
  rewards: Reward[];
  /** Requests sent to the host so far. */
  sent: number;
  /** Vets a requested seed live (04 §2). */
  vet(requested: number): number;
  /** A new game on `seed` (already vetted) and its first re-run: the edge at 0. */
  start(requested: number, seed: number): void;
  /** Applies an action; an edit is previewed, then committed. Returns the refusal or the notice. */
  act(fn: (p: PlayerState, v: PlayerView, c: Content) => ActionResult): {
    error?: Refusal;
    notice?: PreviewNotice;
    preview?: RecomputeResult;
  };
  /** Playback to `tick`, observing every tick (live past the edge). Stops early where the timeline ends. */
  playTo(tick: number): void;
  /** Scrubs to `tick`, clamped to 0..edge. Sends nothing. */
  scrubTo(tick: number): void;
  /** Re-runs the current pins and watched facts (as loading a save does), committed at once. */
  rerun(): RecomputeResult;
}

export function driver(
  files: { chapter: ChapterFiles; tuning: unknown; pinsets: unknown },
  more: Partial<Tuning> = {},
): Driver {
  const queue: (() => void)[] = [];
  let reply: WorkerToMain | null = null;
  let reqId = 0;
  let clock = 0;
  const host = createHost(files, {
    post: (m) => {
      if (m.reqId === reqId && m.kind !== 'rerun') reply = m;
    },
    schedule: (fn) => queue.push(fn),
    now: () => clock++,
  });
  const c = loadChapter(files.chapter, loadTuning({ ...(files.tuning as object), ...more }));

  const d: Driver = {
    c,
    player: newGame(c, 1, 1),
    view: { frames: [], edge: 0, end: { kind: 'limit', tick: 0 }, gazeFacts: [] },
    rewards: [],
    sent: 0,
    vet: (requested) => {
      const r = request({ kind: 'vet', requestedSeed: requested });
      if (r.kind !== 'vetted') throw new Error(JSON.stringify(r));
      return r.seed;
    },
    start: (requested, seed) => {
      d.player = newGame(c, requested, seed);
      d.view = recompute(d.player, false);
    },
    act: (fn) => {
      const r = fn(d.player, d.view, c);
      if (r.error) return { error: r.error };
      d.rewards.push(...(r.rewards ?? []));
      if (canonicalJson(r.player.pins) === canonicalJson(d.player.pins)) {
        d.player = r.player;
        return {};
      }
      const preview = recompute(r.player, true);
      const notice = previewNotice(r.player, c, preview);
      const committed = applyPreview(r.player, d.view, c, { result: preview }).player;
      const ok = request({ kind: 'commit' });
      if (ok.kind !== 'ready') throw new Error(JSON.stringify(ok));
      d.player = committed;
      d.view = preview;
      // pins the new edge moved: the committed timeline is re-run with them (decisions.md, M3)
      if (canonicalJson(committed.pins) !== canonicalJson(r.player.pins))
        d.view = recompute(committed, false);
      return { notice, preview };
    },
    playTo: (tick) => {
      for (;;) {
        const p = d.player;
        const t = p.playhead;
        if (t >= tick) return;
        const P = p.followed[0] ?? '';
        const known = p.watched.some((f) => f.tick === t && f.cat === P);
        let fact = null;
        if (t === d.view.edge || !known) {
          const r = request({ kind: 'observe', tick: t, cat: P });
          if (r.kind === 'error') return; // the timeline ends here
          if (r.kind !== 'observed') throw new Error(JSON.stringify(r));
          fact = r.fact;
          d.view = {
            ...d.view,
            frames: [...d.view.frames.slice(0, r.frames.from), ...r.frames.frames],
            edge: r.edge,
            end: r.end,
            gazeFacts: [...d.view.gazeFacts, ...r.gazeFacts],
          };
        }
        const a = advance(p, d.view, c, { fact });
        if (a.error)
          throw new Error(
            `advance at ${t}: ${a.error} (edge ${d.view.edge}, ${JSON.stringify(d.view.end)}, frames ${d.view.frames.length}, known ${known})`,
          );
        d.player = a.player;
        d.rewards.push(...(a.rewards ?? []));
      }
    },
    rerun: () => recompute(d.player, false),
    scrubTo: (tick) => {
      const t = Math.max(0, Math.min(tick, d.view.edge));
      const r = setPlayhead(d.player, d.view, c, { tick: t });
      if (r.error) throw new Error(r.error);
      d.player = r.player;
    },
  };

  function request(msg: Request): WorkerToMain {
    reqId += 1;
    d.sent += 1;
    reply = null;
    host.receive({ ...msg, reqId });
    for (let fn = queue.shift(); fn; fn = queue.shift()) fn();
    const r = reply as WorkerToMain | null;
    if (!r) throw new Error(`no reply to ${msg.kind}`);
    return r;
  }

  function recompute(p: PlayerState, preview: boolean): RecomputeResult {
    const r = request({
      kind: 'recompute',
      seed: p.seed,
      pins: p.pins,
      watched: p.watched,
      frontier: p.frontier,
      preview,
    });
    if (r.kind !== 'result') throw new Error(JSON.stringify(r));
    return r.result;
  }

  request({ kind: 'init', tuning: more });
  return d;
}
