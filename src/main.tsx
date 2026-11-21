import { render } from '@solidjs/web';
import { createSimClient } from './bridge/client';
import { ContentError, loadAll, parsePinSets } from './content/load';
import { tuningRows } from './content/schemas';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from './content/chapter1';
import uiEn from './content/data/ui/en.json';
import uiRu from './content/data/ui/ru.json';
import { addTables } from './i18n/t';
import { App, ContentErrorScreen } from './ui/App';
import './ui/theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('index.html is missing #app');

try {
  const { tuning, ui, content } = loadAll({
    tuning: TUNING_FILE,
    uiEn,
    uiRu,
    chapter: CHAPTER1_FILES,
  });
  addTables(ui);
  addTables(content.text);
  const sim = createSimClient();
  void sim.request({ kind: 'init', tuning }).then((reply) => {
    document.documentElement.dataset.sim = reply.kind; // "ready"; read by the smoke test
  });
  const inspector = {
    content,
    pinsets: Object.keys(parsePinSets(PINSETS_FILE, content)),
    sim,
    speeds: tuning.player.playSpeedsTps,
  };
  render(() => <App tuningRows={tuningRows(tuning)} inspector={inspector} />, root);
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  addTables({ en: uiEn, ru: uiRu });
  render(() => <ContentErrorScreen problems={e.problems} />, root);
}
