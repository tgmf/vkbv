// The simulation host (02 §3): everything the worker does, with its outside world passed in, so the
// same code runs in the worker and headless in Node (tests). It never runs a clock of its own: the UI
// drives time; `now` only measures a re-run and paces its streaming.
import {
  ContentError,
  loadChapter,
  loadTuning,
  parsePinSets,
  type ChapterFiles,
} from '../content/load';
import type { Content } from '../content/schemas/content';
import { fogSetup, type FogSetup } from '../sim/fog';
import { runHistory, type History } from '../sim/history';
import { advance, type Wave } from '../sim/lantern';
import { followedCats } from '../sim/readers';
import { extendEdge, rerun, type Timeline } from '../sim/recompute';
import type { Frame, Pin } from '../sim/types';
import { vet } from '../sim/vet';
import { inspectView } from './inspect';
import type { MainToWorker, WorkerToMain } from './protocol';

export interface HostFiles {
  chapter: ChapterFiles;
  tuning: unknown;
  pinsets: unknown;
}

export interface HostDeps {
  post: (message: WorkerToMain) => void;
  /** Runs `fn` later, after messages that arrived meanwhile (the worker: through a MessageChannel). */
  schedule: (fn: () => void) => void;
  /** Milliseconds, for the re-run's time and its streaming pace. */
  now: () => number;
}

export interface Host {
  receive: (msg: MainToWorker) => void;
}

type Recompute = Extract<MainToWorker, { kind: 'recompute' }>;

