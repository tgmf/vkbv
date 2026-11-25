// The worker's host (02 §3), headless in Node: init, the streamed re-run, preview and commit, a newer
// re-run replacing a running one, live vetting, debugHistory. The tiny world, with a fake clock.
import { describe, expect, it } from 'vitest';
import { createHost } from '../../src/bridge/host';
import type { MainToWorker, Request, WorkerToMain } from '../../src/bridge/protocol';
import { readChapterDir } from '../../src/cli/files';
import { TUNING_FILE } from '../../src/content/chapter1';
import { loadChapter } from '../../src/content/load';
import type { Tuning } from '../../src/content/schemas/tuning';
import { fogSetup } from '../../src/sim/fog';
import { runHistory } from '../../src/sim/history';
import { advance, initialWave } from '../../src/sim/lantern';
import { rerunAll, type RerunRequest } from '../../src/sim/recompute';
import type { Frame, Frontier, Pin, RecomputeResult } from '../../src/sim/types';
import { vet, vettingContent } from '../../src/sim/vet';
import { TINY_DIR, tuning } from '../sim/helpers';

const chapter = readChapterDir(TINY_DIR);
const pinsets = { sets: { solution: ['glow@home.room@0', 'rumour@street.b@1'] } };

const glow: Pin = { id: 'g', seq: 1, tick: 10, kind: 'power', power: 'glow', place: 'home.room' };
const rumourAt = (tick: number, seq: number): Pin => ({
  id: `r${seq}`,
  seq,
  tick,
  kind: 'card',
  card: 'rumour',
  target: { place: 'street.b' },
  special: false,
});
const setup = fogSetup(loadChapter(chapter, tuning), 1);
/** A frontier that never limits: the re-run goes to the fray or the end. */
const open: Frontier = { story: 1000, pastTicks: 0, storylets: setup.main };
const recompute = (
  pins: Pin[],
  preview: boolean,
): Omit<Extract<MainToWorker, { kind: 'recompute' }>, 'reqId'> => ({
  kind: 'recompute',
  seed: 1,
  pins,
  watched: [],
  frontier: open,
  preview,
});
const req = (pins: Pin[]): RerunRequest => ({ pins, watched: [], frontier: open });

/** A host with a fake clock (1 ms per reading) and a scheduler the test runs by hand. */
function harness(more: Partial<Tuning> = {}) {
  const out: WorkerToMain[] = [];
  const queue: (() => void)[] = [];
  let clock = 0;
  let reqId = 0;
  const host = createHost(
    { chapter, tuning: TUNING_FILE, pinsets },
    { post: (m) => out.push(m), schedule: (fn) => queue.push(fn), now: () => clock++ },
  );
  const drain = () => {
    for (let fn = queue.shift(); fn; fn = queue.shift()) fn();
  };
  const send = (msg: Request): number => {
    host.receive({ ...msg, reqId: ++reqId });
    return reqId;
  };
  const replies = (id: number) => out.filter((m) => m.reqId === id);
  const last = (id: number): WorkerToMain | undefined => replies(id).at(-1);
  const resultOf = (id: number): RecomputeResult => {
    const r = last(id);
    if (r?.kind !== 'result') throw new Error(`no result for ${id}: ${JSON.stringify(r)}`);
    return r.result;
  };
  /** The first frame the re-run streamed: the checkpoint it replayed from. */
  const fromOf = (id: number): number => {
    const r = replies(id)[0];
    if (r?.kind !== 'rerun') throw new Error('no patch');
    return r.frames.from;
  };
  send({ kind: 'init', tuning: more });
  return { out, queue, drain, send, replies, last, resultOf, fromOf };
}

/** A result as `src/sim` returns it: the worker's time is the only difference. */
const noMs = (r: RecomputeResult): RecomputeResult => ({ ...r, stats: { ...r.stats, ms: 0 } });

