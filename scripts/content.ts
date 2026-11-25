// `npm run content:check`: runs the content loader in Node (spec 02 §5) and prints warnings.
//   -- --todos    every text key that still holds a writer marker
//   -- --actions  every activity and interrupt action each cat can show (docs/art-brief.md)
import { parseArgs } from 'node:util';
import { catActions, writerTodos } from '../src/cli/content-lists';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../src/content/chapter1';
import { ContentError, loadChapter, loadText, loadTuning, parsePinSets } from '../src/content/load';
import uiEn from '../src/content/data/ui/en.json';
import uiRu from '../src/content/data/ui/ru.json';

const { values } = parseArgs({
  options: {
    todos: { type: 'boolean', default: false },
    actions: { type: 'boolean', default: false },
  },
});
const problems: string[] = [];
const warnings: string[] = [];
try {
  const tuning = loadTuning(TUNING_FILE);
  const ui = loadText('ui', uiEn, uiRu);
  const c = loadChapter(CHAPTER1_FILES, tuning, warnings);
  const sets = parsePinSets(PINSETS_FILE, c);
  console.log(`pin sets: ${Object.keys(sets).join(', ')}`);
  console.log(
    `places ${c.nodes.length}, edges ${c.edges.length}, cats ${c.cats.length}, activities ${c.activities.length}, ` +
      `objects ${c.objects.length}, cards ${c.cards.length}, storylets ${c.storylets.length}, detectors ${c.detectors.length}`,
  );
  if (values.todos) {
    const todos = writerTodos({
      'ch1/text/en.json': c.text.en,
      'ch1/text/ru.json': c.text.ru,
      'ui/en.json': ui.en,
      'ui/ru.json': ui.ru,
    });
    console.log(`\nwriter markers: ${todos.length}`);
    for (const line of todos) console.log(`  ${line}`);
  }
  if (values.actions) {
    console.log('\nwhat each cat can show (activities; interrupt and delay actions):');
    for (const x of catActions(c))
      console.log(
        `  ${x.cat}: ${x.activities.join(', ')}; actions: ${x.actions.join(', ') || '—'}`,
      );
  }
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
