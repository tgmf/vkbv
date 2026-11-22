// Pins in the simulation: validity, pending, specials and the card/power primitives (spec 03 §9.3, §11).
import type { Prim } from '../content/schemas/dsl';
import { catState, clampBase, goTo, insertSorted, reaches, setInterrupt } from './cats';
import { test } from './conditions';
import { emitNamed } from './effects';
import { mulPm } from './math';
import { rand } from './rng';
import { catNode, catPos, nodePos, within } from './space';
import { activate } from './storylets';
import type { CatId, Ctx, NodeId, Pin, RunningEffect } from './types';
import { catScope, isLive, need } from './types';

type Reason = 'noBranch' | 'wrongCat' | 'hidden';

/** The primitives a pin would run, or why it cannot fire now (03 §11). */
function resolve(
  ctx: Ctx,
  pin: Pin,
): { prims: readonly Prim[]; node: NodeId; cat: CatId | null } | Reason {
  const { c } = ctx;
  if (pin.kind === 'power')
    return { prims: need(c.power, pin.power, 'power').effects, node: pin.place, cat: null };
  const card = need(c.card, pin.card, 'card');
  const tg = pin.target;
  if ('cat' in tg) {
    if (!card.on.cat) return 'noBranch';
    if (card.bound !== null && card.bound !== tg.cat) return 'wrongCat';
    if (!ctx.s.cats[tg.cat]) return 'noBranch';
    return { prims: card.on.cat, node: catNode(catState(ctx, tg.cat)), cat: tg.cat };
  }
  if ('place' in tg)
    return card.on.place ? { prims: card.on.place, node: tg.place, cat: null } : 'noBranch';
  const object = need(c.object, tg.object, 'object');
  if (object.visibleWhen && !test(ctx, object.visibleWhen, {})) return 'hidden';
  if (pin.special && card.special?.on === object.id)
    return { prims: card.special.effects, node: object.node, cat: null };
  const prims = card.on.object;
  if (!prims) return 'noBranch';
  if (
    prims.some((p) => p.prim === 'setFlag' && p.onlyObjects && !p.onlyObjects.includes(object.id))
  )
    return 'noBranch';
  return { prims, node: object.node, cat: null };
}

/** Phase 1: fire the pins of this tick and re-check pending ones, in log order. */
export function pinsPhase(ctx: Ctx): void {
  for (const pin of ctx.pins) {
    // a card on a fogged cat is the fog's (03 §13.6): the lantern leaves it alone
    if (pin.kind === 'card' && 'cat' in pin.target && !isLive(ctx, pin.target.cat)) continue;
    const status = ctx.s.pins[pin.id];
    if (!((pin.tick === ctx.t && status === undefined) || status === 'pending')) continue;
    const r = resolve(ctx, pin);
    if (typeof r === 'string') {
      if (status === undefined) {
        ctx.s.pins[pin.id] = 'pending';
        ctx.events.push({ tick: ctx.t, type: 'fizzle', pin: pin.id, reason: r });
      }
      continue;
    }
    ctx.s.pins[pin.id] = 'fired';
    ctx.events.push({
      tick: ctx.t,
      type: 'pinFired',
      pin: pin.id,
      special: pin.kind === 'card' && pin.special && 'object' in pin.target,
      card: pin.kind === 'card' ? pin.card : null,
    });
    fire(ctx, pin, r.prims, r.node, r.cat);
  }
}

