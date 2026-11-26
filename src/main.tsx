import { render } from '@solidjs/web';
import { createSignal, Errored, Show } from 'solid-js';
import { createSimClient } from './bridge/client';
import { ContentError, loadAll, loadChapter, loadTuning, parsePinSets } from './content/load';
import { tuningRows } from './content/schemas';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from './content/chapter1';
import vetted from './content/data/ch1/vetted-seeds.json';
import uiEn from './content/data/ui/en.json';
import uiRu from './content/data/ui/ru.json';
import { addTables, t } from './i18n/t';
import { load, SAVE_KEY, store } from './player/save';
import { createTelemetry } from './telemetry';
import { App, ContentErrorScreen } from './ui/App';
import { CrashScreen } from './ui/Flow';
import { createGame } from './ui/game';
import './ui/theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('index.html is missing #app');

const query = new URLSearchParams(location.search);
const RULES = ['pinned', 'spent', 'discard'];

/**
 * The URL's overrides of the tuning file (02 §6): feature flags (`?flag.jumpToEdge=1`) and the
 * played-card rule for playtests (`?rule=discard`).
 */
function withOverrides(file: unknown): unknown {
  const t = file as { flags?: Record<string, unknown>; player?: Record<string, unknown> };
  const flags = { ...t.flags };
  for (const [key, value] of query)
    if (key.startsWith('flag.'))
      flags[key.slice('flag.'.length)] = value === '1' || value === 'true';
  const rule = query.get('rule');
  const player = rule && RULES.includes(rule) ? { ...t.player, playedCardRule: rule } : t.player;
  return { ...t, flags, player };
}

/** The crash screen's details (M8 item 7): the error, the seed, the pins, the watched facts, the tuning. */
let crashDetails: (error: unknown) => string = (error) => String(error);
const [crash, setCrash] = createSignal<unknown>(null);
const isNoise = (message: string) => message.includes('ResizeObserver loop');
addEventListener('error', (e) => {
  if (!isNoise(e.message)) setCrash((e.error as unknown) ?? e.message);
});
addEventListener('unhandledrejection', (e) => setCrash(e.reason as unknown));

try {
  const { tuning, ui, content } = loadAll({
    tuning: withOverrides(TUNING_FILE),
    uiEn,
    uiRu,
    chapter: CHAPTER1_FILES,
  });
  addTables(ui);
  addTables(content.text);
  const sim = createSimClient((message) => setCrash(new Error(`worker: ${message}`)));
  // `?dev=1` is the debug mode (02 §6, docs/questions.md M8-1): the debug panel open, a typed seed
  // played as it is, no teaser, no saving, no telemetry
  const dev = query.get('dev') === '1';
  const typed = Number(query.get('seed'));
  const typedSeed = Number.isInteger(typed) && typed > 0 ? typed : null;
  const pinsets = parsePinSets(PINSETS_FILE, content);

  // Saving (04 §9): a saved game is resumed whatever the URL says; the seed in the URL is always the
  // game's requested seed, so the address can be bookmarked or shared (Tagir, M7).
  const storage = window.localStorage;
  const saved = dev ? null : load(storage);
  const broken = !dev && saved === null && storage.getItem(SAVE_KEY) !== null;
  const firstVisit = storage.getItem(SAVE_KEY) === null;

  // Telemetry (07 §6): the kept buffer always; beacons only with VITE_TELEMETRY_URL, the flag on and
  // the player's setting on
  const url: unknown = import.meta.env['VITE_TELEMETRY_URL'];
  const sink =
    typeof url === 'string' && url !== ''
      ? { url, send: (u: string, body: string) => navigator.sendBeacon(u, body) }
      : null;
  const remote = sink !== null;
  let remoteOn = () => false;
  const telemetry = createTelemetry({
    storage,
    now: () => performance.now(),
    session: Math.random().toString(36).slice(2, 10),
    ...(sink && { remote: sink }),
    remoteOn: () => remoteOn(),
  });

  const game = createGame(content, sim, {
    ...(saved && { settings: saved.settings }),
    ...(!dev && {
      save: (p, s) => store(storage, p, s),
      track: (name, props) => telemetry.track(name, props),
      info: () => ({
        build: String(import.meta.env['VITE_BUILD'] ?? 'graybox'),
        viewport: `${innerWidth}x${innerHeight}`,
      }),
    }),
  });
  remoteOn = () => game.content.tuning.flags.telemetry && game.ui.settings.telemetry;
  crashDetails = (error) => {
    const { player } = game.now();
    return JSON.stringify(
      {
        error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
        build: String(import.meta.env['VITE_BUILD'] ?? 'graybox'),
        tuning: game.content.tuning.version,
        seedRequested: player.seedRequested,
        seed: player.seed,
        pins: player.pins,
        watched: player.watched,
      },
      null,
      1,
    );
  };

  /** The Tuning tab (06 §10): a whole tuning, validated, becomes the game's; an error otherwise. */
  const retune = (raw: unknown): string | null => {
    try {
      game.retune(loadChapter(CHAPTER1_FILES, loadTuning(raw)));
      return null;
    } catch (e) {
      if (e instanceof ContentError) return e.problems.join('\n');
      return e instanceof Error ? e.message : String(e);
    }
  };

  const showSeed = (requested: number) => {
    const u = new URL(location.href);
    u.searchParams.set('seed', String(requested));
    history.replaceState(history.state, '', u);
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
  addEventListener('pagehide', () => {
    game.persist();
    if (!dev) game.endSession();
    telemetry.flush();
  });
  const lureId = () =>
    game.content.powers.find((p) => p.effects.some((e) => e.prim === 'attract'))?.id ?? '';
  const gazeId = () =>
    game.content.powers.find((p) => p.effects.some((e) => e.prim === 'collapse'))?.id ?? '';
  render(
    () => (
      <Errored fallback={(err) => <CrashScreen text={t} details={() => crashDetails(err())} />}>
        <Show
          when={crash() === null}
          fallback={<CrashScreen text={t} details={() => crashDetails(crash())} />}
        >
          <App
            game={game}
            sim={sim}
            pinsets={pinsets}
            seed={seed}
            dev={dev}
            newGame={() => newDay(null)}
            telemetry={telemetry}
            summaryIds={() => ({
              lure: lureId(),
              gaze: gazeId(),
              out: game.content.tuning.flow.outOn,
            })}
            rowsOf={tuningRows}
            defaults={tuning}
            retune={retune}
            remote={remote}
            firstVisit={firstVisit}
          />
        </Show>
      </Errored>
    ),
    root,
  );
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  addTables({ en: uiEn, ru: uiRu });
  render(() => <ContentErrorScreen problems={e.problems} />, root);
}
