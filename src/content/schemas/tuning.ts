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
    checkpointEvery: int('Ticks between checkpoints of the played stretch (03 §17)').min(1),
    anchorConditioning: bool(
      'Treat the anchor as already seen: case weights lean toward reaching it (03 §14)',
    ),
  }),
  fog: z.strictObject({
    stepTicks: int('Ticks per fog step (03 §13.2)').min(1),
    minStatePpm: ppm('Chain states below this are dropped and the chain renormalised'),
    bands: int('Bands per changing gauge (03 §13.2)').min(1),
    maxBandedGauges: int('Banded gauges per cat; the rest are mean-field').min(0),
    gateThresholdPpm: ppm('A gate holds in the fog at this probability (03 §13.3)'),
    maxLinks: int('Links besides the weather (03 §13.5)').min(0),
    linkFloorPpm: ppm('A lasting meeting effect becomes a link above this, about 5%'),
    contributors: int('Contributor heap size per fact, flag and heard (03 §13.5)').min(1),
    frayBelowPpm: ppm('The projection frays below this chance of reaching the anchor (03 §16)'),
    exactTolerancePpm: ppm('Tiny-world exactness test tolerance (03 §18)'),
  }),
  lantern: z.strictObject({
    releaseAfterTicks: int(
      'Ticks unperceived before a live cat returns to the fog (03 §13.4)',
    ).min(1),
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
    requireFacts: z.array(z.string()).describe('Facts a vetted seed must make likely (04 §2)'),
    minPpm: ppm('Probability each required fact must reach for a seed to pass vetting'),
    maxCandidates: int('Seeds tried before vetting gives up').min(1),
  }),
  player: z.strictObject({
    playedCardRule: z
      .enum(['pinned', 'spent', 'discard'])
      .describe('What happens to a card once played (04 §3)'),
    playSpeedsTps: z
      .array(z.int().min(1))
      .min(1)
      .describe('Playback speeds, ticks per real second'),
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
    recomputeMs: int('Median recompute time budget after an edit (07 §4)').min(1),
  }),
  calibration: z.strictObject({
    seeds: int('Seeds in the full calibration run (07 §3)').min(1),
    seedsQuick: int('Seeds in the quick calibration inside npm run check').min(1),
    minPerBucket: int('Pairs a probability bucket needs to be checked').min(1),
    tolerancePpm: ppm('Largest allowed gap between predicted and observed frequency'),
  }),
  flags: z.strictObject({
    telemetry: bool('Send telemetry when VITE_TELEMETRY_URL is set'),
    assist: bool('Assist-mode highlights on by default'),
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
