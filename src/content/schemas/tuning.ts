// Schema for src/content/data/tuning.json: every engine knob that is not content (spec 05 §4).
// The .describe() texts are the knobs' documentation; the debug panel shows them.
import { z } from 'zod';

const int = (description: string) => z.int().describe(description);
const ppm = (description: string) => z.int().min(0).max(1_000_000).describe(description);
const bool = (description: string) => z.boolean().describe(description);

export const TuningSchema = z.strictObject({
  version: z.string().describe('Tuning set id, recorded with bug reports and telemetry'),
  content: z.strictObject({
    castMode: z
      .enum(['full', 'core'])
      .describe('"full" = all 12 cats; "core" = only cats marked core: true (05 §3)'),
  }),
  waves: z.strictObject({
    checkpointEvery: int('Ticks between checkpoints of the lantern (03 §17)').min(1),
    anchorConditioning: bool(
      'Treat the anchor as already seen: case weights lean toward reaching it (03 §14)',
    ),
    streamEveryMs: int(
      'During a re-run the worker posts the frames computed so far, and takes newer requests, this often (ms; 02 §3)',
    ).min(1),
  }),
  fog: z.strictObject({
    stepTicks: int('Ticks per fog step (03 §13.2)').min(1),
    minStatePpm: ppm('Chain states below this are dropped and the chain renormalised'),
    bands: int('Bands per changing gauge (03 §13.2)').min(1),
    boredomWhole: bool(
      'Fog boredom moves whole bands: each chain state carries its exact boredom, so no mass splits (docs/questions.md M2-7; off = 03 §13.2 as written)',
    ),
    counterByChain: bool(
      "Each chain state carries what its mass has added to counters through activities' `while` effects (mean and variance), so a counter's spread keeps how long cats keep at an activity (docs/questions.md M2-8, M2-23); off: each step's work is an independent term (03 §13.6 as written)",
    ),
    saturatedBandFrom: int(
      'Banded gauges: n − 1 equal bands below this value, one saturated band from it to 1 000 (03 §13.2)',
    )
      .min(1)
      .max(1000),
    ppmQuantum: int(
      'Fog probabilities in decision keys and fog decisions are rounded down to this (03 §8.2)',
    ).min(1),
    maxBandedGauges: int('Banded gauges per cat; the rest are mean-field').min(0),
    gateThresholdPpm: ppm('A gate holds in the fog at this probability (03 §13.3)'),
    maxLinks: int('Links besides the weather (03 §13.5)').min(0),
    linkFloorPpm: ppm('A lasting meeting effect becomes a link above this, about 5%'),
    contributors: int('Contributor heap size per fact, flag and heard (03 §13.5)').min(1),
    frayBelowPpm: ppm('The lantern, and a projection, fray below this chance of reaching the anchor (03 §16)'),
    exactTolerancePpm: ppm('Tiny-world exactness test tolerance (03 §18)'),
  }),
  behaviour: z.strictObject({
    boredomWeight: int('Score taken from the current activity at full boredom (03 §8.2)').min(0),
  }),
  lantern: z.strictObject({
    releaseAfterTicks: int('Ticks unperceived before a live cat returns to the fog (03 §13.4)').min(
      1,
    ),
    dwellTicks: int('Ticks a placed cat keeps its activity before deciding (03 §15.1)').min(0),
  }),
  observation: z.strictObject({
    reopenBelowPpm: ppm(
      'A watched fact reopens if its forced parts fall below this probability; 0 = only when impossible (open question, keep 0)',
    ),
  }),
  sifting: z.strictObject({
    maxMatchesPerPattern: int('Partial matches kept per detector pool (03 §10.4)').min(1),
  }),
  pressure: z.strictObject({
    decayPerTick: int('Pressure lost by every cat each tick').min(0),
    cap: int('Most pressure a cat can hold').min(0),
  }),
  voice: z.strictObject({
    cooldownTicks: int('Ticks before the same hook can voice a line again (03 §10.3)').min(0),
    radiusM: int('Metres a voiced line carries').min(0),
  }),
  charge: z.strictObject({
    floorOn: bool('Apply the charge floor at rain start (economy.json)'),
    multCapPm: int('Cap on the pressure multiplier for payouts, per mille').min(1000),
  }),
  frontier: z.strictObject({
    countAtPpm: ppm('A requirement counts toward frontier progress at this probability'),
  }),
  vetting: z.strictObject({
    solutions: z
      .array(z.string())
      .min(1)
      .describe('The recorded solutions vetting runs: pin sets of 05 §5.1 (04 §2)'),
    requireFacts: z.array(z.string()).describe('Facts a vetted seed must make likely (04 §2)'),
    minPpm: ppm('Probability each required fact must reach for a seed to pass vetting'),
    minStorylets: int(
      "The solutions' runs must enter at least the smaller of this many authored storylets… (04 §2)",
    ).min(0),
    minStoryletSharePerMille: int('… and this share of them, rounded up (04 §2)').min(0).max(1000),
    maxCandidates: int('Seeds tried before vetting gives up').min(1),
  }),
  player: z.strictObject({
    playedCardRule: z
      .enum(['pinned', 'spent', 'discard'])
      .describe('What happens to a card once played (04 §3)'),
    shuttleTps: z
      .array(z.int().min(1))
      .min(1)
      .describe('Shuttle speeds, ticks per real second in either direction (06 §3)'),
    observeMaxTps: int(
      'Forward at up to this speed is playback and observes; faster behind the edge is a scrub (06 §3)',
    ).min(1),
  }),
  timeline: z.strictObject({
    minSpanTicks: int(
      'The bar spans at least this many ticks, then rescales to keep the lantern edge on the right (06 §3)',
    ).min(1),
  }),
  end: z.strictObject({
    afterAnchorTicks: int('Ticks shown after the meeting').min(0),
  }),
  render: z.strictObject({
    focusLayerHz: int('Focus layer refresh rate, at most 3 (06 §2)').min(1).max(3),
    focusSamples: int('Coherent trajectories offered to the focus layer (03 §16)').min(1),
    displayBudget: int('Most cat markers drawn at rest (06 §2)').min(1),
  }),
  budgets: z.strictObject({
    recomputeMs: int('Median time from an edit to the re-run’s first streamed frames (07 §4)').min(
      1,
    ),
    rerunTps: int('Ticks per second a re-run streams at, at least (07 §4)').min(1),
    observeMs: int('Median time of one observe at the lantern edge, in playback (07 §4)').min(1),
  }),
  calibration: z.strictObject({
    seeds: int('Seeds in the full calibration run (07 §3)').min(1),
    seedsQuick: int('Seeds in the quick calibration (npm run calibrate -- --quick; not in npm run check, docs/questions.md M2-23)').min(1),
    minPerBucket: int('Pairs a probability bucket needs to be checked').min(1),
    tolerancePpm: ppm('Largest allowed gap between predicted and observed frequency'),
    observedPpm: ppm(
      "An event counts as observed in a run once the protagonists' perception moves its chance by at least this; its forecast is the chance just before (07 §3, docs/questions.md M2-26)",
    ),
  }),
  flags: z.strictObject({
    telemetry: bool('Send telemetry when VITE_TELEMETRY_URL is set'),
    assist: bool('Assist-mode highlights on by default'),
    jumpToEdge: bool('A "jump to the edge" button and End key, for playtests only (06 §3)'),
  }),
});

export type Tuning = z.infer<typeof TuningSchema>;

export interface TuningRow {
  key: string; // dotted path, e.g. "waves.cap"
  value: string; // JSON of the current value
  description: string;
}

/** Flattens tuning into rows with their schema descriptions, for the debug panel. */
export function tuningRows(tuning: Tuning): TuningRow[] {
  const rows: TuningRow[] = [];
  const walk = (schema: z.ZodType, value: unknown, path: string): void => {
    if (schema instanceof z.ZodObject) {
      for (const [k, child] of Object.entries<unknown>(schema.shape))
        if (child instanceof z.ZodType)
          walk(child, (value as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    } else {
      rows.push({ key: path, value: JSON.stringify(value), description: schema.description ?? '' });
    }
  };
  walk(TuningSchema, tuning, '');
  return rows;
}
