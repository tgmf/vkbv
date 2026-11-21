// Schemas for the files in src/content/data/ch1/ (spec 05 §1), one section per file.
// Keys the engine ignores (05 §3) are accepted: `note`, `status`, `look`, `leadTo`, ...
import { z } from 'zod';
import { Condition, Effect, HazardTerm, Prim, Score, clockWindow, note, obj, range } from './dsl';

const int = z.int();
const id = z.string().min(1);
const pm = int.min(0).max(1000);
const gaugeRange = z.tuple([int.min(0).max(1000), int.min(0).max(1000)]);

// world.json ------------------------------------------------------------------------------------
export const WorldSchema = obj({
  chapter: int,
  status: z.string().optional(),
  startClock: z.string().regex(/^\d\d:\d\d$/),
  ticks: int.min(1),
  tickMinutes: int.min(1),
  anchor: id,
  engineFacts: z.array(id),
  initialFlags: z.record(id, int).optional(),
  weather: obj({
    initial: z.enum(['dry', 'rain']),
    rainStart: obj({ window: clockWindow, perMille: pm, minDurationTicks: int.optional() }),
    rainStop: obj({ window: clockWindow, perMille: pm, minDurationTicks: int.optional() }),
  }),
  perception: obj({
    rainSightPerMille: pm,
    rainHearingPerMille: pm,
    wallSightPerMille: pm,
    wallHearingPerMille: pm,
    doorHearingPerMille: pm,
    openWindowHearingPerMille: pm,
    openWindowSightPerMille: pm,
  }),
  primes: obj({ cat: id, list: z.array(obj({ id, cond: Condition })) }),
  counters: z.record(id, obj({ start: int, target: int.optional() })),
  tags: z.array(id),
});
export type World = z.infer<typeof WorldSchema>;

// map.json --------------------------------------------------------------------------------------
export const MapSchema = z.strictObject({
  units: z.string().optional(),
  regions: z.array(obj({ id, nameKey: id, revealedAtStart: z.boolean() })),
  nodes: z.array(obj({ id, region: id, nameKey: id, pos: z.tuple([int, int]), tags: z.array(id) })),
  edges: z.array(
    obj({
      id: id.optional(),
      a: id,
      b: id,
      minutes: int.min(1),
      walls: int.min(0).optional(),
      door: z.boolean().optional(),
      tags: z.array(id).optional(),
      when: Condition.optional(),
    }),
  ),
});
export type MapFile = z.infer<typeof MapSchema>;
export type NodeDef = MapFile['nodes'][number];
export type EdgeDef = MapFile['edges'][number];

// cast.json -------------------------------------------------------------------------------------
export const CatSchema = obj({
  id,
  nameKey: id,
  kind: z.enum(['protagonist', 'townscat']),
  core: z.boolean(),
  lockedThread: z.boolean().optional(),
  roles: z.array(id).optional(),
  look: z.record(z.string(), z.union([z.string(), z.boolean()])),
  home: id,
  start: id,
  startActivity: id,
  temperatureTenths: int.min(1),
  willpower: pm,
  perception: obj({ sightM: int.min(0), hearingM: int.min(0), voices: int.min(1) }),
  traits: z.strictObject({
    O: gaugeRange,
    C: gaugeRange,
    E: gaugeRange,
    A: gaugeRange,
    N: gaugeRange,
  }),
  hooks: z.record(id, gaugeRange),
  activities: z.array(id),
});
export const CastSchema = z.strictObject({ note, cats: z.array(CatSchema) });
export type CatDef = z.infer<typeof CatSchema>;

