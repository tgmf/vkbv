// Parses and cross-checks content (spec 02 §5). Every problem is collected and thrown as one error.
import type { z } from 'zod';
import { checkChapter, type ParsedChapter } from './check';
import { TextSchema, TuningSchema, type TextTable, type Tuning } from './schemas';
import * as S from './schemas/chapter';
import type { Content, EdgeInfo, NodeInfo } from './schemas/content';

export type { Content } from './schemas/content';

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Content has ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
}

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let v = data;
  for (const key of path)
    v = v !== null && typeof v === 'object' ? (v as Record<PropertyKey, unknown>)[key] : undefined;
  return v;
}

/** Parses `data` with `schema`, adding one line per issue to `problems`: `<file>: <key.path>: <message> (got <value>)`. */
function parse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  file: string,
  problems: string[],
): T | undefined {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '<root>';
    const got = valueAt(data, issue.path);
    const shown =
      got === undefined || typeof got === 'object' ? '' : ` (got ${JSON.stringify(got)})`;
    problems.push(`${file}: ${key}: ${issue.message}${shown}`);
  }
  return undefined;
}

export function loadTuning(data: unknown): Tuning {
  const problems: string[] = [];
  const tuning = parse(TuningSchema, data, 'tuning.json', problems);
  if (!tuning) throw new ContentError(problems);
  return tuning;
}

/** Loads a pair of text tables that must have the same key set. */
export function loadText(name: string, en: unknown, ru: unknown): Record<'en' | 'ru', TextTable> {
  const problems: string[] = [];
  const a = parse(TextSchema, en, `${name}/en.json`, problems);
  const b = parse(TextSchema, ru, `${name}/ru.json`, problems);
  if (a && b) {
    for (const k of Object.keys(a))
      if (!(k in b)) problems.push(`${name}/ru.json: missing key ${k}`);
    for (const k of Object.keys(b))
      if (!(k in a)) problems.push(`${name}/en.json: missing key ${k}`);
  }
  if (!a || !b || problems.length > 0) throw new ContentError(problems);
  return { en: a, ru: b };
}

/** The raw JSON of one chapter folder. */
export type ChapterFiles = Record<keyof ParsedChapter | 'textEn' | 'textRu', unknown>;

const SCHEMAS: { [K in keyof ParsedChapter]: z.ZodType<ParsedChapter[K]> } = {
  world: S.WorldSchema,
  map: S.MapSchema,
  cast: S.CastSchema,
  hooks: S.HooksSchema,
  activities: S.ActivitiesSchema,
  objects: S.ObjectsSchema,
  cards: S.CardsSchema,
  powers: S.PowersSchema,
  storylets: S.StoryletsSchema,
  detectors: S.DetectorsSchema,
  anchor: S.AnchorSchema,
  economy: S.EconomySchema,
};

/** Parses and cross-checks a chapter; `warnings` receives the non-fatal findings. */
export function loadChapter(files: ChapterFiles, tuning: Tuning, warnings: string[] = []): Content {
  const problems: string[] = [];
  const parsed: Partial<ParsedChapter> = {};
  for (const name of Object.keys(SCHEMAS) as (keyof ParsedChapter)[]) {
    const value = parse(
      SCHEMAS[name] as z.ZodType<unknown>,
      files[name],
      `ch1/${name}.json`,
      problems,
    );
    if (value !== undefined) (parsed as Record<string, unknown>)[name] = value;
  }
  let text: Record<'en' | 'ru', TextTable> | undefined;
  try {
    text = loadText('ch1/text', files.textEn, files.textRu);
  } catch (e) {
    if (!(e instanceof ContentError)) throw e;
    problems.push(...e.problems);
  }
  if (problems.length > 0 || !text) throw new ContentError(problems);
  const ch = parsed as ParsedChapter;

  const report = checkChapter(ch, text);
  warnings.push(...report.warnings);
  if (report.errors.length > 0) throw new ContentError(report.errors);
  return deepFreeze(derive(ch, text, tuning));
}

