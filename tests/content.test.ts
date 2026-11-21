import { describe, expect, it } from 'vitest';
import { ContentError, loadText, loadTuning } from '../src/content/load';
import tuningJson from '../src/content/data/tuning.json';
import uiEn from '../src/content/data/ui/en.json';
import uiRu from '../src/content/data/ui/ru.json';

const problemsOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ContentError) return e.problems;
    throw e;
  }
  return [];
};

describe('tuning.json', () => {
  it('loads', () => {
    expect(loadTuning(tuningJson).fog.maxLinks).toBe(2);
  });

  it.each([1.5, 'many'])('a value of %j fails and names the key', (bad) => {
    const broken = { ...tuningJson, fog: { ...tuningJson.fog, maxLinks: bad } };
    const problems = problemsOf(() => loadTuning(broken));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('fog.maxLinks');
    expect(problems[0]).toContain(JSON.stringify(bad));
  });

  it('lists every problem at once, including unknown keys', () => {
    const broken = { ...tuningJson, end: { afterAnchorTicks: 1.5 }, extra: 1 };
    const problems = problemsOf(() => loadTuning(broken));
    expect(problems.join('\n')).toContain('end.afterAnchorTicks');
    expect(problems.join('\n')).toContain('extra');
  });
});

describe('interface text', () => {
  it('en and ru have the same keys', () => {
    expect(Object.keys(loadText('ui', uiEn, uiRu).en)).toContain('ui.town');
  });

  it('a key missing in one language fails', () => {
    expect(problemsOf(() => loadText('ui', { ...uiEn, 'ui.extra': 'x' }, uiRu))).toEqual([
      'ui/ru.json: missing key ui.extra',
    ]);
  });
});
