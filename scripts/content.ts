// `npm run content:check`: runs the content loader in Node (spec 02 §5).
// ch1/ is validated from M1 on (M0 brief, item 6).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentError, loadAll } from '../src/content/load';

const DATA = join(import.meta.dirname, '..', 'src', 'content', 'data');
const read = (file: string): unknown => JSON.parse(readFileSync(join(DATA, file), 'utf8'));

try {
  loadAll({ tuning: read('tuning.json'), uiEn: read('ui/en.json'), uiRu: read('ui/ru.json') });
  console.log('content OK: tuning.json, ui/en.json, ui/ru.json (ch1/ is checked from M1)');
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  console.error(e.message);
  process.exit(1);
}