/** Builds the lookups the simulation uses (03 §3, 05 §3). */
function derive(ch: ParsedChapter, text: Record<'en' | 'ru', TextTable>, tuning: Tuning): Content {
  const cats =
    tuning.content.castMode === 'core' ? ch.cast.cats.filter((c) => c.core) : ch.cast.cats;
  const edges: EdgeInfo[] = ch.map.edges.map((e) => ({ ...e, id: e.id ?? `${e.a}__${e.b}` }));
  const adj: Record<string, { edge: string; to: string }[]> = {};
  for (const n of ch.map.nodes) adj[n.id] = [];
  for (const e of edges) {
    adj[e.a]?.push({ edge: e.id, to: e.b });
    adj[e.b]?.push({ edge: e.id, to: e.a });
  }
  const indoor = (id: string) =>
    ch.map.nodes.find((n) => n.id === id)?.tags.includes('indoor') ?? false;

  // Spaces: indoor rooms joined by edges with walls: 0 share the space named after their first room.
  const space: Record<string, string> = {};
  for (const n of ch.map.nodes) {
    if (!indoor(n.id)) space[n.id] = 'outside';
    else if (!space[n.id]) {
      const queue = [n.id];
      for (let cur = queue.shift(); cur !== undefined; cur = queue.shift()) {
        space[cur] = n.id;
        for (const e of edges)
          if (e.walls === 0 && (e.a === cur || e.b === cur)) {
            const other = e.a === cur ? e.b : e.a;
            if (indoor(other) && !space[other]) queue.push(other);
          }
      }
    }
  }

  const nodes: NodeInfo[] = ch.map.nodes.map((n, index) => ({
    ...n,
    index,
    indoor: indoor(n.id),
    space: space[n.id] ?? n.id,
    doorToOutdoor: edges.some(
      (e) => e.door === true && (e.a === n.id ? !indoor(e.b) : e.b === n.id && !indoor(e.a)),
    ),
    objectTags: ch.objects.objects.filter((o) => o.node === n.id).flatMap((o) => o.tags ?? []),
  }));

  const byId = <T extends { id: string }>(list: T[]) =>
    Object.fromEntries(list.map((x) => [x.id, x])) as Record<string, T>;

  return {
    tuning,
    world: ch.world,
    regions: ch.map.regions,
    nodes,
    node: byId(nodes),
    edges,
    edge: byId(edges),
    adj,
    cats,
    cat: byId(cats),
    hooksFloor: ch.hooks.floor,
    hooks: ch.hooks.hooks,
    hook: byId(ch.hooks.hooks),
    stickiness: ch.activities.stickiness,
    decisionEveryTicks: ch.activities.decisionEveryTicks,
    activities: ch.activities.activities,
    activity: byId(ch.activities.activities),
    objects: ch.objects.objects,
    object: byId(ch.objects.objects),
    cards: ch.cards.cards,
    card: byId(ch.cards.cards),
    powers: ch.powers.powers,
    power: byId(ch.powers.powers),
    storylets: ch.storylets.storylets,
    storylet: byId(ch.storylets.storylets),
    detectors: ch.detectors.detectors,
    anchor: ch.anchor,
    economy: ch.economy,
    text,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Everything the app needs at startup. Throws one ContentError listing every problem. */
export function loadAll(files: {
  tuning: unknown;
  uiEn: unknown;
  uiRu: unknown;
  chapter: ChapterFiles;
}) {
  const problems: string[] = [];
  const attempt = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof ContentError) problems.push(...e.problems);
      else throw e;
      return undefined;
    }
  };
  const tuning = attempt(() => loadTuning(files.tuning));
  const ui = attempt(() => loadText('ui', files.uiEn, files.uiRu));
  const content = tuning && attempt(() => loadChapter(files.chapter, tuning));
  if (!tuning || !ui || !content) throw new ContentError(problems);
  return { tuning, ui, content };
}