describe('the worker host (02 §3)', () => {
  it('answers init with ready, and every request before it with an error', () => {
    const out: WorkerToMain[] = [];
    const host = createHost(
      { chapter, tuning: TUNING_FILE, pinsets },
      { post: (m) => out.push(m), schedule: () => {}, now: () => 0 },
    );
    host.receive({ kind: 'vet', reqId: 1, requestedSeed: 1 });
    host.receive({ kind: 'commit', reqId: 2 });
    host.receive({ kind: 'init', reqId: 3 });
    expect(out).toEqual([
      { kind: 'error', reqId: 1, message: 'not initialised' },
      { kind: 'error', reqId: 2, message: 'not initialised' },
      { kind: 'ready', reqId: 3 },
    ]);
  });

  it('streams a re-run in patches every waves.streamEveryMs, then the result of src/sim', () => {
    const h = harness({ waves: { ...tuning.waves, streamEveryMs: 8 } });
    const id = h.send(recompute([glow], false));
    expect(h.queue.length).toBe(1); // the first slice ran at once and yielded
    h.drain();
    const patches = h.replies(id).filter((m) => m.kind === 'rerun');
    expect(patches.length).toBeGreaterThan(5);
    const frames: Frame[] = [];
    let next = 0;
    for (const p of patches) {
      expect(p.frames.from).toBe(next);
      expect(p.upTo).toBe(p.frames.from + p.frames.frames.length - 1);
      expect(p.frames.frames.length).toBeLessThanOrEqual(8);
      frames.push(...p.frames.frames);
      next = p.upTo + 1;
    }
    const result = h.resultOf(id);
    expect(patches.at(-1)?.upTo).toBe(result.edge);
    expect(frames).toEqual(result.frames);
    expect(result.stats.ms).toBeGreaterThan(0);
    expect(noMs(result)).toEqual(rerunAll(setup, null, req([glow])).result);
  });

  it('keeps a preview apart until commit; a re-run starts from the committed wave', () => {
    const h = harness();
    const a = [glow];
    const c = [glow, rumourAt(70, 2)];
    const f = [...c, rumourAt(100, 3)];
    h.send(recompute(a, false));
    h.drain();
    // a preview of c, then of f: both against a (f differs from a at 70, checkpoint 60)
    h.send(recompute(c, true));
    h.drain();
    const pf = h.send(recompute(f, true));
    h.drain();
    expect(h.fromOf(pf)).toBe(60);
    // f's preview replaced c's; preview c again and commit it
    const pc = h.send(recompute(c, true));
    h.drain();
    const tlC = rerunAll(setup, null, req(c));
    expect(noMs(h.resultOf(pc))).toEqual(tlC.result);
    const ok = h.send({ kind: 'commit' });
    expect(h.last(ok)).toEqual({ kind: 'ready', reqId: ok });
    const again = h.send({ kind: 'commit' });
    expect(h.last(again)).toEqual({
      kind: 'error',
      reqId: again,
      message: 'no finished preview to commit',
    });
    // now f differs from the current wave (c) only at 100: the re-run replays from checkpoint 90
    const pf2 = h.send(recompute(f, true));
    h.drain();
    expect(h.fromOf(pf2)).toBe(90);
    expect(noMs(h.resultOf(pf2))).toEqual(rerunAll(setup, tlC, req(f)).result);
  });

  it('drops a running re-run when a newer one arrives', () => {
    const h = harness({ waves: { ...tuning.waves, streamEveryMs: 8 } });
    const first = h.send(recompute([glow], true));
    h.queue.shift()?.(); // one more slice of the first
    const seen = h.replies(first).length;
    const second = h.send(recompute([glow, rumourAt(40, 2)], true));
    h.drain();
    expect(h.replies(first).length).toBe(seen);
    expect(h.replies(first).every((m) => m.kind === 'rerun')).toBe(true);
    expect(noMs(h.resultOf(second))).toEqual(
      rerunAll(setup, null, req([glow, rumourAt(40, 2)])).result,
    );
  });

  it('vets a requested seed live with the coarser vetting.fog knobs (04 §2)', () => {
    const vetting = { ...tuning.vetting, solutions: ['solution'], requireFacts: ['heroOut'] };
    const h = harness({ vetting });
    const c = loadChapter(chapter, { ...tuning, vetting });
    const solution: Pin[] = [
      { id: 'solution.0', seq: 0, tick: 0, kind: 'power', power: 'glow', place: 'home.room' },
      { ...rumourAt(1, 1), id: 'solution.1' },
    ];
    for (const requested of [1, 3]) {
      const id = h.send({ kind: 'vet', requestedSeed: requested });
      const { seed } = vet(vettingContent(c), requested, [solution]);
      expect(h.last(id)).toEqual({ kind: 'vetted', reqId: id, seed });
    }
    const bad = harness({ vetting: { ...vetting, solutions: ['nope'] } });
    const id = bad.send({ kind: 'vet', requestedSeed: 1 });
    expect(bad.last(id)).toEqual({ kind: 'error', reqId: id, message: 'unknown pin sets: nope' });
  });

  it('debugHistory: index 0 is the lantern at a tick, i > 0 the reference history of stream i', () => {
    const h = harness();
    const none = h.send({ kind: 'debugHistory', tick: 0, index: 0 });
    expect(h.last(none)).toEqual({ kind: 'error', reqId: none, message: 'no current wave' });
    const run = h.send(recompute([glow], false));
    h.drain();
    const { edge } = h.resultOf(run);
    let w = initialWave(setup, ['hero']);
    for (let t = 0; t < 45; t++) w = advance(setup, w, [glow], ['hero']);
    const id = h.send({ kind: 'debugHistory', tick: 45, index: 0 });
    expect(h.last(id)).toEqual({
      kind: 'history',
      reqId: id,
      state: w.lantern.sim,
      events: advance(setup, w, [glow], ['hero']).tickEvents,
    });
    const past = h.send({ kind: 'debugHistory', tick: edge + 1, index: 0 });
    expect(h.last(past)?.kind).toBe('error');
    const ref = runHistory(setup.c, 1, 2, [glow]);
    const r = h.send({ kind: 'debugHistory', tick: 20, index: 2 });
    expect(h.last(r)).toEqual({
      kind: 'history',
      reqId: r,
      state: ref.states[20],
      events: ref.events[20],
    });
  });

  it('observe: live at the edge, read behind it, refused past it (03 §15.2)', () => {
    const h = harness();
    const none = h.send({ kind: 'observe', tick: 0, cat: 'hero' });
    expect(h.last(none)?.kind).toBe('error');
    const fresh: Frontier = { story: 0, pastTicks: 0, storylets: [] };
    const run = h.send({ ...recompute([glow], false), frontier: fresh });
    h.drain();
    expect(h.resultOf(run).edge).toBe(0); // a new game
    const facts = [];
    for (let t = 0; t < 64; t++) {
      const id = h.send({ kind: 'observe', tick: t, cat: 'hero' });
      const m = h.last(id);
      if (m?.kind !== 'observed') throw new Error(JSON.stringify(m));
      expect([m.fact.tick, m.edge, m.frames.from, m.frames.frames.length]).toEqual([t, t + 1, t + 1, 1]);
      facts.push(m.fact);
    }
    // the same facts and frames as a re-run that runs to the same tick
    const seen: Frontier = { story: 1000, pastTicks: 0, storylets: setup.main };
    const re = rerunAll(setup, null, { pins: [glow], watched: [], frontier: seen });
    expect(facts).toEqual(re.views.slice(0, 64).map((v) => v['hero']));
    // behind the edge: the fact the timeline holds, no frames, the edge unchanged
    const back = h.send({ kind: 'observe', tick: 12, cat: 'hero' });
    const m = h.last(back);
    expect(m?.kind === 'observed' && [m.fact, m.edge, m.frames.frames.length]).toEqual([
      facts[12],
      64,
      0,
    ]);
    const past = h.send({ kind: 'observe', tick: 65, cat: 'hero' });
    expect(h.last(past)?.kind).toBe('error');
    // the observed facts are part of the timeline: an edit with them replays from the checkpoint
    // before the edit (60), not from the first fact (0)
    const edit = h.send({ ...recompute([glow, rumourAt(62, 2)], true), watched: facts });
    h.drain();
    expect(h.fromOf(edit)).toBe(60);
  });
});
