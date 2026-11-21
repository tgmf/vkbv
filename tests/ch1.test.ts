// Chapter 1 content: loading, cross-check failures, and B8 (05 §5.2).
import { describe, expect, it } from 'vitest';
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import { ContentError, loadChapter, loadTuning, type ChapterFiles } from '../src/content/load';
import { pinsPhase } from '../src/sim/pins';
import castJson from '../src/content/data/ch1/cast.json';
import mapJson from '../src/content/data/ch1/map.json';
import ruJson from '../src/content/data/ch1/text/ru.json';
import { cardPin, ch1, makeCtx } from './sim/helpers';

const tuning = loadTuning(TUNING_FILE);
const problems = (files: ChapterFiles): string[] => {
  try {
    loadChapter(files, tuning);
  } catch (e) {
    if (e instanceof ContentError) return e.problems;
    throw e;
  }
  return [];
};
/** Chapter 1 with some files replaced. */
const withFiles = (files: Partial<ChapterFiles>): ChapterFiles => ({ ...CHAPTER1_FILES, ...files });

describe('Chapter 1 content', () => {
  it('loads with 0 errors: 28 places, 31 edges, 12 cats, 16 storylets', () => {
    const warnings: string[] = [];
    const c = loadChapter(CHAPTER1_FILES, tuning, warnings);
    expect([c.nodes.length, c.edges.length, c.cats.length, c.storylets.length]).toEqual([
      28, 31, 12, 16,
    ]);
    expect(warnings.every((w) => w.includes('nothing reacts'))).toBe(true);
  });

  it('core cast mode keeps only the five core cats', () => {
    const core = loadChapter(CHAPTER1_FILES, { ...tuning, content: { castMode: 'core' } });
    expect(core.cats.map((x) => x.id)).toEqual(['marti', 'rokko', 'prasha', 'gavrila', 'bublik']);
  });

  it('each kind of mistake fails, and one error lists every problem', () => {
    const cast = structuredClone(castJson);
    const [marti, rokko] = cast.cats;
    if (!marti || !rokko) throw new Error('cast');
    marti.home = 'nowhere';
    expect(problems(withFiles({ cast }))).toEqual(['cat marti: unknown home nowhere']);
    rokko.activities.push('juggle');
    expect(problems(withFiles({ cast }))).toEqual([
      'cat marti: unknown home nowhere',
      'cat rokko: unknown activity juggle',
    ]);

    const fraction = structuredClone(mapJson);
    const edge = fraction.edges[0];
    if (edge) edge.minutes = 1.5;
    expect(problems(withFiles({ map: fraction }))[0]).toMatch(
      /^ch1\/map\.json: edges\.0\.minutes: .*expected int/,
    );

    const cut = structuredClone(mapJson);
    cut.edges = cut.edges.filter((e) => e.b !== 'beach.boat');
    expect(problems(withFiles({ map: cut }))).toContain(
      'place beach.boat is not connected to flat.study',
    );

    const lava = structuredClone(mapJson);
    lava.nodes[0]?.tags.push('lava');
    expect(problems(withFiles({ map: lava }))).toEqual(['place flat.study: unknown tag lava']);

    const ru: Record<string, string> = { ...ruJson };
    delete ru['cat.marti'];
    expect(problems(withFiles({ textRu: ru }))).toContain(
      'ch1/text/ru.json: missing key cat.marti',
    );
  });
});

describe('B8: cards on Marti are weak (willpower 850)', () => {
  it('tea_break shifts teaCraving by exactly +45; something_shiny shifts questionItch by exactly +18', () => {
    const ctx = makeCtx(ch1, { t: 100, pins: [cardPin('tea_break', { cat: 'marti' }, 100)] });
    pinsPhase(ctx);
    const marti = ctx.s.cats['marti'];
    expect(marti?.mods.find((m) => m.gauge === 'teaCraving')?.add).toBe(45);
    const ctx2 = makeCtx(ch1, {
      t: 200,
      pins: [cardPin('something_shiny', { cat: 'marti' }, 200)],
    });
    pinsPhase(ctx2);
    expect(ctx2.s.cats['marti']?.mods.find((m) => m.gauge === 'questionItch')?.add).toBe(18);
  });
});
