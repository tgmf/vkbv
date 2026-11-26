// Settings (06 §8): text size, reduced motion, the focus layer, assist mode and a new game (confirmed in
// place). The language stays in the top bar. A panel under the top bar, not a modal. M8: the remote
// telemetry sink's off switch, shown only when the build has one (07 §6).
import { createSignal, For, Show } from 'solid-js';
import type { Settings as SettingsT } from '../player/save';
import type { Game } from './game';

type Text = (key: string, p?: Record<string, string | number>) => string;

const SIZES = [100, 125, 150] as const;
const MOTION = ['system', 'on', 'off'] as const;

export function Settings(props: {
  game: Game;
  text: Text;
  newGame: () => void;
  /** The build sends telemetry (`VITE_TELEMETRY_URL` set, `flags.telemetry` on). */
  remote: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);
  const s = () => props.game.ui.settings;
  const set = (patch: Partial<SettingsT>) => props.game.setSettings(patch);
  return (
    <div class="settings-wrap">
      <button
        type="button"
        data-testid="settings-open"
        aria-expanded={open() ? 'true' : 'false'}
        onClick={() => {
          setOpen(!open());
          setConfirming(false);
        }}
      >
        {props.text('ui.settings')}
      </button>
      <Show when={open()}>
        <section class="settings" data-testid="settings" aria-label={props.text('ui.settings')}>
          <fieldset>
            <legend>{props.text('ui.settings.textSize')}</legend>
            <For each={SIZES}>
              {(n) => (
                <button
                  type="button"
                  data-testid={`text-${n}`}
                  aria-pressed={s().textSize === n ? 'true' : 'false'}
                  onClick={() => set({ textSize: n })}
                >
                  {props.text('ui.percent', { n })}
                </button>
              )}
            </For>
          </fieldset>
          <label>
            {props.text('ui.settings.motion')}
            <select
              data-testid="motion"
              value={s().reducedMotion}
              onChange={(e) => {
                const v = MOTION.find((m) => m === e.currentTarget.value);
                if (v) set({ reducedMotion: v });
              }}
            >
              <For each={MOTION}>
                {(m) => <option value={m}>{props.text(`ui.settings.motion.${m}`)}</option>}
              </For>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="focus-layer"
              checked={s().focusLayer}
              onChange={(e) => set({ focusLayer: e.currentTarget.checked })}
            />
            {props.text('ui.settings.focusLayer')}
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="assist"
              checked={s().assist}
              onChange={(e) => set({ assist: e.currentTarget.checked })}
            />
            {props.text('ui.settings.assist')}
          </label>
          <Show when={props.remote}>
            <label>
              <input
                type="checkbox"
                data-testid="telemetry-setting"
                checked={s().telemetry}
                onChange={(e) => set({ telemetry: e.currentTarget.checked })}
              />
              {props.text('ui.settings.telemetry')}
            </label>
          </Show>
          <Show
            when={confirming()}
            fallback={
              <button type="button" data-testid="new-game" onClick={() => setConfirming(true)}>
                {props.text('ui.settings.newGame')}
              </button>
            }
          >
            <div class="confirm" role="group" data-testid="new-game-step">
              <p>{props.text('ui.settings.newGame.confirm')}</p>
              <button
                type="button"
                data-testid="new-game-confirm"
                onClick={() => {
                  setConfirming(false);
                  setOpen(false);
                  props.newGame();
                }}
              >
                {props.text('ui.confirm')}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                {props.text('ui.cancel')}
              </button>
            </div>
          </Show>
          <button type="button" data-testid="settings-close" onClick={() => setOpen(false)}>
            {props.text('ui.close')}
          </button>
        </section>
      </Show>
    </div>
  );
}
