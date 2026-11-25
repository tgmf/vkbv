import { createSignal, For, onCleanup, Show } from 'solid-js';
import type { TuningRow } from '../content/schemas';
import { LOCALES, setLocale, t, type Locale } from '../i18n/t';

const [locale, setLocaleSignal] = createSignal<Locale>('en');

/** Reactive t(): re-runs when the locale changes. */
const tr = (key: string): string => (locale(), t(key));

function switchLocale(next: Locale): void {
  setLocale(next);
  setLocaleSignal(next);
  document.documentElement.lang = next;
}

export function App(props: { tuningRows: TuningRow[] }) {
  const [debug, setDebug] = createSignal(new URLSearchParams(location.search).get('debug') === '1');
  const onKey = (e: KeyboardEvent) => {
    if (e.key === '`') setDebug((d) => !d);
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => document.removeEventListener('keydown', onKey));

  return (
    <div class="shell">
      <header class="topbar">
        <h1 data-testid="town">{tr('ui.town')}</h1>
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
      <main class="world" data-testid="world" />
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
