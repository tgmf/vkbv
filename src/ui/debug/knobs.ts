// The Tuning tab's pure helpers (06 §10): set one knob by its dotted key, and the tuning as the text of
// a `tuning.json`. Validation happens where the content is loaded (src/main.tsx and the worker).
import type { Tuning } from '../../content/schemas/tuning';

/** A copy of `tuning` with the knob at `key` (e.g. "fog.minStatePpm") set to `value`. */
export function setAt(tuning: Tuning, key: string, value: unknown): unknown {
  const parts = key.split('.');
  const copy = JSON.parse(JSON.stringify(tuning)) as Record<string, unknown>;
  let at: Record<string, unknown> = copy;
  for (const p of parts.slice(0, -1)) {
    const next = at[p];
    if (typeof next !== 'object' || next === null) throw new Error(`no knob ${key}`);
    at = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1] ?? '';
  if (!(last in at)) throw new Error(`no knob ${key}`);
  at[last] = value;
  return copy;
}

/** The tuning as a `tuning.json` file's text ("copy as JSON"). */
export const tuningJson = (tuning: Tuning): string => `${JSON.stringify(tuning, null, 2)}\n`;