// hooks.json ------------------------------------------------------------------------------------
const Rise = z.union([
  obj({ when: Condition.optional(), perTicks: int.min(1), add: int }),
  obj({ onEvent: id, add: int }),
]);
export const HookSchema = obj({
  id,
  scope: id,
  nameKey: id,
  driveKey: id,
  rise: z.array(Rise),
  decay: obj({
    when: Condition.optional(),
    perTicks: int.min(1),
    add: int,
    toward: z.literal('initial').optional(),
  }).optional(),
  voice: obj({
    over: int.optional(),
    under: int.optional(),
    lines: z.array(id).optional(),
    linesOver: z.array(id).optional(),
  }),
  effects: z.string().optional(), // a design note, ignored (05 §3, Q-content-1)
});
export const HooksSchema = z.strictObject({
  range: gaugeRange,
  floor: pm,
  hooks: z.array(HookSchema),
});
export type HookDef = z.infer<typeof HookSchema>;

// activities.json -------------------------------------------------------------------------------
export type PlaceSelector =
  | { node: string }
  | { tag: string; region?: string | undefined }
  | { anyOf: PlaceSelector[] }
  | { flag: string }
  | { neighbour: true; region?: string | undefined }
  | { nearest: string[] }
  | { nearCat: true; m: number }
  | { randomNode: { region?: string | undefined; tag?: string | undefined } };
export const PlaceSelector: z.ZodType<PlaceSelector> = z.lazy(() =>
  z.union([
    z.strictObject({ node: id }),
    z.strictObject({ tag: id, region: id.optional() }),
    z.strictObject({ anyOf: z.array(PlaceSelector) }),
    z.strictObject({ flag: id }),
    z.strictObject({ neighbour: z.literal(true), region: id.optional() }),
    z.strictObject({ nearest: z.array(id) }),
    z.strictObject({ nearCat: z.literal(true), m: int }),
    z.strictObject({ randomNode: z.strictObject({ region: id.optional(), tag: id.optional() }) }),
  ]),
);
export const ActivitySchema = obj({
  id,
  at: PlaceSelector,
  ticks: range,
  gate: Condition.optional(),
  score: Score,
  while: z.array(Effect).optional(),
  onFinish: z.array(Effect).optional(),
});
export const ActivitiesSchema = z.strictObject({
  note,
  stickiness: int,
  decisionEveryTicks: int.min(1),
  activities: z.array(ActivitySchema),
});
export type ActivityDef = z.infer<typeof ActivitySchema>;

// objects.json ----------------------------------------------------------------------------------
export const ObjectSchema = obj({
  id,
  node: id,
  nameKey: id,
  storyKey: id,
  grantsCard: id.optional(),
  tags: z.array(id).optional(),
  visibleWhen: Condition.optional(),
  onPerceived: obj({ by: id, emit: id, fact: id.optional() }).optional(),
});
export const ObjectsSchema = z.strictObject({ note, objects: z.array(ObjectSchema) });
export type ObjectDef = z.infer<typeof ObjectSchema>;

// cards.json ------------------------------------------------------------------------------------
export const CardSchema = obj({
  id,
  demo: z.boolean(),
  nameKey: id,
  textKey: id,
  source: id.nullable(),
  bound: id.nullable(),
  kind: z.enum(['instant', 'continuous']),
  unique: z.boolean(),
  on: z.strictObject({
    cat: z.array(Prim).optional(),
    object: z.array(Prim).optional(),
    place: z.array(Prim).optional(),
  }),
  pressure: int.min(0),
  special: obj({ on: id, textKey: id, effects: z.array(Prim) }).optional(),
});
export const CardsSchema = z.strictObject({ note, cards: z.array(CardSchema) });
export type CardDef = z.infer<typeof CardSchema>;

// powers.json -----------------------------------------------------------------------------------
export const PowerSchema = obj({
  id,
  nameKey: id,
  textKey: id,
  status: z.string().optional(),
  cost: int.min(0),
  targets: z.array(z.enum(['place'])),
  radiusM: int,
  ticks: int.min(1),
  affects: obj({ kinds: z.array(id), orTemperatureTenthsGte: int.optional() }).optional(),
  effects: z.array(Prim),
  leadTo: z.unknown().optional(), // out of the demo (05 §3)
  pressure: int.min(0),
});
export const PowersSchema = z.strictObject({ powers: z.array(PowerSchema) });
export type PowerDef = z.infer<typeof PowerSchema>;

