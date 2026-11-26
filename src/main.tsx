import { render } from '@solidjs/web';
import { createSimClient } from './bridge/client';
import { ContentError, loadAll, parsePinSets } from './content/load';
import { tuningRows } from './content/schemas';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from './content/chapter1';
import vetted from './content/data/ch1/vetted-seeds.json';
import uiEn from './content/data/ui/en.json';
import uiRu from './content/data/ui/ru.json';
import { addTables } from './i18n/t';
import { load, SAVE_KEY, store } from './player/save';
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
  const typed = Number(query.get('seed'));
  const typedSeed = Number.isInteger(typed) && typed > 0 ? typed : null;
  const pinsets = parsePinSets(PINSETS_FILE, content);

  // Saving (04 §9): the dev page plays a typed seed as it is (docs/questions.md M5-3) and saves nothing.
  // A saved game is resumed whatever the URL says; the seed in the URL is always the game's requested
  // seed, so the address can be bookmarked or shared (Tagir, M7).
  const storage = window.localStorage;
  const saved = dev ? null : load(storage);
  const broken = !dev && saved === null && storage.getItem(SAVE_KEY) !== null;
  const game = createGame(content, sim, {
    ...(saved && { settings: saved.settings }),
    ...(!dev && { save: (p, s) => store(storage, p, s) }),
  });
  const showSeed = (requested: number) => {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(requested));
    history.replaceState(history.state, '', url);
  };
  /** A new day: the typed seed, or one drawn from the offline list (04 §2). */
  const newDay = (requested: number | null, notice?: string) => {
    const r = requested ?? vetted.seeds[Math.floor(Math.random() * vetted.seeds.length)] ?? 1;
    showSeed(r);
    // a seed on the offline list is already vetted: vetting it again gives itself (decisions.md, M7)
    game.newDay(r, vetted.seeds.includes(r) ? r : null, notice);
  };
  const seed = saved?.player.seedRequested ?? typedSeed ?? vetted.seeds[0] ?? 1;
  void sim.request({ kind: 'init', tuning }).then((reply) => {
    document.documentElement.dataset['sim'] = reply.kind; // "ready"; read by the smoke test
    if (reply.kind !== 'ready') return;
    if (dev) game.start(typedSeed ?? vetted.seeds[0] ?? 1, pinsets['untouched'] ?? [], true);
    else if (saved) {
      showSeed(saved.player.seedRequested);
      game.resume(saved.player);
    } else newDay(typedSeed, broken ? 'ui.save.broken' : undefined);
  });
  addEventListener('pagehide', () => game.persist());
  render(
    () => (
      <App
        tuningRows={tuningRows(tuning)}
        game={game}
        sim={sim}
        pinsets={pinsets}
        seed={seed}
        dev={dev}
        newGame={() => newDay(null)}
      />
    ),
    root,
  );
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  addTables({ en: uiEn, ru: uiRu });
  render(() => <ContentErrorScreen problems={e.problems} />, root);
}
