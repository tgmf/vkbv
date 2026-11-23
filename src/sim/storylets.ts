// Storylets: activation, roles and exits (spec 03 §9.1, §9.2).
import type { StoryletDef } from '../content/schemas/chapter';
import { catState } from './cats';
import { cat, chance, test } from './conditions';
import { runEffects } from './effects';
import { PPM, softmax } from './math';
import { gateCounter } from './readers';
import { hazardRate, score } from './scores';
import { catPos, dist2, within } from './space';
import type { CatId, Ctx, Scope, StoryletRun } from './types';
import { need } from './types';

const run = (ctx: Ctx, id: string): StoryletRun => need(ctx.s.storylets, id, 'storylet');
const isTerminal = (def: StoryletDef, state: string): boolean =>
  (def.states[state]?.exits.length ?? 0) === 0;

/** Running: entered and not yet at a terminal state. */
export function isActive(ctx: Ctx, def: StoryletDef): boolean {
  const r = run(ctx, def.id);
  return r.state !== null && !isTerminal(def, r.state);
}

/** The first cat of each role, in the order the roles are written: the storylet's origin. */
const origin = (def: StoryletDef, roles: Record<string, CatId[]>): CatId | undefined => {
  for (const name of Object.keys(def.roles)) {
    const first = roles[name]?.[0];
    if (first) return first;
  }
  return undefined;
};

export const scopeOf = (def: StoryletDef, r: StoryletRun): Scope => ({
  roles: r.roles,
  storylet: def.id,
  origin: origin(def, r.roles),
});

/** Binds roles in the order written (03 §9.1); null when a required role cannot bind. */
export function bindRoles(ctx: Ctx, def: StoryletDef): Record<string, CatId[]> | null {
  const { c } = ctx;
  const roles: Record<string, CatId[]> = {};
  const bound = (id: CatId) => Object.values(roles).some((list) => list.includes(id));
  for (const [name, spec] of Object.entries(def.roles)) {
    if ('cat' in spec) {
      if (!ctx.s.cats[spec.cat]) return null;
      roles[name] = [spec.cat];
    } else if ('roleTag' in spec) {
      const all = c.cats.filter((x) => (x.roles ?? []).includes(spec.roleTag)).map((x) => x.id);
      const list = spec.bind === 'all' ? all : all.slice(0, 1);
      if (list.length === 0) return null;
      roles[name] = list;
    } else {
      const anchorCat = cat(ctx, { roles }, spec.nearCat);
      let best: CatId | null = null;
      if (anchorCat) {
        const at = catPos(c, catState(ctx, anchorCat));
        for (const x of c.cats) {
          if (x.id === anchorCat || bound(x.id)) continue;
          const p = catPos(c, catState(ctx, x.id));
          if (!within(at, p, spec.m)) continue;
          if (best === null || dist2(at, p) < dist2(at, catPos(c, catState(ctx, best))))
            best = x.id;
        }
      }
      if (best === null && !spec.optional) return null;
      roles[name] = best === null ? [] : [best];
    }
  }
  return roles;
}

/** Enters a state: records it, runs onEnter, emits the storylet event (03 §9.2). */
function enter(ctx: Ctx, def: StoryletDef, state: string): void {
  const r = run(ctx, def.id);
  r.state = state;
  r.enteredAt = ctx.t;
  if (isTerminal(def, state)) r.ended = true;
  runEffects(ctx, need(def.states, state, 'storylet state').onEnter ?? [], scopeOf(def, r));
  ctx.events.push({ tick: ctx.t, type: 'storylet', id: def.id, state, roles: r.roles });
}

/** Activates a storylet now if it may (not running, and `once` respected); used by trigger effects too. */
export function activate(ctx: Ctx, id: string, roles?: Record<string, CatId[]>): boolean {
  const def = need(ctx.c.storylet, id, 'storylet');
  if (ctx.held?.includes(id)) return false; // the fog holds it (03 §13.4)
  const r = run(ctx, id);
  if (isActive(ctx, def) || (def.once && r.ended)) return false;
  const bound = roles ?? bindRoles(ctx, def);
  if (!bound) return false;
  r.roles = bound;
  enter(ctx, def, def.start);
  return true;
}

/** Cats that are the actor of a choice exit whose gate holds in a running storylet (03 §8.3). */
export function openChoiceActors(ctx: Ctx): CatId[] {
  const actors: CatId[] = [];
  for (const def of ctx.c.storylets) {
    if (!isActive(ctx, def)) continue;
    const r = run(ctx, def.id);
    const scope = scopeOf(def, r);
    for (const e of need(def.states, r.state ?? '', 'storylet state').exits) {
      const actor = e.kind === 'choice' && e.actor ? cat(ctx, scope, e.actor) : null;
      if (actor && !actors.includes(actor) && (!e.gate || test(ctx, e.gate, scope)))
        actors.push(actor);
    }
  }
  return actors;
}

