// The content language shared by every Chapter 1 file (spec 03 §9.3, §10): conditions, score
// terms, storylet effects and card primitives. Every object may carry a `note` (a comment).
import { z } from 'zod';

export const note = z.string().optional();
/** A strict object that also accepts a `note` comment. */
export const obj = <T extends z.ZodRawShape>(shape: T) => z.strictObject({ ...shape, note });

const int = z.int();
const id = z.string().min(1);
/** `self`, `@role` or a cat id. */
export const who = id;
/** `who.gauge`, e.g. `self.teaCraving`, `@marti.O`. */
const gaugeRef = z.string().regex(/^[^.]+\.[^.]+$/, 'expected who.gauge');
const clockTime = z.string().regex(/^\d\d:\d\d$/, 'expected HH:MM');
export const clockWindow = z.tuple([clockTime, clockTime]);
export const range = z.tuple([int, int]);

// ---------------------------------------------------------------------------------------------
// Conditions (03 §10.1). Recursive, so the type is written out once here.
// ---------------------------------------------------------------------------------------------
export type Condition =
  | { all: Condition[]; note?: string | undefined }
  | { any: Condition[]; note?: string | undefined }
  | { not: Condition; note?: string | undefined }
  | { fact: string; note?: string | undefined }
  | { flag: string; at?: string | undefined; note?: string | undefined }
  | {
      gauge: string;
      gte?: number | undefined;
      lte?: number | undefined;
      lt?: number | undefined;
      note?: string | undefined;
    }
  | {
      at: string;
      node?: string | undefined;
      tag?: string | undefined;
      region?: string | undefined;
      note?: string | undefined;
    }
  | { near: [string, string]; m: number; note?: string | undefined }
  | { clock: [string, string]; note?: string | undefined }
  | { weather: 'rain' | 'dry'; note?: string | undefined }
  | { power: string; near: string; m: number; note?: string | undefined }
  | { pin: string; near: string; m: number; note?: string | undefined }
  | { state: [string, string]; note?: string | undefined }
  | {
      counter: string;
      gte?: number | undefined;
      lt?: number | undefined;
      eq?: number | undefined;
      note?: string | undefined;
    }
  | { heard: string; by: string; note?: string | undefined }
  | {
      countCats: {
        tag?: string | undefined;
        notTag?: string | undefined;
        except?: string[] | undefined;
      };
      eq: number;
      note?: string | undefined;
    }
  | { bound: string; note?: string | undefined }
  | { activityFinished: [string, string]; note?: string | undefined }
  | { card: string; special: true; note?: string | undefined }
  | { activity: string; is: string; note?: string | undefined };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    obj({ all: z.array(Condition) }),
    obj({ any: z.array(Condition) }),
    obj({ not: Condition }),
    obj({ fact: id }),
    obj({ flag: id, at: who.optional() }),
    obj({ gauge: gaugeRef, gte: int.optional(), lte: int.optional(), lt: int.optional() }),
    obj({ at: who, node: id.optional(), tag: id.optional(), region: id.optional() }),
    obj({ near: z.tuple([id, id]), m: int }),
    obj({ clock: clockWindow }),
    obj({ weather: z.enum(['rain', 'dry']) }),
    obj({ power: id, near: who, m: int }),
    obj({ pin: id, near: who, m: int }),
    obj({ state: z.tuple([id, id]) }),
    obj({ counter: id, gte: int.optional(), lt: int.optional(), eq: int.optional() }),
    obj({ heard: id, by: who }),
    obj({
      countCats: z.strictObject({
        tag: id.optional(),
        notTag: id.optional(),
        except: z.array(id).optional(),
      }),
      eq: int,
    }),
    obj({ bound: who }),
    obj({ activityFinished: z.tuple([who, id]) }),
    obj({ card: id, special: z.literal(true) }),
    obj({ activity: who, is: id }),
  ]),
);

// ---------------------------------------------------------------------------------------------
// Score terms (03 §10.2) and hazard terms (03 §9.2).
// ---------------------------------------------------------------------------------------------
export const ScoreTerm = z.union([
  obj({ base: int }),
  obj({ if: Condition, add: int }),
  obj({ gauge: z.string(), per: int.min(1), add: int, if: Condition.optional() }),
  obj({ primeCount: id, add: int }),
]);
export type ScoreTerm = z.infer<typeof ScoreTerm>;