export function createHost(files: HostFiles, deps: HostDeps): Host {
  const { post } = deps;
  let content: Content | null = null;
  let pinsets: Record<string, Pin[]> = {};
  let setups: Record<number, FogSetup> = {};
  /** The current (committed) wave, and the last finished preview. */
  let current: Timeline | null = null;
  let preview: Timeline | null = null;
  /** The running re-run; a newer `recompute` replaces it, and the old one posts nothing more. */
  let job: object | null = null;
  /** The dev inspector's history, and the last reference history of `debugHistory`. */
  let inspected: { key: string; history: History } | null = null;
  let reference: { key: string; history: History } | null = null;

  const setupOf = (c: Content, seed: number): FogSetup => (setups[seed] ??= fogSetup(c, seed));
  const fail = (reqId: number, message: string) => post({ kind: 'error', reqId, message });

  function startRerun(c: Content, msg: Recompute): void {
    const me = {};
    job = me;
    preview = null; // a stale preview can no longer be committed
    const t0 = deps.now();
    const it = rerun(setupOf(c, msg.seed), current, {
      pins: msg.pins,
      watched: msg.watched,
      frontier: msg.frontier,
      strain: msg.strain ?? false,
    });
    let pending: Frame[] = [];
    let from = -1;
    const flush = () => {
      if (pending.length === 0) return;
      const frames = { from, frames: pending };
      post({ kind: 'rerun', reqId: msg.reqId, upTo: from + pending.length - 1, frames });
      from += pending.length;
      pending = [];
    };
    const slice = () => {
      if (job !== me) return;
      const start = deps.now();
      for (;;) {
        const r = it.next();
        if (r.done) {
          flush();
          job = null;
          const timeline = r.value;
          timeline.result.stats.ms = Math.round(deps.now() - t0);
          if (msg.preview) preview = timeline;
          else current = timeline;
          post({ kind: 'result', reqId: msg.reqId, result: timeline.result });
          return;
        }
        if (from < 0) from = r.value.tick;
        pending.push(r.value.frame);
        if (deps.now() - start >= c.tuning.waves.streamEveryMs) break;
      }
      flush();
      deps.schedule(slice);
    };
    slice();
  }

  /** The lantern at `tick` of a timeline, replayed from its last checkpoint at or before it. */
  function lanternAt(c: Content, tl: Timeline, tick: number): { w: Wave; next: Wave | null } {
    const setup = setupOf(c, tl.seed);
    const followed = followedCats(c);
    const every = c.tuning.waves.checkpointEvery;
    const step = (w: Wave) => advance(setup, w, tl.pins, followed, tl.watched);
    let w = tl.checkpoints[Math.min(Math.trunc(tick / every), tl.checkpoints.length - 1)];
    if (!w) throw new Error('a timeline without checkpoints');
    while (w.lantern.sim.tick < tick) w = step(w);
    return { w, next: tick < tl.result.edge ? step(w) : null };
  }

  function handle(msg: MainToWorker): void {
    if (msg.kind === 'init') {
      try {
        // The content is loaded and cross-checked in this thread too (02 §5).
        content = loadChapter(
          files.chapter,
          loadTuning({ ...(files.tuning as object), ...msg.tuning }),
        );
        pinsets = parsePinSets(files.pinsets, content);
      } catch (e) {
        if (!(e instanceof ContentError)) throw e;
        content = null;
        return fail(msg.reqId, e.message);
      }
      setups = {};
      current = preview = job = inspected = reference = null;
      return post({ kind: 'ready', reqId: msg.reqId });
    }
    const c = content;
    if (!c) return fail(msg.reqId, 'not initialised');
    switch (msg.kind) {
      case 'vet': {
        // live vetting of a typed or bookmarked seed, with the game's own knobs (04 §2, M4-1)
        const missing = c.tuning.vetting.solutions.filter((name) => !pinsets[name]);
        if (missing.length > 0) return fail(msg.reqId, `unknown pin sets: ${missing.join(', ')}`);
        const solutions = c.tuning.vetting.solutions.map((name) => pinsets[name] ?? []);
        const { seed } = vet(c, msg.requestedSeed, solutions);
        return post({ kind: 'vetted', reqId: msg.reqId, seed });
      }
      case 'recompute':
        return startRerun(c, msg);
      case 'commit':
        if (!preview) return fail(msg.reqId, 'no finished preview to commit');
        current = preview;
        preview = null;
        return post({ kind: 'ready', reqId: msg.reqId });
      case 'debugHistory': {
        const tl = current;
        if (!tl) return fail(msg.reqId, 'no current wave');
        if (msg.index === 0) {
          // the lantern state at the tick, and the events of the step from it
          if (msg.tick < 0 || msg.tick > tl.result.edge)
            return fail(msg.reqId, `tick ${msg.tick} is past the lantern edge ${tl.result.edge}`);
          const { w, next } = lanternAt(c, tl, msg.tick);
          const events = next ? next.tickEvents : [];
          return post({ kind: 'history', reqId: msg.reqId, state: w.lantern.sim, events });
        }
        const key = `${tl.seed}|${msg.index}|${JSON.stringify(tl.pins)}`;
        if (reference?.key !== key)
          reference = { key, history: runHistory(c, tl.seed, msg.index, tl.pins) };
        const { states, events } = reference.history;
        const state = states[msg.tick];
        if (!state) return fail(msg.reqId, `tick ${msg.tick} is past the history's end`);
        return post({ kind: 'history', reqId: msg.reqId, state, events: events[msg.tick] ?? [] });
      }
      case 'inspect': {
        // dev inspector (docs/milestones/M1.5-inspector.md)
        const key = `${msg.seed}|${msg.stream}|${msg.pinset}`;
        if (inspected?.key !== key)
          inspected = {
            key,
            history: runHistory(c, msg.seed, msg.stream, pinsets[msg.pinset] ?? []),
          };
        const view = inspectView(c, inspected.history, msg.tick);
        return post({ kind: 'inspected', reqId: msg.reqId, view });
      }
      case 'observe': {
        // playback (03 §15.2): behind the edge the timeline already holds the tick's watched fact;
        // at the edge the lantern and the fog advance one tick and the edge moves with it
        const tl = current;
        if (!tl) return fail(msg.reqId, 'no current wave');
        const edge = tl.result.edge;
        if (msg.tick < 0 || msg.tick > edge)
          return fail(msg.reqId, `tick ${msg.tick} is past the lantern edge ${edge}`);
        const fact = tl.views[msg.tick]?.[msg.cat];
        if (!fact) return fail(msg.reqId, `no watched fact of ${msg.cat} at ${msg.tick}`);
        let next = tl;
        if (msg.tick === edge) {
          const ext = extendEdge(setupOf(c, tl.seed), tl);
          if (!ext) return fail(msg.reqId, `the timeline ends at ${edge}`);
          next = ext;
        }
        // the fact joins the timeline's watched facts, so the next edit does not take it for one
        const watched = next.watched.some((f) => f.tick === fact.tick && f.cat === fact.cat)
          ? next.watched
          : [...next.watched, fact].sort((a, b) => a.tick - b.tick || (a.cat < b.cat ? -1 : 1));
        current = { ...next, watched };
        const r = current.result;
        const frames = { from: edge + 1, frames: r.frames.slice(edge + 1) };
        const gazeFacts = r.gazeFacts.filter((g) => g.tick > edge);
        return post({
          kind: 'observed',
          reqId: msg.reqId,
          fact,
          frames,
          gazeFacts,
          edge: r.edge,
          end: r.end,
        });
      }
      default: {
        const never: never = msg;
        throw new Error(`unknown message ${JSON.stringify(never)}`);
      }
    }
  }

  return { receive: handle };
}