export const hasOpenChoice = (ctx: Ctx, catId: CatId): boolean =>
  openChoiceActors(ctx).includes(catId);

/**
 * The exits of a state, shared by the lantern and the fog (03 §9.2, §13.6): open auto exits with
 * their gate's ppm, hazard outcomes in ppm (`stay` last), and the choice exits with their actor.
 * A gate is open at `fog.gateThresholdPpm`; about live things every ppm is 0 or 1 000 000.
 */
export function exitOptions(
  ctx: Ctx,
  def: StoryletDef,
  state: string,
  scope: Scope,
  races: readonly string[] = [],
) {
  const exits = need(def.states, state, 'storylet state').exits;
  const thr = ctx.c.tuning.fog.gateThresholdPpm;
  // an auto exit gated on a race link's counter opens with any chance: the fog's case split holds
  // each side of the threshold (03 §13.5, §13.6; Tagir, 2026-11-23)
  const race = (e: (typeof exits)[number]) =>
    e.kind === 'auto' && races.includes(gateCounter(e.gate)?.counter ?? '');
  const open = exits
    .map((e) => ({ e, ppm: e.gate ? chance(ctx, e.gate, scope) : PPM }))
    .filter((x) => x.ppm >= thr || (x.ppm > 0 && race(x.e)));
  const autos = open.filter((x) => x.e.kind === 'auto').map((x) => ({ to: x.e.to, ppm: x.ppm }));
  const hazards = open.filter((x) => x.e.kind === 'hazard').map((x) => x.e);
  let rates = hazards.map((e) => hazardRate(ctx, e.perMille ?? 0, e.terms ?? [], scope));
  const sum = rates.reduce((a, b) => a + b, 0);
  if (sum > 1000) rates = rates.map((x) => Math.trunc((x * 1000) / sum));
  const used = rates.reduce((a, b) => a + b, 0);
  const hazard = rates.some((x) => x > 0)
    ? [
        ...hazards.map((e, i) => ({ label: e.to, ppm: (rates[i] ?? 0) * 1000 })),
        { label: 'stay', ppm: (1000 - used) * 1000 },
      ]
    : [];
  const choices = open.filter((x) => x.e.kind === 'choice').map((x) => x.e);
  const actorRef = choices[0]?.actor;
  return { autos, hazard, choices, actor: actorRef ? cat(ctx, scope, actorRef) : null };
}

/** The choice outcomes with the actor standing as its current state: exits, then `stay` (03 §9.2). */
export function choiceOptions(
  ctx: Ctx,
  def: StoryletDef,
  state: string,
  choices: readonly StoryletDef['states'][string]['exits'][number][],
  actor: CatId,
  scope: Scope,
): { label: string; ppm: number }[] {
  const scores = [
    ...choices.map((e) => score(ctx, e.score ?? { base: 0 }, scope)),
    need(def.states, state, 'storylet state').stayScore ?? 0,
  ];
  const ppm = softmax(scores, need(ctx.c.cat, actor, 'cat').temperatureTenths);
  return [
    ...choices.map((e, i) => ({ label: e.to, ppm: ppm[i] ?? 0 })),
    { label: 'stay', ppm: ppm[choices.length] ?? 0 },
  ];
}

/** At most one transition for a running storylet (03 §9.2). Hazards and choices are branch points. */
function transition(ctx: Ctx, def: StoryletDef): void {
  const r = run(ctx, def.id);
  const state = r.state ?? '';
  const scope = scopeOf(def, r);
  const { autos, hazard, choices, actor } = exitOptions(ctx, def, state, scope);

  const auto = autos[0];
  if (auto) return enter(ctx, def, auto.to);

  if (hazard.length > 0) {
    const k = ctx.pick({ key: `sl:${def.id}:hazard`, options: hazard });
    const fired = hazard[k];
    if (fired && k < hazard.length - 1) return enter(ctx, def, fired.label);
  }

  if (ctx.t % ctx.c.decisionEveryTicks !== 0) return;
  if (!actor || choices.length === 0) return;
  const as = catState(ctx, actor);
  if (!('at' in as.pos) || as.interrupt) return;
  const options = choiceOptions(ctx, def, state, choices, actor, scope);
  const k = ctx.pick({ key: `sl:${def.id}:choice`, options });
  const chosen = choices[k];
  if (chosen) enter(ctx, def, chosen.to);
}

/**
 * Phase 4: activation, then at most one transition per storylet, in file order.
 * QUESTION(M1-4): a storylet that activates this tick does not also transition this tick.
 */
export function storyletsPhase(ctx: Ctx): void {
  for (const def of ctx.c.storylets) {
    if (ctx.held?.includes(def.id)) continue; // the fog runs it (03 §13.4)
    if (isActive(ctx, def)) {
      transition(ctx, def);
      continue;
    }
    const r = run(ctx, def.id);
    if (def.once && r.ended) continue;
    const roles = bindRoles(ctx, def);
    if (roles && test(ctx, def.trigger, { roles })) activate(ctx, def.id, roles);
  }
}
