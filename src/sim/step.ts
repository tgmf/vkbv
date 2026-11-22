// One step of one history (spec 03 §6): eight phases in a fixed order.
import { body, catState, clampBase, decide, decisionKey, insertSorted, reaches } from './cats';
import { hasFact, test } from './conditions';
import { addFact, emitNamed } from './effects';
import { perceives, type Source } from './perception';
import { pinsPhase } from './pins';
import { siftingPhase } from './sifting';
import { catNode, catPos, dist2, inWindow, isWindowEnd, nodePos, type PathMemo } from './space';
import { openChoiceActors, storyletsPhase } from './storylets';
import type {
  BranchPoint,
  CatId,
  Content,
  Ctx,
  LanternArgs,
  Pin,
  SimEvent,
  SimState,
  Streams,
} from './types';
import { isLive, need, newDecisionMemo, type DecisionMemo } from './types';

/** Thrown inside a step when it meets a branch point beyond the decided list. */
interface NeedBranch {
  needBranch: BranchPoint;
}
const isNeedBranch = (e: unknown): e is NeedBranch =>
  typeof e === 'object' && e !== null && 'needBranch' in e;

export interface StepResult {
  state: SimState | null; // null when it stopped at a branch point
  events: SimEvent[];
  branchPoint?: BranchPoint;
}

/**
 * Advances one tick. `branch` holds the outcomes already decided for this tick, in the order the
 * branch points are met; past its end the step stops and returns the branch point (03 §6).
 * A function instead resolves every branch point as it comes (single-history sampling).
 * `lantern` names the live cats and the storylets held by the fog (03 §13.4): phases 3, 6 and 7
 * skip fogged cats, phase 4 skips held storylets, phase 5 skips detectors that involve a fogged
 * cat. Without it every cat is live and nothing is held, exactly as in single-history mode.
 */
export function step(
  c: Content,
  seed: number,
  streams: Streams,
  state: SimState,
  pins: readonly Pin[],
  branch: readonly number[] | ((bp: BranchPoint) => number),
  memo: PathMemo = {},
  lantern: LanternArgs | null = null,
  decisions: DecisionMemo = newDecisionMemo(),
): StepResult {
  let used = 0;
  const pick =
    typeof branch === 'function'
      ? branch
      : (bp: BranchPoint) => {
          const k = branch[used++];
          if (k === undefined) {
            const signal: NeedBranch = { needBranch: bp };
            throw signal; // eslint-disable-line @typescript-eslint/only-throw-error -- a control signal, caught below
          }
          return k;
        };
  const ctx: Ctx = {
    c,
    seed,
    streams,
    s: cloneState(state),
    prev: state,
    t: state.tick,
    events: [],
    pins,
    pick,
    chanceN: 0,
    memo,
    decisions,
    ...(lantern && { live: lantern.live, held: lantern.held }),
    ...(lantern?.dwell && { dwell: lantern.dwell }),
    ...(lantern?.fog && { fog: lantern.fog }),
  };
  try {
    pinsAndEffects(ctx); // 1
    weather(ctx); // 2
    for (const def of c.cats) if (isLive(ctx, def.id)) body(ctx, def.id); // 3
    storyletsPhase(ctx); // 4
    siftingPhase(ctx); // 5
    decisionsPhase(ctx); // 6
    perception(ctx); // 7
    anchor(ctx); // 8
  } catch (e) {
    if (isNeedBranch(e)) return { state: null, events: ctx.events, branchPoint: e.needBranch };
    throw e;
  }
  ctx.s.tick = ctx.t + 1;
  return { state: ctx.s, events: ctx.events };
}

/**
 * A copy of the state that a step may change in place. Everything a phase mutates is copied;
 * what is only ever replaced wholesale (flag entries, roles, pool matches) or never changes
 * (a cat's `initial`) is shared. Equal to a JSON round-trip (tested); several times faster.
 */
export function cloneState(s: SimState): SimState {
  const cats: SimState['cats'] = {};
  for (const [id, c] of Object.entries(s.cats))
    cats[id] = {
      ...c,
      pos: { ...c.pos },
      route: [...c.route],
      interrupt: c.interrupt && { ...c.interrupt },
      base: { ...c.base },
      mods: c.mods.map((m) => ({ ...m })),
      touchedBy: [...c.touchedBy],
      knowsClosed: [...c.knowsClosed],
      heard: [...c.heard],
      voiceAt: { ...c.voiceAt },
    };
  const storylets: SimState['storylets'] = {};
  for (const [id, r] of Object.entries(s.storylets)) storylets[id] = { ...r };
  return {
    tick: s.tick,
    weather: { ...s.weather },
    facts: [...s.facts],
    flags: { ...s.flags },
    counters: { ...s.counters },
    cats,
    storylets,
    pools: { ...s.pools },
    effects: s.effects.map((e) => ({ ...e })),
    pins: { ...s.pins },
    echoes: [...s.echoes],
    anchor: { ...s.anchor },
  };
}

