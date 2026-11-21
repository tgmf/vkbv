// `npm run sim -- --seed 1 [--stream 0] [--pins f.json] [--content dir] [--from t] [--to t] [--cat id]`
// Runs one history headless and prints one line per event, then the end and the final state hash.
import { parseArgs } from 'node:util';
import { CHAPTER1_FILES, TUNING_FILE } from '../content/chapter1';
import { ContentError, loadChapter, loadTuning } from '../content/load';
import { hashState } from '../sim/hash';
import { runHistory } from '../sim/history';
import { hhmm } from '../sim/space';
import type { Pin, SimEvent } from '../sim/types';
import { readChapterDir, readJson } from './files';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    stream: { type: 'string', default: '0' },
    pins: { type: 'string' },
    content: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    cat: { type: 'string' },
    waves: { type: 'boolean', default: false },
  },
});
if (values.waves) {
  console.log('--waves is not available until M2.');
  process.exit(0);
}

let c;
try {
  c = loadChapter(
    values.content ? readChapterDir(values.content) : CHAPTER1_FILES,
    loadTuning(TUNING_FILE),
  );
} catch (e) {
  if (e instanceof ContentError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
const seed = Number(values.seed);
const stream = Number(values.stream);
const pins = values.pins ? (readJson(values.pins) as { pins: Pin[] }).pins : [];
const from = values.from === undefined ? 0 : Number(values.from);
const to = values.to === undefined ? Infinity : Number(values.to);

/** The details of an event, in a few words. */
function describe(e: SimEvent): string {
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

const mentions = (e: SimEvent, cat: string) => JSON.stringify(e).includes(`"${cat}"`);

const h = runHistory(c, seed, stream, pins);
h.events.forEach((list, t) => {
  if (t < from || t > to) return;
  for (const e of list) {
    if (values.cat && !mentions(e, values.cat)) continue;
    console.log(`${String(t).padStart(3)} ${hhmm(c, t)} ${e.type.padEnd(16)} ${describe(e)}`);
  }
});
const last = h.states[h.states.length - 1];
console.log(`end ${h.end.kind} at ${h.end.tick} (${hhmm(c, h.end.tick)})`);
console.log(`final hash ${hashState(last)}`);