/** `{ base, terms }` as written in activities and exits. */
export const Score = obj({ base: int, terms: z.array(ScoreTerm).optional() });
export type Score = z.infer<typeof Score>;

export const HazardTerm = obj({ if: Condition, addPerMille: int });
export type HazardTerm = z.infer<typeof HazardTerm>;

// ---------------------------------------------------------------------------------------------
// Storylet, activity and hook effects (03 §9.3). One key each, plus modifiers; `chance` and
// `everyTicks` may be added to any of them.
// ---------------------------------------------------------------------------------------------
const mods = { chance: int.min(0).max(1000).optional(), everyTicks: int.min(1).optional() };

export const Effect = z.union([
  obj({ fact: id, ...mods }),
  obj({
    flag: id,
    value: z.union([int, z.boolean()]).optional(),
    ttl: int.optional(),
    at: who.optional(),
    ...mods,
  }),
  obj({
    gauge: gaugeRef,
    add: int.optional(),
    set: int.optional(),
    holdTicks: int.optional(),
    ...mods,
  }),
  obj({ counter: id, add: int, ...mods }),
  obj({
    goTo: z.tuple([who, id]),
    route: z.enum(['shortest', 'via', 'edgesTagged']).optional(),
    via: z.array(id).optional(),
    tag: id.optional(),
    ...mods,
  }),
  obj({ startActivity: z.tuple([who, id]), ...mods }),
  obj({ stop: who, ...mods }),
  obj({ interrupt: z.tuple([who, id, int]), ...mods }),
  obj({
    emit: id,
    at: id.optional(),
    from: who.optional(),
    to: who.optional(),
    radiusM: int.optional(),
    factIfPerceivedBy: z.record(id, id).optional(),
    ...mods,
  }),
  obj({ trigger: id, ...mods }),
]);
export type Effect = z.infer<typeof Effect>;

// ---------------------------------------------------------------------------------------------
// Card and power primitives (03 §9.3). `target` overrides the target inside a special.
// ---------------------------------------------------------------------------------------------
/** A `scale` is one score term read from the cat being offered. */
const scale = z.union([
  obj({ gauge: z.string(), per: int.min(1), add: int }),
  obj({ primeCount: id, add: int }),
]);
const target = { target: id.optional() };

export const Prim = z.discriminatedUnion('prim', [
  obj({
    prim: z.literal('interrupt'),
    action: id,
    ticks: range,
    radiusM: int.optional(),
    ...target,
  }),
  obj({
    prim: z.literal('gaugeShift'),
    gauge: id,
    add: int.optional(),
    set: int.optional(),
    decayPerTick: int.min(1).optional(),
    holdWhileRunning: z.boolean().optional(),
    ticks: int.optional(),
    ifHasGauge: z.boolean().optional(),
    ...target,
  }),
  obj({
    prim: z.literal('attract'),
    radiusM: int,
    strength: int,
    ticks: int.min(1),
    scale: scale.optional(),
    ...target,
  }),
  obj({ prim: z.literal('repel'), radiusM: int, strength: int, ticks: int.min(1), ...target }),
  obj({ prim: z.literal('socialSpread'), event: id, radiusM: int, hops: int.min(0), ...target }),
  obj({ prim: z.literal('delay'), ticks: range, action: id, ...target }),
  obj({ prim: z.literal('move'), to: id, ...target }),
  obj({ prim: z.literal('triggerStorylet'), storylet: id, ifTarget: id.optional(), ...target }),
  obj({
    prim: z.literal('setFlag'),
    flag: id,
    at: z.literal('$target').optional(),
    ticks: int.optional(),
    onlyObjects: z.array(id).optional(),
    ...target,
  }),
  obj({
    prim: z.literal('collapse'),
    radiusM: int,
    ticks: int.min(1),
    sample: z.string().optional(),
    payout: z.boolean().optional(),
    countsAsPaid: z.boolean().optional(),
    ...target,
  }),
]);
export type Prim = z.infer<typeof Prim>;
