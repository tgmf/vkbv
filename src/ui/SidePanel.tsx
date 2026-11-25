// The side panel (06 §1, §5, §6): the charge meter (a bar with the powers' costs marked on it, no
// number), one button per power (disabled with the reason), the journal (discovered hooks with the line
// that revealed them, inspected objects) and the line log, with drive keys highlighted (06 §2).
import { createMemo, For, Show } from 'solid-js';
import { holdRefusal } from '../player/targets';
import { clockText } from './clock';
import type { Game } from './game';

type Text = (key: string, p?: Record<string, string | number>) => string;

interface LogLine {
  tick: number;
  cat: string | null;
  text: string; // a text key
  shows: string;
}

const LOG_MAX = 40;

/** A line with every drive key word marked (06 §2: drive keys highlighted in voiced lines). */
function Highlighted(props: { line: string; keys: readonly string[] }) {
  const parts = () => {
    const words = props.keys.filter((k) => k.length > 0);
    if (words.length === 0) return [{ text: props.line, key: false }];
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${escaped.join('|')})`, 'giu');
    return props.line
      .split(re)
      .filter((s) => s.length > 0)
      .map((s) => ({ text: s, key: words.some((w) => w.toLowerCase() === s.toLowerCase()) }));
  };
  return (
    <For each={parts()}>{(p) => (p.key ? <mark class="drive">{p.text}</mark> : <>{p.text}</>)}</For>
  );
}

export function SidePanel(props: { game: Game; text: Text }) {
  const c = () => props.game.content;
  const ui = () => props.game.ui;
  const cap = () => Math.max(1, c().economy.charge.cap);
  const driveKeys = () => c().hooks.map((h) => props.text(h.driveKey));

  /** Every line the followed cat watched, from the watched facts and their frames (06 §2). */
  const lines = createMemo((): LogLine[] => {
    const out: LogLine[] = [];
    const frames = ui().pending?.old.frames ?? ui().view.frames; // while an edit streams, the old ones
    for (const f of ui().player.watched) {
      const frame = frames[f.tick];
      if (!frame) continue;
      const shows = new Set([...f.summary.storylets, ...f.summary.events]);
      for (const l of frame.lines)
        if (shows.has(l.shows))
          out.push({ tick: f.tick, cat: l.cat, text: l.text, shows: l.shows });
    }
    return out;
  });
  const log = () => lines().slice(-LOG_MAX).reverse();
  const revealedBy = (hook: string) => lines().find((l) => l.shows === `voice:${hook}`);

  return (
    <aside class="side" data-testid="side">
      <section>
        <h2>{props.text('ui.panel.charge')}</h2>
        <div
          class="meter"
          data-testid="charge"
          data-charge={ui().player.charge}
          role="img"
          aria-label={props.text('ui.panel.charge')}
        >
          <div class="fill" style={{ width: `${(100 * ui().player.charge) / cap()}%` }} />
          <For each={c().powers}>
            {(p) => (
              <span
                class="cost"
                title={props.text(p.nameKey)}
                style={{ left: `${Math.min(100, (100 * p.cost) / cap())}%` }}
              />
            )}
          </For>
        </div>
      </section>
      <section>
        <h2>{props.text('ui.panel.powers')}</h2>
        <For each={c().powers}>
          {(p) => {
            const why = () =>
              ui().pending ? null : holdRefusal(ui().player, ui().view, c(), { power: p.id });
            const held = () => {
              const h = ui().held;
              return h !== null && 'power' in h && h.power === p.id;
            };
            return (
              <div class="power">
                <button
                  type="button"
                  data-testid={`power-${p.id}`}
                  aria-pressed={held() ? 'true' : 'false'}
                  aria-describedby={`why-${p.id}`}
                  disabled={why() !== null || ui().pending !== null}
                  onClick={() => props.game.hold({ power: p.id })}
                >
                  {props.text(p.nameKey)}
                </button>
                <span class="why" id={`why-${p.id}`} data-testid={`power-${p.id}-why`}>
                  {why() ? props.text(`ui.refusal.${why() ?? ''}`) : ''}
                </span>
              </div>
            );
          }}
        </For>
      </section>
      <section>
        <h2>{props.text('ui.panel.journal')}</h2>
        <h3>{props.text('ui.panel.hooks')}</h3>
        <ul class="journal" data-testid="journal-hooks">
          <For each={ui().player.journal.hooks}>
            {(h) => (
              <li data-hook={h}>
                <strong>{props.text(c().hook[h]?.nameKey ?? h)}</strong>
                <Show when={revealedBy(h)}>
                  {(l) => (
                    <q>
                      <Highlighted line={props.text(l().text)} keys={driveKeys()} />
                    </q>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <h3>{props.text('ui.panel.stories')}</h3>
        <ul class="journal" data-testid="journal-stories">
          <For each={ui().player.journal.stories}>
            {(o) => (
              <li>
                <button
                  type="button"
                  class="link"
                  data-testid={`story-${o}`}
                  onClick={() => props.game.inspectObject(o)}
                >
                  {props.text(c().object[o]?.nameKey ?? o)}
                </button>
              </li>
            )}
          </For>
        </ul>
      </section>
      <section class="log">
        <h2>{props.text('ui.panel.log')}</h2>
        <ol data-testid="line-log">
          <For each={log()}>
            {(l) => (
              <li>
                <span class="when">{clockText(c(), l.tick)}</span>{' '}
                <Show when={l.cat}>
                  {(cat) => <span class="who">{props.text(c().cat[cat()]?.nameKey ?? '')}: </span>}
                </Show>
                <Highlighted
                  line={props.text(l.text)}
                  keys={l.shows.startsWith('voice:') ? driveKeys() : []}
                />
              </li>
            )}
          </For>
        </ol>
      </section>
    </aside>
  );
}
