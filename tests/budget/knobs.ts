// The tuning the timing tests run with: tuning.json's, or with `FOG=minStatePpm,bands` the fog knobs to
// measure (as scripts/calibrate.ts and scripts/fog-bench.ts take them), without editing tuning.json.
import { CHAPTER1_FILES, TUNING_FILE } from '../../src/content/chapter1';
import { loadChapter, loadTuning } from '../../src/content/load';
import type { Tuning } from '../../src/content/schemas/tuning';

const base = loadTuning(TUNING_FILE);
const [minStatePpm, bands] = (process.env['FOG'] ?? '').split(',').map(Number);

/** The override sent with the worker's `init` (a top-level key replaces tuning.json's whole key). */
export const more: Partial<Tuning> =
  minStatePpm || bands
    ? {
        fog: {
          ...base.fog,
          ...(minStatePpm ? { minStatePpm } : {}),
          ...(bands ? { bands } : {}),
        },
      }
    : {};

export const c = loadChapter(CHAPTER1_FILES, { ...base, ...more });

/** The fog knobs in use, for the printed line. */
export const knobs = `knobs ${c.tuning.fog.minStatePpm}/${c.tuning.fog.bands}`;