// storylets.json --------------------------------------------------------------------------------
const RoleSpec = z.union([
  z.strictObject({ cat: id }),
  z.strictObject({ roleTag: id, bind: z.literal('all').optional() }),
  z.strictObject({
    nearCat: id,
    m: int,
    bind: z.literal('nearest'),
    optional: z.boolean().optional(),
  }),
]);
export type RoleSpec = z.infer<typeof RoleSpec>;
const Exit = obj({
  to: id,
  kind: z.enum(['choice', 'hazard', 'auto']),
  actor: id.optional(),
  gate: Condition.optional(),
  score: Score.optional(),
  perMille: pm.optional(),
  terms: z.array(HazardTerm).optional(),
});
export type Exit = z.infer<typeof Exit>;
const StoryletState = obj({
  textKey: id.optional(),
  onEnter: z.array(Effect).optional(),
  stayScore: int.optional(),
  exits: z.array(Exit),
});
export const StoryletSchema = obj({
  id,
  required: z.boolean(),
  once: z.boolean(),
  special: z.boolean().optional(),
  anchor: z.boolean().optional(),
  roles: z.record(id, RoleSpec),
  trigger: Condition,
  start: id,
  states: z.record(id, StoryletState),
});
export const StoryletsSchema = z.strictObject({ note, storylets: z.array(StoryletSchema) });
export type StoryletDef = z.infer<typeof StoryletSchema>;

// detectors.json --------------------------------------------------------------------------------
const Clause = z.union([
  obj({ holds: Condition, forTicks: int.min(1), withinTicks: int.optional() }),
  obj({ event: id, at: id.optional(), withinTicks: int.optional() }),
]);
export type Clause = z.infer<typeof Clause>;
export const DetectorSchema = obj({
  id,
  emits: id,
  kernel: z.array(Clause).min(1),
  unless: z.array(obj({ fact: id, between: z.tuple([int, int]) })).optional(),
});
export const DetectorsSchema = z.strictObject({ note, detectors: z.array(DetectorSchema) });
export type DetectorDef = z.infer<typeof DetectorSchema>;

// anchor.json -----------------------------------------------------------------------------------
export type Requirement =
  | { all: Requirement[]; weight?: number | undefined; note?: string | undefined }
  | { any: Requirement[]; weight?: number | undefined; note?: string | undefined }
  | { fact: string; weight?: number | undefined; note?: string | undefined };
export const Requirement: z.ZodType<Requirement> = z.lazy(() =>
  z.union([
    obj({ all: z.array(Requirement), weight: int.optional() }),
    obj({ any: z.array(Requirement), weight: int.optional() }),
    obj({ fact: id, weight: int.optional() }),
  ]),
);
export const AnchorSchema = obj({
  id,
  nameKey: id,
  teaserKey: id,
  imposed: z.boolean(),
  requirements: Requirement,
  fraysIf: Condition,
  afterAnchor: obj({ lockedThread: id, endKey: id }),
});
export type AnchorDef = z.infer<typeof AnchorSchema>;

// economy.json ----------------------------------------------------------------------------------
export const EconomySchema = z.strictObject({
  charge: obj({ start: int, cap: int, floorAtRainStart: int, variantRainStartPays: z.boolean() }),
  pressureScale: obj({ per: int.min(1), addPercent: int }),
  payouts: obj({
    storyletState: z.record(id, int),
    detector: z.record(id, int),
    anchorRequirement: int,
  }),
  cardsFromExploring: z.strictObject({
    inspectObject: z.string(),
    discoverHook: z.record(id, id),
    revealRegion: z.record(id, id.nullable()),
  }),
});
export type Economy = z.infer<typeof EconomySchema>;
