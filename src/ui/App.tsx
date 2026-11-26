import { createEffect, createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import type { SimClient } from '../bridge/client';
import type { Pin } from '../bridge/protocol';
import type { TuningRow } from '../content/schemas';
import { LOCALES, setLocale, t, type Locale } from '../i18n/t';
import { handOf } from '../player/targets';
import { BreakAlert } from './BreakAlert';
import { clockText } from './clock';
import { DevPanel } from './DevPanel';
import { EndScreen, HintLine, TeaserCard } from './Flow';
import type { Game } from './game';
import { Hand } from './Hand';
import { reducedMotion } from './motion';
import { createSceneHandle } from './scene';
import { Settings } from './Settings';
import { SidePanel } from './SidePanel';
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
  /** Starts a new day after the settings' confirm step. */
  newGame: () => void;
}

/** The layout of 06 §1: top bar, world view, side panel, hand, the break alert and the timeline. */
export function App(props: AppProps) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const scene = createSceneHandle();
  const [debug, setDebug] = createSignal(new URLSearchParams(location.search).get('debug') === '1');
  const labels = createMemo(() => {
    const out: Record<string, string> = {};
    for (const n of c().nodes) out[`node:${n.id}`] = tr(n.nameKey);
    for (const def of c().cats) out[`cat:${def.id}`] = tr(def.nameKey);
    return out;
  });
  const followName = () =>
    tr('ui.follow', { name: tr(c().cat[ui().player.followed[0] ?? '']?.nameKey ?? '') });

  // the settings act on the whole page (06 §8): language, text size, reduced motion
  createEffect(
    () => ui().settings,
    (s) => {
      if (s.lang !== locale()) switchLocale(s.lang);
      document.documentElement.style.fontSize = `${s.textSize}%`;
      document.documentElement.dataset['motion'] = reducedMotion(s.reducedMotion)
        ? 'reduce'
        : 'full';
    },
  );

  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const g = props.game;
      if (e.key === '`') {
        setDebug((d) => !d);
        e.preventDefault();
        return;
      }
      // any key skips the teaser (06 §9); nothing else acts before the day starts
      if (ui().phase !== 'play') {
        if (ui().phase === 'teaser') {
          g.skipTeaser();
          e.preventDefault();
        }
        return;
      }
      // 1 to 9 hold the nth card in hand; G holds Gaze (06 §8, docs/questions.md M5-4)
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const card = handOf(ui().player, c())[Number(e.key) - 1];
        if (card) g.hold({ card });
        e.preventDefault();
        return;
      }
      // while something is held, Tab moves through its valid targets only (docs/questions.md M6-5)
      if (e.key === 'Tab' && ui().held) {
        const list = [
          ...document.querySelectorAll<HTMLElement>('[data-testid="targets"] [data-valid="true"]'),
        ];
        if (list.length > 0) {
          const i = list.indexOf(document.activeElement as HTMLElement);
          const next = e.shiftKey
            ? (list[(i < 0 ? 0 : i) - 1] ?? list[list.length - 1])
            : (list[i + 1] ?? list[0]);
          next?.focus();
        }
        e.preventDefault();
        return;
      }
      switch (e.key) {
        case 'g':
        case 'G': {
          const gaze = c().powers.find((p) => p.effects.some((x) => x.prim === 'collapse'));
          if (gaze) g.hold({ power: gaze.id });
          break;
        }
        case 'Escape':
          g.escape();
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
    // a click anywhere skips the teaser too
    const onPointer = () => {
      if (ui().phase === 'teaser') props.game.skipTeaser();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  });

  return (
    <div class="shell" data-phase={ui().phase}>
      <header class="topbar">
        <h1 data-testid="town">{tr('ui.town')}</h1>
        <span class="clock" data-testid="clock">
          {clockText(c(), ui().playhead)}
        </span>
        <Show when={!props.dev}>
          <Settings game={props.game} text={tr} newGame={props.newGame} />
        </Show>
        <div class="lang" role="group" aria-label={tr('ui.language')}>
          <For each={LOCALES}>
            {(l) => (
              <button
                type="button"
                data-testid={`locale-${l}`}
                aria-pressed={locale() === l ? 'true' : 'false'}
                onClick={() => {
                  switchLocale(l);
                  props.game.setSettings({ lang: l });
                }}
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
          scene={scene}
          seed={props.seed}
          labels={labels}
          text={tr}
          followName={followName}
        />
        <TeaserCard game={props.game} text={tr} />
        <Targets game={props.game} scene={scene} text={tr} />
      </main>
      <SidePanel game={props.game} text={tr} />
      <Hand game={props.game} scene={scene} text={tr} />
      <BreakAlert game={props.game} text={tr} />
      <Timeline game={props.game} text={tr} />
      <EndScreen game={props.game} text={tr} />
      <HintLine game={props.game} text={tr} />
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