/** Phase 1: last tick's socialSpread echoes, pins, then running effects, flags and their lifetimes. */
function pinsAndEffects(ctx: Ctx): void {
  const { s, t } = ctx;
  for (const echo of s.echoes) {
    const cs = catState(ctx, echo.cat);
    emitNamed(
      ctx,
      echo.name,
      { pos: catPos(ctx.c, cs), node: catNode(cs) },
      {
        radiusM: echo.radiusM,
        hops: echo.hops,
        source: echo.cat,
      },
    );
  }
  s.echoes = [];
  pinsPhase(ctx);
  for (const e of s.effects) e.left -= 1;
  s.effects = s.effects.filter((e) => e.left > 0);
  for (const key of Object.keys(s.flags).sort()) {
    const until = s.flags[key]?.until;
    if (until !== null && until !== undefined && until <= t) delete s.flags[key];
  }
}

/** Phase 2: rain starts and stops as hazards inside their windows, certain at the window's end (03 §7). */
function weather(ctx: Ctx): void {
  const { c, s, t } = ctx;
  const w = c.world.weather;
  const change = (now: 'rain' | 'dry') => {
    s.weather.now = now;
    const name = now === 'rain' ? 'rainStarted' : 'rainStopped';
    if (now === 'rain') s.weather.startedAt = t;
    else s.weather.stoppedAt = t;
    addFact(ctx, name);
    emitNamed(ctx, name, { pos: [0, 0], node: c.nodes[0]?.id ?? '' }, { global: true });
  };
  const hazard = (rule: typeof w.rainStart, key: string): boolean => {
    if (isWindowEnd(c, t, rule.window)) return true;
    const ppm = rule.perMille * 1000;
    return (
      ctx.pick({
        key,
        options: [
          { label: 'change', ppm },
          { label: 'stay', ppm: 1_000_000 - ppm },
        ],
      }) === 0
    );
  };
  if (s.weather.now === 'dry' && s.weather.startedAt === null) {
    if (inWindow(c, t, w.rainStart.window) && hazard(w.rainStart, 'weather:rain')) change('rain');
  } else if (s.weather.now === 'rain' && s.weather.startedAt !== null) {
    const longEnough = t - s.weather.startedAt >= (w.rainStop.minDurationTicks ?? 0);
    if (longEnough && inWindow(c, t, w.rainStop.window) && hazard(w.rainStop, 'weather:stop'))
      change('dry');
  }
}

/**
 * Phase 6: free decisions at triggers (03 §6, §8.2). At once: the cat arrived with an empty route,
 * control returned to it (a storylet's activity, a `delay`), it was blocked or a built-in ended,
 * or an offer was born. On decision ticks also: its decision key changed, or its interrupt ended.
 */
function decisionsPhase(ctx: Ctx): void {
  const { c, t } = ctx;
  const decisionTick = t % c.decisionEveryTicks === 0;
  const busy = openChoiceActors(ctx);
  for (const def of c.cats) {
    const id = def.id;
    if (!isLive(ctx, id) || ctx.dwell?.includes(id)) continue; // a placed cat dwells (03 §15.1)
    const cs = catState(ctx, id);
    if (cs.control !== 'free' || cs.interrupt || !('at' in cs.pos) || busy.includes(id)) continue;
    const was = need(ctx.prev.cats, id, 'cat');
    const ended = ctx.events.some(
      (e) => (e.type === 'activityFinished' || e.type === 'blocked') && e.cat === id,
    );
    const arrived =
      cs.route.length === 0 && ctx.events.some((e) => e.type === 'arrive' && e.cat === id);
    const returned = was.control !== 'free';
    const offered = ctx.s.effects.some(
      (e) => e.born === t && (e.kind === 'attract' || e.kind === 'repel') && reaches(ctx, e, id),
    );
    const atOnce = ended || arrived || returned || offered;
    if (atOnce || (decisionTick && (was.interrupt !== null || decisionKey(ctx, id) !== cs.lastKey)))
      decide(ctx, id);
  }
}

// --- phase 7: perception (03 §4) ------------------------------------------------------------------

type Heard = Extract<SimEvent, { type: 'emit' | 'voice' }>;
const nameOf = (e: Heard): string => (e.type === 'voice' ? 'voice' : e.name);
const isSound = (e: Heard): boolean => e.type === 'voice' || e.radiusM !== null;

