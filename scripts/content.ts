// `npm run content:check`: runs the content loader in Node (spec 02 §5) and prints warnings.
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../src/content/chapter1';
import { ContentError, loadChapter, loadText, loadTuning, parsePinSets } from '../src/content/load';
import uiEn from '../src/content/data/ui/en.json';
import uiRu from '../src/content/data/ui/ru.json';

const problems: string[] = [];
const warnings: string[] = [];
try {
  const tuning = loadTuning(TUNING_FILE);
  loadText('ui', uiEn, uiRu);
  const c = loadChapter(CHAPTER1_FILES, tuning, warnings);
  const sets = parsePinSets(PINSETS_FILE, c);
  console.log(`pin sets: ${Object.keys(sets).join(', ')}`);
  console.log(
    `places ${c.nodes.length}, edges ${c.edges.length}, cats ${c.cats.length}, activities ${c.activities.length}, ` +
      `objects ${c.objects.length}, cards ${c.cards.length}, storylets ${c.storylets.length}, detectors ${c.detectors.length}`,
  );
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  problems.push(...e.problems);
}
for (const w of warnings) console.log(`warn  ${w}`);
for (const p of problems) console.error(`ERROR ${p}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} error(s)`);
  process.exit(1);
}
console.log('content OK');
