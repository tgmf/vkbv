// The debug panel (06 §10): behind `?debug=1` or the backquote, open from the start in the debug mode
// `?dev=1` (no teaser, no saving; docs/questions.md M8-1). Tabs: Tuning, Wave, State, Events, Player,
// Pin sets, Telemetry. Developer-only text, not translated (decisions.md M0).
import { createSignal, For, Show, untrack } from 'solid-js';
import type { SimClient } from '../../bridge/client';
import type { Pin } from '../../bridge/protocol';
import type { Tuning, TuningRow } from '../../content/schemas/tuning';
import { DEBUG_ACTIONS, type DebugAction } from '../../player/debug';
import { summarizeSession, type SummaryIds, type Telemetry } from '../../telemetry';
import type { Game } from '../game';
import { EventsTab } from './Events';
import { useInspect, StateTab, WaveTab } from './Inspect';
import { TuningTab } from './Tuning';

export interface DebugProps {
  game: Game;
  sim: SimClient;
  pinsets: Record<string, Pin[]>;
  /** The seed the Pin sets tab starts with (the debug mode's `?seed=`, played as typed). */
  seed: number;
  telemetry: Telemetry;
  summaryIds: () => SummaryIds;
  rowsOf: (t: Tuning) => TuningRow[];
  /** The tuning file as shipped, for Reset. */
  defaults: Tuning;
  /** Validates a whole tuning and starts the day again with it; an error message, or null. */
  retune: (raw: unknown) => string | null;
  /** The debug mode opens on Pin sets, the normal page on Tuning. */
  dev: boolean;
}

const TABS = ['Tuning', 'Wave', 'State', 'Events', 'Player', 'Pin sets', 'Telemetry'] as const;
type Tab = (typeof TABS)[number];

export function DebugPanel(props: DebugProps) {
  const [tab, setTab] = createSignal<Tab>(untrack(() => (props.dev ? 'Pin sets' : 'Tuning')));
  const inspect = useInspect(
    () => props.game,
    () => props.sim,
    () => tab() === 'State' || tab() === 'Wave',
  );
  return (
    <aside class="debug" data-testid="debug" aria-label="debug panel">
      <div class="tabs" role="tablist">
        <For each={TABS}>
          {(name) => (
            <button
              type="button"
              role="tab"
              data-testid={`debug-tab-${name.replace(' ', '-').toLowerCase()}`}
              aria-selected={tab() === name ? 'true' : 'false'}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          )}
        </For>
      </div>
      <div role="tabpanel" class="tab">
        <Show when={tab() === 'Tuning'}>
          <TuningTab
            game={props.game}
            rowsOf={props.rowsOf}
            defaults={props.defaults}
            retune={props.retune}
          />
        </Show>
        <Show when={tab() === 'Wave'}>
          <WaveTab game={props.game} inspect={inspect} />
        </Show>
        <Show when={tab() === 'State'}>
          <StateTab game={props.game} inspect={inspect} />
        </Show>
        <Show when={tab() === 'Events'}>
          <EventsTab game={props.game} sim={props.sim} />
        </Show>
        <Show when={tab() === 'Player'}>
          <PlayerTab game={props.game} retune={props.retune} />
        </Show>
        <Show when={tab() === 'Pin sets'}>
          <PinSetsTab {...props} />
        </Show>
        <Show when={tab() === 'Telemetry'}>
          <TelemetryTab telemetry={props.telemetry} summaryIds={props.summaryIds} />
        </Show>
      </div>
    </aside>
  );
}

const LABELS: Record<DebugAction, string> = {
  revealAll: 'reveal all',
  unlockCards: 'unlock all cards',
  charge: '+100 charge',
  clearPaid: 'clear paid',
  clearWatched: 'clear watched',
};

