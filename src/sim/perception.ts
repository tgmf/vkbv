// What a cat can sense this tick (spec 03 §4). The only place sight and hearing are computed.
import { mulPm } from './math';
import { catNode, catPos, dist2 } from './space';
import type { CatId, Content, NodeId, Pos, SimState } from './types';
import { need } from './types';

export type Sense = 'sight' | 'hearing';
export type Weather = 'dry' | 'rain';

/** Something that can be sensed: a cat, an object, or an event (a sound when radiusM is set). */
export interface Source {
  pos: Pos;
  node: NodeId;
  radiusM: number | null;
}

/**
 * Range in millimetres for a cat standing at `hereId` sensing something at `thereId`, before a
 * sound's own radius (03 §4). Shared by live perception and the place perception table (03 §13.6).
 */
export function rangeBetween(
  c: Content,
  catId: CatId,
  hereId: NodeId,
  thereId: NodeId,
  weather: Weather,
  sense: Sense,
): number {
  const def = need(c.cat, catId, 'cat');
  const p = c.world.perception;
  const hearing = sense === 'hearing';
  let range = (hearing ? def.perception.hearingM : def.perception.sightM) * 1000;
  const here = need(c.node, hereId, 'place');
  const there = need(c.node, thereId, 'place');
  if (here.space !== there.space) {
    for (const end of [here, there]) {
      if (!end.indoor) continue;
      let pm: number;
      if (end.tags.includes('window') && weather === 'dry')
        pm = hearing ? p.openWindowHearingPerMille : p.openWindowSightPerMille;
      else if (end.doorToOutdoor) pm = hearing ? p.doorHearingPerMille : p.wallSightPerMille;
      else pm = hearing ? p.wallHearingPerMille : p.wallSightPerMille;
      range = mulPm(range, pm);
    }
  }
  if (weather === 'rain' && (!here.indoor || !there.indoor))
    range = mulPm(range, hearing ? p.rainHearingPerMille : p.rainSightPerMille);
  return range;
}

/** Effective range in millimetres between the cat and the source (03 §4). */
export function rangeMm(c: Content, s: SimState, catId: CatId, src: Source, sense: Sense): number {
  const here = catNode(need(s.cats, catId, 'cat'));
  const range = rangeBetween(c, catId, here, src.node, s.weather.now, sense);
  return src.radiusM !== null ? Math.min(range, src.radiusM * 1000) : range;
}

export function perceives(
  c: Content,
  s: SimState,
  catId: CatId,
  src: Source,
  sense: Sense,
): boolean {
  const range = rangeMm(c, s, catId, src, sense);
  return dist2(catPos(c, need(s.cats, catId, 'cat')), src.pos) * 1_000_000 <= range * range;
}
