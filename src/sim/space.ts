// Time of day, positions, distances and paths (spec 03 §2, §3).
import type { CatState, Content, EdgeId, NodeId, Pos } from './types';
import { need } from './types';

// --- time (03 §2) -------------------------------------------------------------------------------
const toMinutes = (hhmm: string): number => {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
};

/** Clock time of tick t, in minutes after midnight. */
export const clockAt = (c: Content, t: number): number =>
  (toMinutes(c.world.startClock) + t * c.world.tickMinutes) % 1440;

/** `[from, to]` inclusive; wraps past midnight when to < from. */
export function inWindow(c: Content, t: number, [from, to]: readonly [string, string]): boolean {
  const now = clockAt(c, t);
  const a = toMinutes(from);
  const b = toMinutes(to);
  return a <= b ? now >= a && now <= b : now >= a || now <= b;
}

export const isWindowEnd = (c: Content, t: number, window: readonly [string, string]): boolean =>
  clockAt(c, t) === toMinutes(window[1]);

export const hhmm = (c: Content, t: number): string => {
  const m = clockAt(c, t);
  return `${String(Math.trunc(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// --- positions (03 §3) --------------------------------------------------------------------------
export const nodePos = (c: Content, id: NodeId): Pos => need(c.node, id, 'place').pos;

/** The place a cat counts as standing at: on an edge, the nearer end. */
export function catNode(cat: CatState): NodeId {
  const p = cat.pos;
  if ('at' in p) return p.at;
  return p.of - p.left > p.left ? p.to : p.from;
}

/** Integer position, interpolated along the edge the cat walks. */
export function catPos(c: Content, cat: CatState): Pos {
  const p = cat.pos;
  if ('at' in p) return nodePos(c, p.at);
  const [ax, az] = nodePos(c, p.from);
  const [bx, bz] = nodePos(c, p.to);
  const done = p.of - p.left;
  return [ax + Math.trunc(((bx - ax) * done) / p.of), az + Math.trunc(((bz - az) * done) / p.of)];
}

export const dist2 = (a: Pos, b: Pos): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Within m metres, compared squared. */
export const within = (a: Pos, b: Pos, m: number): boolean => dist2(a, b) <= m * m;

// --- paths (03 §3) ------------------------------------------------------------------------------
const lexLess = (a: readonly string[], b: readonly string[]): boolean => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    if (x !== y) return x < y;
  }
  return a.length < b.length;
};

export interface Reach {
  dist: Record<NodeId, number>; // minutes
  path: Record<NodeId, NodeId[]>; // places after `from`
}

/** Path results already computed for this map, keyed by from|avoid|tag. Owned by the caller. */
export type PathMemo = Record<string, Reach>;

/**
 * Dijkstra on minutes from `from`, skipping `avoid` edges (and edges without `onlyTag` when given).
 * Ties go to the lexicographically smaller sequence of place ids. Results are memoised in `memo`;
 * callers must not change what they get back.
 */
export function reach(
  c: Content,
  from: NodeId,
  avoid: readonly EdgeId[],
  onlyTag?: string,
  memo?: PathMemo,
): Reach {
  const key = `${from}|${avoid.join(',')}|${onlyTag ?? ''}`;
  const hit = memo?.[key];
  if (hit) return hit;
  const r = dijkstra(c, from, avoid, onlyTag);
  if (memo) memo[key] = r;
  return r;
}

function dijkstra(c: Content, from: NodeId, avoid: readonly EdgeId[], onlyTag?: string): Reach {
  const dist: Record<NodeId, number> = { [from]: 0 };
  const path: Record<NodeId, NodeId[]> = { [from]: [] };
  const done = new Set<NodeId>();
  for (;;) {
    let best: NodeId | null = null;
    for (const n of c.nodes) {
      const d = dist[n.id];
      if (done.has(n.id) || d === undefined) continue;
      const bd = best === null ? undefined : dist[best];
      if (
        best === null ||
        bd === undefined ||
        d < bd ||
        (d === bd && lexLess(path[n.id] ?? [], path[best] ?? []))
      )
        best = n.id;
    }
    if (best === null) return { dist, path };
    done.add(best);
    for (const { edge, to } of need(c.adj, best, 'place')) {
      const e = need(c.edge, edge, 'edge');
      if (avoid.includes(edge) || (onlyTag && !(e.tags ?? []).includes(onlyTag))) continue;
      const nd = (dist[best] ?? 0) + e.minutes;
      const np = [...(path[best] ?? []), to];
      const old = dist[to];
      if (old === undefined || nd < old || (nd === old && lexLess(np, path[to] ?? []))) {
        dist[to] = nd;
        path[to] = np;
      }
    }
  }
}

export interface PathOptions {
  avoid: readonly EdgeId[]; // the cat's knowsClosed
  memo?: PathMemo | undefined;
  via?: readonly NodeId[] | undefined;
  edgesTagged?: string | undefined;
}

/** The places to visit after `from` to reach `to`, or null when there is no path. */
export function path(c: Content, from: NodeId, to: NodeId, opts: PathOptions): NodeId[] | null {
  if (opts.edgesTagged) {
    const tagged = reach(c, from, opts.avoid, opts.edgesTagged, opts.memo).path[to];
    if (tagged) return [...tagged];
  }
  const stops = [...(opts.via ?? []), to];
  const route: NodeId[] = [];
  let here = from;
  for (const stop of stops) {
    const leg = reach(c, here, opts.avoid, undefined, opts.memo).path[stop];
    if (!leg) return null;
    route.push(...leg);
    here = stop;
  }
  return route;
}

/** The edge joining two neighbouring places. */
export function edgeBetween(c: Content, a: NodeId, b: NodeId): EdgeId | null {
  return need(c.adj, a, 'place').find((x) => x.to === b)?.edge ?? null;
}
