// The Tuning tab (06 §10): a knob set by its key, and "copy as JSON" giving a valid tuning.json.
import { describe, expect, it } from 'vitest';
import { loadTuning } from '../../src/content/load';
import { TUNING_FILE } from '../../src/content/chapter1';
import { tuningRows } from '../../src/content/schemas';
import { setAt, tuningJson } from '../../src/ui/debug/knobs';

const tuning = loadTuning(TUNING_FILE);

describe('the Tuning tab (06 §10)', () => {
  it('copy as JSON gives a valid tuning.json, equal to the tuning', () => {
    const text = tuningJson(tuning);
    expect(loadTuning(JSON.parse(text))).toEqual(tuning);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('every row can be set to its own value and reloads the same', () => {
    let raw: unknown = tuning;
    for (const row of tuningRows(tuning))
      raw = setAt(loadTuning(raw), row.key, JSON.parse(row.value));
    expect(loadTuning(raw)).toEqual(tuning);
  });

  it('a knob set by its key changes only that knob, and never the input', () => {
    const before = JSON.stringify(tuning);
    const next = loadTuning(setAt(tuning, 'fog.minStatePpm', 3000));
    expect(next.fog.minStatePpm).toBe(3000);
    expect({ ...next, fog: { ...next.fog, minStatePpm: tuning.fog.minStatePpm } }).toEqual(tuning);
    expect(JSON.stringify(tuning)).toBe(before);
  });

  it('an unknown key is refused; a bad value fails validation', () => {
    expect(() => setAt(tuning, 'fog.nope', 1)).toThrow('no knob fog.nope');
    expect(() => setAt(tuning, 'nope.x', 1)).toThrow('no knob');
    expect(() => loadTuning(setAt(tuning, 'fog.bands', 'three'))).toThrow();
  });
});
