// Events as one line of text each, for the CLI and the dev inspector.
import { hhmm } from './space';
import type { Content, SimEvent } from './types';

/** The details of an event, in a few words. */
export function describe(e: SimEvent): string {
  switch (e.type) {
    case 'pinFired':
      return `${e.pin}${e.special ? ' (special)' : ''}`;
    case 'fizzle':
      return `${e.pin} ${e.reason}`;
    case 'emit':
      return `${e.name} at ${e.node}${e.radiusM === null ? '' : ` r${e.radiusM}m`}${e.source ? ` from ${e.source}` : ''}${e.to ? ` to ${e.to}` : ''}`;
    case 'voice':
      return `${e.cat} ${e.hook}: ${e.line}`;
    case 'depart':
      return `${e.cat} ${e.from} -> ${e.to}`;
    case 'arrive':
      return `${e.cat} at ${e.node}`;
    case 'blocked':
      return `${e.cat} at ${e.edge}`;
    case 'activity':
      return `${e.cat} ${e.activity}${e.place ? ` @ ${e.place}` : ''}`;
    case 'activityFinished':
      return `${e.cat} ${e.activity}`;
    case 'interrupt':
      return `${e.cat} ${e.action} ${e.ticks}t (${e.by})`;
    case 'storylet':
      return `${e.id}.${e.state} ${Object.entries(e.roles)
        .map(([r, cats]) => `${r}=${cats.join('+')}`)
        .join(' ')}`;
    case 'detector':
      return e.id;
    case 'fact':
      return e.fact;
    case 'anchor':
      return e.reached ? 'reached' : 'dead';
  }
}

/** `tick HH:MM type details`, the line format of `npm run sim`. */
export const traceLine = (c: Content, t: number, e: SimEvent): string =>
  `${String(t).padStart(3)} ${hhmm(c, t)} ${e.type.padEnd(16)} ${describe(e)}`;
