// Saving (04 §9): the player's state and the settings as one string, validated on the way back in.
// Wave results are never saved: they are recomputed from the seed, the pins and the watched facts.
// Storage is passed in, so tests use a fake and `src/player` never touches `localStorage`.
import { z } from 'zod';
import type { PlayerState } from './state';

export const SAVE_KEY = 'acfw.ch1.v2';

/** The settings of 06 §8. */
export interface Settings {
  lang: 'en' | 'ru';
  textSize: 100 | 125 | 150;
  reducedMotion: 'system' | 'on' | 'off';
  focusLayer: boolean;
  assist: boolean;
  volume: number; // 0..100, unused until M9
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const int = z.int();
const ids = z.array(z.string());

const SummarySchema = z.strictObject({
  self: z.strictObject({
    node: z.string(),
    activity: z.string(),
    interrupt: z.string().nullable(),
  }),
  cats: z.array(z.strictObject({ cat: z.string(), node: z.string(), activity: z.string() })),
  storylets: ids,
  detectors: ids,
  factsSet: ids,
  events: ids,
  nodesSeen: ids,
  paidBy: z.record(z.string(), ids),
  totalPressure: int,
  weather: z.enum(['dry', 'rain']),
});

const FactSchema = z.strictObject({
  tick: int,
  cat: z.string(),
  digest: int,
  summary: SummarySchema,
});

const TargetSchema = z.union([
  z.strictObject({ cat: z.string() }),
  z.strictObject({ object: z.string() }),
  z.strictObject({ place: z.string() }),
]);

const PinSchema = z.union([
  z.strictObject({
    id: z.string(),
    seq: int,
    tick: int,
    kind: z.literal('card'),
    card: z.string(),
    target: TargetSchema,
    special: z.boolean(),
  }),
  z.strictObject({
    id: z.string(),
    seq: int,
    tick: int,
    kind: z.literal('power'),
    power: z.string(),
    place: z.string(),
  }),
]);

const PlayerSchema = z.strictObject({
  v: z.literal(2),
  seedRequested: int,
  seed: int,
  pins: z.array(PinSchema),
  nextSeq: int,
  cards: z.record(
    z.string(),
    z.strictObject({
      zone: z.enum(['unfound', 'hand', 'pinned', 'spent', 'draw', 'discard']),
      pin: z.string().optional(),
    }),
  ),
  drawPile: ids,
  reshuffles: int,
  specialsUsed: ids,
  charge: int,
  paid: ids,
  watched: z.array(FactSchema),
  followed: ids,
  revealed: ids,
  journal: z.strictObject({ hooks: ids, stories: ids }),
  frontier: z.strictObject({ story: int, pastTicks: int, storylets: ids }),
  anchorWatched: z.boolean(),
  playhead: int,
  marks: z.strictObject({ changedUnwatched: z.array(int) }),
});

const SettingsSchema = z.strictObject({
  lang: z.enum(['en', 'ru']),
  textSize: z.union([z.literal(100), z.literal(125), z.literal(150)]),
  reducedMotion: z.enum(['system', 'on', 'off']),
  focusLayer: z.boolean(),
  assist: z.boolean(),
  volume: int.min(0).max(100),
});

const SaveSchema = z.strictObject({ player: PlayerSchema, settings: SettingsSchema });

export const serialize = (player: PlayerState, settings: Settings): string =>
  JSON.stringify({ player, settings });

/** The saved player and settings, or null for anything that is not a valid save. */
export function deserialize(s: string): { player: PlayerState; settings: Settings } | null {
  let data: unknown;
  try {
    data = JSON.parse(s);
  } catch {
    return null;
  }
  const r = SaveSchema.safeParse(data);
  return r.success ? (r.data as { player: PlayerState; settings: Settings }) : null;
}

export const store = (storage: SaveStorage, player: PlayerState, settings: Settings): void =>
  storage.setItem(SAVE_KEY, serialize(player, settings));

export function load(storage: SaveStorage): { player: PlayerState; settings: Settings } | null {
  const s = storage.getItem(SAVE_KEY);
  return s === null ? null : deserialize(s);
}
