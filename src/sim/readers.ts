// Built once at load: the readers index, link selection (03 §13.5) and the place perception
// table (03 §13.6).
import type { Condition, Score } from '../content/schemas/dsl';
import { detectorCats } from './sifting';
import { rangeBetween, type Sense, type Weather } from './perception';
import type { CatId, Content } from './types';
import { need } from './types';

/** Something that reads a fact, flag or storylet state, and the cats it belongs to. */
export interface Reader {
  kind: 'activity' | 'storylet' | 'hook' | 'detector' | 'anchor' | 'prime' | 'world';
  id: string;
  cats: CatId[];
}

/** A quantity a condition can read: `fact:<id>`, `flag:<name>` or `state:<storylet>.<state>`. */
export type QuantityKey = string;

export type Link =
  { kind: 'fact'; fact: string } | { kind: 'state'; storylet: string; state: string };

export interface Readers {
  /** Readers of each quantity, in the order they were found. */
  of: Record<QuantityKey, Reader[]>;
  /** Every quantity read anywhere, in first-seen order (activities, storylets, hooks, detectors, anchor). */
  order: QuantityKey[];
  /** The links besides the weather, ranked (03 §13.5), at most `fog.maxLinks`. */
  links: Link[];
  /** The counters whose race holds a link: their auto exits fire with any chance (03 §13.6). */
  raceCounters: string[];
}

/** The quantities a condition reads. */
function reads(cond: Condition, out: QuantityKey[]): void {
  if ('all' in cond) for (const x of cond.all) reads(x, out);
  else if ('any' in cond) for (const x of cond.any) reads(x, out);
  else if ('not' in cond) reads(cond.not, out);
  else if ('fact' in cond) out.push(`fact:${cond.fact}`);
  else if ('flag' in cond) out.push(`flag:${cond.flag}`);
  else if ('state' in cond) out.push(`state:${cond.state[0]}.${cond.state[1]}`);
}

function scoreReads(sc: Score | undefined, out: QuantityKey[]): void {
  for (const t of sc?.terms ?? []) if ('if' in t && t.if) reads(t.if, out);
}

/** The facts an anchor requirement tree names. */
export function requirementFacts(c: Content): string[] {
  const out: string[] = [];
  const walk = (r: Content['anchor']['requirements']): void => {
    if ('fact' in r) out.push(r.fact);
    else for (const x of 'all' in r ? r.all : r.any) walk(x);
  };
  walk(c.anchor.requirements);
  return out;
}

/** Cats a storylet's fixed roles name: `{ cat }` and `{ roleTag }`; `nearCat` roles name nobody. */
export function storyletCats(c: Content, def: Content['storylets'][number]): CatId[] {
  const named: CatId[] = [];
  for (const spec of Object.values(def.roles)) {
    if ('cat' in spec) named.push(spec.cat);
    else if ('roleTag' in spec)
      for (const x of c.cats) if (x.roles?.includes(spec.roleTag)) named.push(x.id);
  }
  return c.cats.filter((x) => named.includes(x.id)).map((x) => x.id);
}

