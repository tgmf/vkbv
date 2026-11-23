// `npm run sim -- --seed 1 [--stream 0] [--pinset name | --pins f.json] [--content dir] [--from t] [--to t] [--cat id]`
// Runs one history headless and prints one line per event, then the end and the final state hash.
// `--fog [--strain]`: the wave instead, a whole-day run hour by hour (`--strain` adds strain each hour:
// minutes on Chapter 1); `--projection`: the fog alone from tick 0 (fog-report.ts). Both ignore
// --stream, --from, --to and --cat.
import { parseArgs } from 'node:util';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../content/chapter1';
import { ContentError, loadChapter, loadTuning, parsePinSets } from '../content/load';
import { hashState } from '../sim/hash';
import { runHistory } from '../sim/history';
import { hhmm } from '../sim/space';
import { traceLine } from '../sim/trace';
import type { Pin, SimEvent } from '../sim/types';
import { readChapterDir, readJson } from './files';
import { fogReport } from './fog-report';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    stream: { type: 'string', default: '0' },
    pins: { type: 'string' },
    pinset: { type: 'string' },
    content: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    cat: { type: 'string' },
    fog: { type: 'boolean', default: false },
    projection: { type: 'boolean', default: false },
    strain: { type: 'boolean', default: false },
  },
});

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
const pins = values.pinset
  ? (parsePinSets(PINSETS_FILE, c)[values.pinset] ?? [])
  : values.pins
    ? (readJson(values.pins) as { pins: Pin[] }).pins
    : [];
const from = values.from === undefined ? 0 : Number(values.from);
const to = values.to === undefined ? Infinity : Number(values.to);

if (values.fog || values.projection) {
  for (const line of fogReport(c, seed, pins, values.fog ? 'fog' : 'projection', values.strain))
    console.log(line);
  process.exit(0);
}

const mentions = (e: SimEvent, cat: string) => JSON.stringify(e).includes(`"${cat}"`);

const h = runHistory(c, seed, stream, pins);
h.events.forEach((list, t) => {
  if (t < from || t > to) return;
  for (const e of list) {
    if (values.cat && !mentions(e, values.cat)) continue;
    console.log(traceLine(c, t, e));
  }
});
const last = h.states[h.states.length - 1];
console.log(`end ${h.end.kind} at ${h.end.tick} (${hhmm(c, h.end.tick)})`);
console.log(`final hash ${hashState(last)}`);
