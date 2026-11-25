import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import type { SimClient } from '../bridge/client';
import type { Pin } from '../bridge/protocol';
import type { TuningRow } from '../content/schemas';
import { LOCALES, setLocale, t, type Locale } from '../i18n/t';
import { clockText } from './clock';
import { DevPanel } from './DevPanel';
import type { Game } from './game';
import { Targets } from './Targets';
import { Timeline } from './Timeline';
import { World } from './World';

const [locale, setLocaleSignal] = createSignal<Locale>('en');

/** Reactive t(): re-runs when the locale changes. */
const tr = (key: string, params?: Record<string, string | number>): string => (
  locale(),
  t(key, params)
);

function switchLocale(next: Locale): void {
  setLocale(next);
  setLocaleSignal(next);
  document.documentElement.lang = next;
}

export interface AppProps {
  tuningRows: TuningRow[];
  game: Game;
  sim: SimClient;
  pinsets: Record<string, Pin[]>;
  seed: number;
  dev: boolean;
}

/** The layout of 06 §1: top bar, world view, side panel and hand (empty in M5), the timeline. */
export function App(props: AppProps) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const [debug, setDebug] = createSignal(new URLSearchParams(location.search).get('debug') === '1');
  const labels = createMemo(() => {
    const out: Record<string, string> = {};
    for (const n of c().nodes) out[`node:${n.id}`] = tr(n.nameKey);
    for (const def of c().cats) out[`cat:${def.id}`] = tr(def.nameKey);
    return out;
  });
  const followName = () =>
    tr('ui.follow', { name: tr(c().cat[ui().player.followed[0] ?? '']?.nameKey ?? '') });

  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const g = props.game;
      switch (e.key) {
        case '`':
          setDebug((d) => !d);
          break;
        case ' ':
          g.press('play');
          break;
        case 'j':
        case 'J':
          g.press('back');
          break;
        case 'k':
        case 'K':
          g.press('pause');
          break;
        case 'l':
        case 'L':
          g.press('fwd');
          break;
        case 'ArrowLeft':
          g.scrubTo(ui().playhead - 1);
          break;
        case 'ArrowRight':
          g.stepForward();
          break;
        case 'Home':
          g.scrubTo(0);
          break;
        case 'End':
          if (!c().tuning.flags.jumpToEdge) return;
          g.scrubTo(ui().edge);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div class="shell">
      <header class="topbar">
        <h1 data-testid="town">{tr('ui.town')}</h1>
        <span class="clock" data-testid="clock">
          {clockText(c(), ui().playhead)}
        </span>
        <div class="lang" role="group" aria-label={tr('ui.language')}>
          <For each={LOCALES}>
            {(l) => (
              <button
                type="button"
                data-testid={`locale-${l}`}
                aria-pressed={locale() === l ? 'true' : 'false'}
                onClick={() => switchLocale(l)}
              >
                {tr(`ui.locale.${l}`)}
              </button>
            )}
          </For>
        </div>
      </header>
      <main class="world" data-testid="world" aria-label={tr('ui.world')}>
        <World
          game={props.game}
          seed={props.seed}
          labels={labels}
          text={tr}
          followName={followName}
          focusLayer={true}
        />
        <Targets game={props.game} text={tr} />
      </main>
      <aside class="side" data-testid="side">
        <section>
          <h2>{tr('ui.panel.charge')}</h2>
        </section>
        <section>
          <h2>{tr('ui.panel.powers')}</h2>
        </section>
        <section>
          <h2>{tr('ui.panel.journal')}</h2>
          <h3>{tr('ui.panel.hooks')}</h3>
          <h3>{tr('ui.panel.stories')}</h3>
        </section>
        <section>
          <h2>{tr('ui.panel.log')}</h2>
        </section>
      </aside>
      <section class="hand" data-testid="hand" aria-label={tr('ui.hand')} />
      <Timeline game={props.game} text={tr} />
      <Show when={props.dev}>
        <DevPanel game={props.game} sim={props.sim} pinsets={props.pinsets} seed={props.seed} />
      </Show>
      <Show when={debug()}>
        <DebugPanel rows={props.tuningRows} />
      </Show>
    </div>
  );
}

/** Developer view of every tuning knob with its documentation. Read-only until M8. Not player-facing, so not translated. */
function DebugPanel(props: { rows: TuningRow[] }) {
  return (
    <aside class="debug" data-testid="debug">
      <h2>tuning.json</h2>
      <table>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr>
                <th scope="row">{row.key}</th>
                <td class="value">{row.value}</td>
                <td class="desc">{row.description}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </aside>
  );
}

export function ContentErrorScreen(props: { problems: string[] }) {
  return (
    <div class="content-error" role="alert">
      <h1>{tr('ui.error.title')}</h1>
      <ul>
        <For each={props.problems}>{(p) => <li>{p}</li>}</For>
      </ul>
    </div>
  );
}