export function buildReaders(c: Content): Readers {
  const of: Record<QuantityKey, Reader[]> = {};
  const order: QuantityKey[] = [];
  const add = (keys: QuantityKey[], reader: Reader) => {
    for (const k of keys) {
      const list = of[k] ?? [];
      if (!of[k]) {
        of[k] = list;
        order.push(k);
      }
      if (!list.some((r) => r.kind === reader.kind && r.id === reader.id)) list.push(reader);
    }
  };

  for (const a of c.activities) {
    const keys: QuantityKey[] = [];
    if (a.gate) reads(a.gate, keys);
    scoreReads(a.score, keys);
    const cats = c.cats.filter((x) => x.activities.includes(a.id)).map((x) => x.id);
    add(keys, { kind: 'activity', id: a.id, cats });
  }
  for (const def of c.storylets) {
    const keys: QuantityKey[] = [];
    reads(def.trigger, keys);
    for (const st of Object.values(def.states))
      for (const e of st.exits) {
        if (e.gate) reads(e.gate, keys);
        scoreReads(e.score, keys);
        for (const t of e.terms ?? []) reads(t.if, keys);
      }
    add(keys, { kind: 'storylet', id: def.id, cats: storyletCats(c, def) });
  }
  for (const h of c.hooks) {
    const keys: QuantityKey[] = [];
    for (const r of h.rise) if ('when' in r && r.when) reads(r.when, keys);
    if (h.decay?.when) reads(h.decay.when, keys);
    const cats = c.cats.filter((x) => h.id in x.hooks).map((x) => x.id);
    add(keys, { kind: 'hook', id: h.id, cats });
  }
  for (const d of c.detectors) {
    const keys: QuantityKey[] = [];
    for (const clause of d.kernel) if ('holds' in clause) reads(clause.holds, keys);
    add(keys, { kind: 'detector', id: d.id, cats: detectorCats(c, d) });
  }
  const primeKeys: QuantityKey[] = [];
  for (const p of c.world.primes.list) reads(p.cond, primeKeys);
  add(primeKeys, { kind: 'prime', id: 'primes', cats: [c.world.primes.cat] });
  add(
    requirementFacts(c).map((f) => `fact:${f}`),
    { kind: 'anchor', id: 'requirements', cats: [] },
  );
  const worldKeys: QuantityKey[] = [];
  reads(c.anchor.fraysIf, worldKeys);
  for (const e of c.edges) if (e.when) reads(e.when, worldKeys);
  for (const o of c.objects) if (o.visibleWhen) reads(o.visibleWhen, worldKeys);
  add(worldKeys, { kind: 'world', id: 'world', cats: [] });

  const { links, raceCounters } = selectLinks(c, of, order);
  return { of, order, links, raceCounters };
}

/** The followed protagonists: never fogged (03 §13.1). The demo follows the one without a locked thread. */
export const followedCats = (c: Content): CatId[] =>
  c.cats.filter((x) => x.kind === 'protagonist' && !x.lockedThread).map((x) => x.id);

/** For each fact, the storylets that set it (03 §12.2: an effect `fact`, or `factIfPerceivedBy`). */
export function factSetters(c: Content): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const sl of c.storylets)
    for (const st of Object.values(sl.states))
      for (const e of st.onEnter ?? []) {
        const set =
          'fact' in e ? [e.fact] : 'emit' in e ? Object.values(e.factIfPerceivedBy ?? {}) : [];
        for (const f of set) if (!(out[f] ??= []).includes(sl.id)) out[f].push(sl.id);
      }
  return out;
}

/**
 * The main storylets (03 §12.2): those with an effect that sets a fact named in the anchor's
 * requirement tree, the anchor fact included; in file order. Derived at load, never authored.
 */
export function mainStorylets(c: Content): string[] {
  const setters = factSetters(c);
  const facts = [...requirementFacts(c), c.anchor.id];
  const main = facts.flatMap((f) => setters[f] ?? []);
  return c.storylets.map((s) => s.id).filter((id) => main.includes(id));
}

/** The counters a condition compares (`{ counter, … }` leaves). */
function counterLeaves(cond: Condition, out: Extract<Condition, { counter: string }>[]): void {
  if ('all' in cond) cond.all.forEach((x) => counterLeaves(x, out));
  else if ('any' in cond) cond.any.forEach((x) => counterLeaves(x, out));
  else if ('not' in cond) counterLeaves(cond.not, out);
  else if ('counter' in cond) out.push(cond);
}

/** The one counter comparison a gate makes, if it makes exactly one. */
export function gateCounter(
  gate: Condition | undefined,
): Extract<Condition, { counter: string }> | null {
  if (!gate) return null;
  const out: Extract<Condition, { counter: string }>[] = [];
  counterLeaves(gate, out);
  return out.length === 1 ? (out[0] ?? null) : null;
}

/**
 * Links (03 §13.5). First, one per counter **race**: a fact set for sure on entering a storylet
 * state through an auto exit gated on that counter (the first found, in file order), so each case
 * holds its own side of the threshold (Tagir, 2026-11-23). Then facts and storylet states read by
 * at least two different cats or by the anchor's requirement tree, ranked by the number of readers
 * (distinct cats, plus one for the tree), ties by first-seen order. Never the weather's own facts,
 * and never a fact only storylets binding a followed protagonist set: the lantern holds those.
 * At most `fog.maxLinks`.
 */