/** Events a cat perceives without a range check (03 §4). */
function always(ctx: Ctx, id: CatId, e: Heard): boolean {
  if (e.type === 'voice') return e.cat === id;
  if (e.global || e.source === id || e.to === id) return true;
  const p = catPos(ctx.c, catState(ctx, id));
  if (p[0] === e.pos[0] && p[1] === e.pos[1]) return true;
  // QUESTION(M1-2): role holders perceive every event of their storylet (03 §4), so Marti, bound in
  // crew_chatter, always overhears the tale; the slice meant it to pass only the open window.
  const r = e.storylet ? ctx.s.storylets[e.storylet] : undefined;
  return r !== undefined && Object.values(r.roles).some((list) => list.includes(id));
}

const sourceOf = (e: Heard): Source => ({ pos: e.pos, node: e.node, radiusM: e.radiusM });

function perception(ctx: Ctx): void {
  const { c, s } = ctx;
  const heardEvents = (): Heard[] =>
    ctx.events.filter((e): e is Heard => e.type === 'emit' || e.type === 'voice');
  // Fogged cats perceive only through the fog (decisions.md, M2).
  const perceivers = c.cats.filter((def) => isLive(ctx, def.id));

  // Each cat follows at most `voices` sound events per tick: the nearest ones, ties by emission order.
  const sounds = heardEvents();
  const allowed: Record<CatId, Heard[]> = {};
  for (const def of perceivers) {
    const p = catPos(c, catState(ctx, def.id));
    allowed[def.id] = sounds
      .filter(
        (e) =>
          isSound(e) && !always(ctx, def.id, e) && perceives(c, s, def.id, sourceOf(e), 'hearing'),
      )
      .map((e, i) => ({ e, i, d: dist2(p, e.pos) }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .slice(0, def.perception.voices)
      .map((x) => x.e);
  }

  const apply = (id: CatId, e: Heard) => {
    const cs = catState(ctx, id);
    const name = nameOf(e);
    const first = insertSorted(cs.heard, name);
    for (const h of c.hooks) {
      const base = cs.base[h.id];
      if (base === undefined) continue;
      for (const r of h.rise)
        if ('onEvent' in r && r.onEvent === name)
          cs.base[h.id] = clampBase(c, h.id, (cs.base[h.id] ?? base) + r.add);
    }
    if (e.type === 'emit') {
      const fact = e.factIfPerceivedBy?.[id];
      if (fact) addFact(ctx, fact);
      if (first && e.hops > 0 && e.source !== id && e.radiusM !== null)
        s.echoes.push({ name, cat: id, radiusM: e.radiusM, hops: e.hops - 1 });
    }
  };

  let objectsChecked = false;
  for (let i = 0; ; i++) {
    const list = heardEvents();
    const e = list[i];
    if (e === undefined) {
      if (objectsChecked) break;
      objectsChecked = true;
      perceiveObjects(ctx);
      i--;
      continue;
    }
    for (const def of perceivers) {
      const ok =
        always(ctx, def.id, e) ||
        (isSound(e)
          ? (allowed[def.id] ?? []).includes(e)
          : perceives(c, s, def.id, sourceOf(e), 'sight'));
      if (ok) apply(def.id, e);
    }
  }
}

/** Objects with onPerceived: the first tick that cat sees one, it emits and sets its fact (03 §4). */
function perceiveObjects(ctx: Ctx): void {
  const { c, s } = ctx;
  for (const o of c.objects) {
    const op = o.onPerceived;
    if (!op || hasFact(ctx, `perceived:${o.id}`) || !s.cats[op.by] || !isLive(ctx, op.by)) continue;
    if (o.visibleWhen && !test(ctx, o.visibleWhen, {})) continue;
    const src: Source = { pos: nodePos(c, o.node), node: o.node, radiusM: null };
    if (!perceives(c, s, op.by, src, 'sight')) continue;
    addFact(ctx, `perceived:${o.id}`);
    if (op.fact) addFact(ctx, op.fact);
    emitNamed(ctx, op.emit, src, { source: null });
  }
}

/** Phase 8: the anchor is reached when its fact is set; dead when fraysIf holds first (03 §6, §12.2). */
function anchor(ctx: Ctx): void {
  const { c, s, t } = ctx;
  if (s.anchor.reachedAt === null && hasFact(ctx, c.anchor.id)) {
    s.anchor.reachedAt = t;
    ctx.events.push({ tick: t, type: 'anchor', reached: true });
  }
  if (s.anchor.reachedAt === null && s.anchor.deadAt === null && test(ctx, c.anchor.fraysIf, {})) {
    s.anchor.deadAt = t;
    ctx.events.push({ tick: t, type: 'anchor', reached: false });
  }
}
