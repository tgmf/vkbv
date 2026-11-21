// The loaded chapter as the simulation sees it: parsed files plus lookups derived once at load.
// Types only, so src/sim may import it (spec 02 §2).
import type { TextTable } from './index';
import type { Tuning } from './tuning';
import type {
  ActivityDef,
  AnchorDef,
  CardDef,
  CatDef,
  DetectorDef,
  EdgeDef,
  Economy,
  HookDef,
  MapFile,
  NodeDef,
  ObjectDef,
  PowerDef,
  StoryletDef,
  World,
} from './chapter';

export interface NodeInfo extends NodeDef {
  index: number; // position in map.json, used for ties
  indoor: boolean;
  space: string; // 03 §3: connected indoor rooms share one; all outdoor places are 'outside'
  doorToOutdoor: boolean; // has an edge with door: true to an outdoor place
  objectTags: string[]; // tags of the objects standing here
}

export interface EdgeInfo extends EdgeDef {
  id: string; // `${a}__${b}` when the file gives none
}

export interface Content {
  tuning: Tuning;
  world: World;
  regions: MapFile['regions'];
  nodes: NodeInfo[];
  node: Readonly<Record<string, NodeInfo>>;
  edges: EdgeInfo[];
  edge: Readonly<Record<string, EdgeInfo>>;
  /** Neighbours of each place, in edge order. */
  adj: Readonly<Record<string, readonly { edge: string; to: string }[]>>;
  cats: CatDef[]; // cast order, after cast mode
  cat: Readonly<Record<string, CatDef>>;
  hooksFloor: number;
  hooks: HookDef[];
  hook: Readonly<Record<string, HookDef>>;
  stickiness: number;
  decisionEveryTicks: number;
  activities: ActivityDef[];
  activity: Readonly<Record<string, ActivityDef>>;
  objects: ObjectDef[];
  object: Readonly<Record<string, ObjectDef>>;
  cards: CardDef[];
  card: Readonly<Record<string, CardDef>>;
  powers: PowerDef[];
  power: Readonly<Record<string, PowerDef>>;
  storylets: StoryletDef[];
  storylet: Readonly<Record<string, StoryletDef>>;
  detectors: DetectorDef[];
  anchor: AnchorDef;
  economy: Economy;
  text: Record<'en' | 'ru', TextTable>;
}
