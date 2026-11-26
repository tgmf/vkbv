// The Tuning tab (06 §10): every knob of tuning.json as an editable field, grouped by its first key.
// A change starts the day again with the new tuning at once (the next re-run reads it). Reset, copy as
// JSON, paste JSON.
import { createSignal, For, Show } from 'solid-js';
import type { Tuning, TuningRow } from '../../content/schemas/tuning';
import type { Game } from '../game';
import { setAt, tuningJson } from './knobs';

export interface TuningProps {
  game: Game;
  rowsOf: (t: Tuning) => TuningRow[];
  defaults: Tuning;
  retune: (raw: unknown) => string | null;
}

export function TuningTab(props: TuningProps) {
  const [error, setError] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal('');
  const [text, setText] = createSignal<string | null>(null);
  const tuning = () => props.game.ui.tuning;
  const rows = () =>
    props.rowsOf(tuning()).filter((r) => r.key.toLowerCase().includes(filter().toLowerCase()));
  const groups = () => {
    const out: { name: string; rows: TuningRow[] }[] = [];
    for (const r of rows()) {
      const name = r.key.split('.')[0] ?? '';
      const g = out.find((x) => x.name === name);
      if (g) g.rows.push(r);
      else out.push({ name, rows: [r] });
    }
    return out;
  };
  const apply = (raw: unknown) => setError(props.retune(raw));
  const set = (key: string, value: string) => {
    try {
      apply(setAt(tuning(), key, JSON.parse(value)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <div class="controls">
        <input
          type="search"
          placeholder="filter"
          aria-label="filter knobs"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <button type="button" data-testid="tuning-reset" onClick={() => apply(props.defaults)}>
          reset
        </button>
        <button
          type="button"
          data-testid="tuning-copy"
          onClick={() => {
            const json = tuningJson(tuning());
            setText(json);
            void navigator.clipboard?.writeText(json).catch(() => undefined);
          }}
        >
          copy as JSON
        </button>
        <button type="button" data-testid="tuning-paste" onClick={() => setText('')}>
          paste JSON
        </button>
      </div>
      <Show when={error()}>
        {(e) => (
          <p class="error" data-testid="tuning-error">
            {e()}
          </p>
        )}
      </Show>
      <Show when={text() !== null}>
        <textarea
          data-testid="tuning-json"
          rows="12"
          aria-label="tuning.json"
          value={text() ?? ''}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <div class="controls">
          <button
            type="button"
            data-testid="tuning-apply"
            onClick={() => {
              try {
                apply(JSON.parse(text() ?? ''));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            apply
          </button>
          <button type="button" onClick={() => setText(null)}>
            close
          </button>
        </div>
      </Show>
      <For each={groups()}>
        {(g) => (
          <>
            <h3>{g.name}</h3>
            <table>
              <tbody>
                <For each={g.rows}>
                  {(row) => (
                    <tr>
                      <th scope="row">{row.key.slice(g.name.length + 1)}</th>
                      <td class="value">
                        <input
                          data-testid={`knob-${row.key}`}
                          aria-label={row.key}
                          value={row.value}
                          onChange={(e) => set(row.key, e.currentTarget.value)}
                        />
                      </td>
                      <td class="desc">{row.description}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </>
        )}
      </For>
    </div>
  );
}