function fire(
  ctx: Ctx,
  pin: Pin,
  prims: readonly Prim[],
  node: NodeId,
  targetCat: CatId | null,
): void {
  const { c } = ctx;
  const power = pin.kind === 'power' ? need(c.power, pin.power, 'power') : null;
  const card = pin.kind === 'card' ? need(c.card, pin.card, 'card') : null;
  const pressure = power?.pressure ?? card?.pressure ?? 0;
  const source = pin.kind === 'power' ? { power: pin.power } : { card: pin.card };
  const reached: CatId[] = [];
  const touch = (id: CatId) => {
    if (!reached.includes(id)) reached.push(id);
  };

  prims.forEach((p, index) => {
    // `target: "marti"` inside a special points at that cat; it is not a direct play (03 §8.4).
    const cat = p.target ?? targetCat;
    if (cat && !isLive(ctx, cat)) return; // a fogged cat: the fog applies this part (03 §13.6)
    const direct = targetCat !== null && p.target === undefined;
    const at = cat ? catNode(catState(ctx, cat)) : node;
    const centre = cat ? catPos(c, catState(ctx, cat)) : nodePos(c, node);
    const reduce = (n: number, id: CatId) =>
      direct ? mulPm(n, 1000 - need(c.cat, id, 'cat').willpower) : n;
    const sampleTicks = ([lo, hi]: readonly [number, number], id: CatId) =>
      lo + rand(ctx.seed, catScope(ctx, id), ctx.t, `pin:${pin.id}:${index}`, hi - lo + 1);

    switch (p.prim) {
      case 'interrupt': {
        const targets =
          p.radiusM !== undefined && !cat
            ? c.cats
                .map((x) => x.id)
                .filter((id) => isLive(ctx, id))
                .filter((id) => within(catPos(c, catState(ctx, id)), centre, p.radiusM ?? 0))
            : cat
              ? [cat]
              : [];
        for (const id of targets) {
          touch(id);
          setInterrupt(ctx, id, p.action, reduce(sampleTicks(p.ticks, id), id), pin.id);
        }
        break;
      }
      case 'gaugeShift': {
        if (!cat) break;
        const cs = catState(ctx, cat);
        const base = cs.base[p.gauge];
        if (base === undefined) break; // a cat without the gauge is skipped (ifHasGauge, or no such gauge)
        touch(cat);
        if (p.set !== undefined) {
          cs.base[p.gauge] = clampBase(c, p.gauge, p.set);
          break;
        }
        const add = reduce(p.add ?? 0, cat);
        if (add === 0) break;
        if (p.decayPerTick !== undefined)
          cs.mods.push({
            gauge: p.gauge,
            add,
            left: Math.trunc((Math.abs(add) + p.decayPerTick - 1) / p.decayPerTick),
            decayPerTick: p.decayPerTick,
            pin: pin.id,
          });
        else if (p.holdWhileRunning)
          cs.mods.push({ gauge: p.gauge, add, left: p.ticks ?? 1, decayPerTick: 0, pin: pin.id });
        else cs.base[p.gauge] = clampBase(c, p.gauge, base + add);
        break;
      }
      case 'attract':
      case 'repel': {
        const effect: RunningEffect = {
          id: `${pin.id}:${index}`,
          kind: p.prim,
          pin: pin.id,
          source,
          place: at,
          left: p.ticks,
          born: ctx.t,
          radiusM: p.radiusM,
          strength: p.strength,
          scale: p.prim === 'attract' ? (p.scale ?? null) : null,
          affects: power?.affects ?? null,
        };
        ctx.s.effects.push(effect);
        for (const x of c.cats) if (isLive(ctx, x.id) && reaches(ctx, effect, x.id)) touch(x.id);
        break;
      }
      case 'socialSpread':
        emitNamed(
          ctx,
          p.event,
          { pos: centre, node: at },
          { radiusM: p.radiusM, hops: p.hops, source: cat },
        );
        break;
      case 'delay': {
        if (!cat) break;
        touch(cat);
        const cs = catState(ctx, cat);
        cs.activity = p.action;
        cs.forcedLeft = sampleTicks(p.ticks, cat);
        cs.boredom = 0;
        cs.activityStart = ctx.t;
        cs.activityPlace = 'at' in cs.pos ? cs.pos.at : cs.pos.to;
        cs.route = [];
        cs.control = 'forced';
        ctx.events.push({
          tick: ctx.t,
          type: 'activity',
          cat,
          activity: p.action,
          place: cs.activityPlace,
        });
        break;
      }
      case 'move':
        if (cat) {
          touch(cat);
          goTo(ctx, cat, p.to, 'forced');
        }
        break;
      case 'triggerStorylet':
        if (p.ifTarget === undefined || reached.includes(p.ifTarget)) activate(ctx, p.storylet);
        break;
      case 'setFlag': {
        const key = p.at === '$target' ? `${p.flag}@${at}` : p.flag;
        ctx.s.flags[key] = { value: 1, until: p.ticks === undefined ? null : ctx.t + p.ticks };
        if (p.ticks !== undefined)
          ctx.s.effects.push({
            id: `${pin.id}:${index}`,
            kind: 'flag',
            pin: pin.id,
            source,
            place: at,
            left: p.ticks,
            born: ctx.t,
            radiusM: 0,
            strength: 0,
            scale: null,
            affects: null,
          });
        break;
      }
      case 'collapse':
        // Gaze changes no state; it schedules observation samples in the wave (03 §15.3, M2).
        break;
      default: {
        const never: never = p;
        throw new Error(`unknown primitive ${JSON.stringify(never)}`);
      }
    }
  });

  // Pressure: a cat pin adds it to that cat; a place, object or power pin to every cat it reached.
  const pressured = targetCat !== null ? [targetCat] : reached;
  for (const id of pressured) {
    const cs = catState(ctx, id);
    cs.pressure = Math.min(c.tuning.pressure.cap, cs.pressure + pressure);
  }
  for (const id of [...pressured, ...reached]) insertSorted(catState(ctx, id).touchedBy, pin.id);
}