function selectLinks(
  c: Content,
  of: Record<QuantityKey, Reader[]>,
  order: QuantityKey[],
): { links: Link[]; raceCounters: string[] } {
  const followed = followedCats(c);
  const setters = factSetters(c);
  const lanternFact = (fact: string) => {
    const by = setters[fact] ?? [];
    return (
      by.length > 0 &&
      by.every((id) =>
        storyletCats(c, need(c.storylet, id, 'storylet')).some((x) => followed.includes(x)),
      )
    );
  };
  const races: QuantityKey[] = [];
  const raced: string[] = [];
  for (const sl of c.storylets)
    for (const st of Object.values(sl.states))
      for (const e of st.exits) {
        const leaf = e.kind === 'auto' ? gateCounter(e.gate) : null;
        if (!leaf || raced.includes(leaf.counter)) continue;
        const fact = (sl.states[e.to]?.onEnter ?? []).find(
          (x): x is Extract<typeof x, { fact: string }> => 'fact' in x && x.chance === undefined,
        )?.fact;
        if (fact === undefined || lanternFact(fact)) continue;
        raced.push(leaf.counter);
        races.push(`fact:${fact}`);
      }
  const ranked: { key: QuantityKey; n: number; i: number }[] = [];
  order.forEach((key, i) => {
    if (!key.startsWith('fact:') && !key.startsWith('state:')) return;
    if (c.world.engineFacts.includes(key.slice(5))) return;
    if (races.includes(key) || (key.startsWith('fact:') && lanternFact(key.slice(5)))) return;
    const readers = of[key] ?? [];
    const cats = new Set<CatId>(readers.flatMap((r) => r.cats)).size;
    const tree = readers.some((r) => r.kind === 'anchor') ? 1 : 0;
    if (cats >= 2 || tree === 1) ranked.push({ key, n: cats + tree, i });
  });
  ranked.sort((a, b) => b.n - a.n || a.i - b.i);
  const keys = [...races, ...ranked.map((x) => x.key)].slice(0, c.tuning.fog.maxLinks);
  const links = keys.map((key): Link => {
    if (key.startsWith('fact:')) return { kind: 'fact', fact: key.slice(5) };
    const rest = key.slice(6);
    const dot = rest.lastIndexOf('.');
    return { kind: 'state', storylet: rest.slice(0, dot), state: rest.slice(dot + 1) };
  });
  return { links, raceCounters: raced.filter((_, i) => keys.includes(races[i] ?? '')) };
}

/**
 * The place perception table (03 §13.6): for each cat, sense and weather, the range in mm from
 * each node to each node (`range[i * nodes + j]`, cat at node i, source at node j), before a
 * sound's radius. Perceived when the squared distance in mm² is within the range squared.
 */
export interface PerceptionTable {
  nodes: number;
  /** dist2 between node i and node j in m², `[i * nodes + j]`. */
  dist2: number[];
  /** `range[cat][sense][weather][i * nodes + j]` in mm. */
  range: Record<CatId, Record<Sense, Record<Weather, number[]>>>;
}

export function buildPerceptionTable(c: Content): PerceptionTable {
  const n = c.nodes.length;
  const dist2: number[] = [];
  for (const a of c.nodes)
    for (const b of c.nodes) {
      const dx = a.pos[0] - b.pos[0];
      const dz = a.pos[1] - b.pos[1];
      dist2.push(dx * dx + dz * dz);
    }
  const range: PerceptionTable['range'] = {};
  for (const cat of c.cats) {
    const table = (sense: Sense, weather: Weather) =>
      c.nodes.flatMap((a) =>
        c.nodes.map((b) => rangeBetween(c, cat.id, a.id, b.id, weather, sense)),
      );
    range[cat.id] = {
      sight: { dry: table('sight', 'dry'), rain: table('sight', 'rain') },
      hearing: { dry: table('hearing', 'dry'), rain: table('hearing', 'rain') },
    };
  }
  return { nodes: n, dist2, range };
}

/** Whether a cat at node index `i` perceives a source at node index `j` (03 §13.6). */
export function tablePerceives(
  t: PerceptionTable,
  cat: CatId,
  sense: Sense,
  weather: Weather,
  i: number,
  j: number,
  radiusM: number | null = null,
): boolean {
  let r = t.range[cat]?.[sense][weather][i * t.nodes + j] ?? 0;
  if (radiusM !== null) r = Math.min(r, radiusM * 1000);
  return (t.dist2[i * t.nodes + j] ?? 0) * 1_000_000 <= r * r;
}
