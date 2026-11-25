import { render } from '@solidjs/web';
import { createSimClient } from './bridge/client';
import { ContentError, loadAll, parsePinSets } from './content/load';
import { tuningRows } from './content/schemas';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from './content/chapter1';
import vetted from './content/data/ch1/vetted-seeds.json';
import uiEn from './content/data/ui/en.json';
import uiRu from './content/data/ui/ru.json';
import { addTables } from './i18n/t';
import { App, ContentErrorScreen } from './ui/App';
import { createGame } from './ui/game';
import './ui/theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('index.html is missing #app');

const query = new URLSearchParams(location.search);

/** Feature flags overridden by the URL for testing (02 §6): `?flag.jumpToEdge=1`. */
function withFlags(file: unknown): unknown {
  const t = file as { flags?: Record<string, unknown> };
  const flags = { ...t.flags };
  for (const [key, value] of query)
    if (key.startsWith('flag.'))
      flags[key.slice('flag.'.length)] = value === '1' || value === 'true';
  return { ...t, flags };
}

try {
  const { tuning, ui, content } = loadAll({
    tuning: withFlags(TUNING_FILE),
    uiEn,
    uiRu,
    chapter: CHAPTER1_FILES,
  });
  addTables(ui);
  addTables(content.text);
  const sim = createSimClient();
  const dev = query.get('dev') === '1';
  // Until M7's new-game flow, the first vetted seed; the dev page plays a typed seed as it is
  // (docs/questions.md M5-3).
  const typed = Number(query.get('seed'));
  const seed = dev && Number.isInteger(typed) && typed > 0 ? typed : (vetted.seeds[0] ?? 1);
  const pinsets = parsePinSets(PINSETS_FILE, content);
  const game = createGame(content, sim);
  void sim.request({ kind: 'init', tuning }).then((reply) => {
    document.documentElement.dataset['sim'] = reply.kind; // "ready"; read by the smoke test
    if (reply.kind === 'ready') game.start(seed, dev ? (pinsets['untouched'] ?? []) : [], dev);
  });
  render(
    () => (
      <App
        tuningRows={tuningRows(tuning)}
        game={game}
        sim={sim}
        pinsets={pinsets}
        seed={seed}
        dev={dev}
      />
    ),
    root,
  );
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  addTables({ en: uiEn, ru: uiRu });
  render(() => <ContentErrorScreen problems={e.problems} />, root);
}