/** The raw PlayerState and its buttons; the played-card rule is a tuning knob. */
function PlayerTab(props: { game: Game; retune: DebugProps['retune'] }) {
  const [error, setError] = createSignal<string | null>(null);
  const rule = () => props.game.content.tuning.player.playedCardRule;
  return (
    <div>
      <div class="controls">
        <For each={DEBUG_ACTIONS}>
          {(a) => (
            <button type="button" data-testid={`debug-${a}`} onClick={() => props.game.debug(a)}>
              {LABELS[a]}
            </button>
          )}
        </For>
        <label>
          playedCardRule{' '}
          <select
            data-testid="debug-rule"
            value={rule()}
            onChange={(e) => {
              const t = props.game.content.tuning;
              setError(
                props.retune({
                  ...t,
                  player: { ...t.player, playedCardRule: e.currentTarget.value },
                }),
              );
            }}
          >
            <For each={['pinned', 'spent', 'discard']}>{(r) => <option value={r}>{r}</option>}</For>
          </select>
        </label>
      </div>
      <Show when={error()}>{(e) => <p class="error">{e()}</p>}</Show>
      <pre class="raw" data-testid="debug-player">
        {JSON.stringify(props.game.ui.player, null, 1)}
      </pre>
    </div>
  );
}

/** Load a pin set of 05 §5.1 into the log, on a seed played as typed (the M5 dev page's controls). */
function PinSetsTab(props: DebugProps) {
  const [seed, setSeed] = createSignal(untrack(() => props.seed));
  const [pinset, setPinset] = createSignal('untouched');
  const [reveal, setReveal] = createSignal(true);
  // a written signal reads its old value until Solid flushes, so the new values are passed in
  const load = (s: number, name: string, all: boolean) =>
    props.game.start(s, props.pinsets[name] ?? [], all);
  return (
    <div class="controls">
      <label>
        seed{' '}
        <input
          type="number"
          data-testid="dev-seed"
          value={seed()}
          onChange={(e) => {
            const s = Number(e.currentTarget.value);
            setSeed(s);
            load(s, pinset(), reveal());
          }}
        />
      </label>
      <label>
        pins{' '}
        <select
          data-testid="pinset"
          value={pinset()}
          onChange={(e) => {
            const name = e.currentTarget.value;
            setPinset(name);
            load(seed(), name, reveal());
          }}
        >
          <For each={Object.keys(props.pinsets)}>
            {(name) => <option value={name}>{name}</option>}
          </For>
        </select>
      </label>
      <label title="every place revealed; off: the map is revealed as Marti sees it">
        <input
          type="checkbox"
          data-testid="dev-reveal"
          checked={reveal()}
          onChange={(e) => {
            const all = e.currentTarget.checked;
            setReveal(all);
            load(seed(), pinset(), all);
          }}
        />{' '}
        reveal all
      </label>
      <p class="small">
        Loading starts the day again on this seed (not vetted) with these pins. On the normal page
        it replaces the saved game; the debug mode (?dev=1) saves nothing.
      </p>
    </div>
  );
}

/** The kept event buffer, the playtest numbers, export and clear (07 §6, playtest kit §4). */
function TelemetryTab(props: { telemetry: Telemetry; summaryIds: () => SummaryIds }) {
  const [events, setEvents] = createSignal(untrack(() => props.telemetry.events()));
  const refresh = () => setEvents(props.telemetry.events());
  const summary = () => summarizeSession(events(), props.summaryIds());
  const exportFile = () => {
    refresh();
    const body = JSON.stringify(
      { exported: new Date().toISOString(), summary: summary(), events: events() },
      null,
      1,
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    a.download = `acfw-telemetry-${props.telemetry.session}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div>
      <div class="controls">
        <button type="button" data-testid="telemetry-refresh" onClick={refresh}>
          refresh
        </button>
        <button type="button" data-testid="telemetry-export" onClick={exportFile}>
          export
        </button>
        <button
          type="button"
          data-testid="telemetry-clear"
          onClick={() => {
            props.telemetry.clear();
            refresh();
          }}
        >
          clear
        </button>
      </div>
      <table data-testid="telemetry-summary">
        <tbody>
          <For each={Object.entries(summary())}>
            {([k, v]) => (
              <tr>
                <th scope="row">{k}</th>
                <td class="value">{JSON.stringify(v)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <h3>{events().length} events, newest first</h3>
      <pre class="raw" data-testid="telemetry-events">
        {events()
          .slice(-300)
          .reverse()
          .map(
            (e) =>
              `${e.session.slice(0, 6)} #${e.n} ${e.ms}ms ${e.name} ${JSON.stringify(e.props)}`,
          )
          .join('\n')}
      </pre>
    </div>
  );
}
