import { createSignal, Show } from 'solid-js';
import type { SimCommand, SimSnapshot } from '../bridge/protocol';

export interface OverlayProps {
  snapshot: SimSnapshot | undefined;
  send: (command: SimCommand) => void;
}

export function Overlay(props: OverlayProps) {
  const [seedText, setSeedText] = createSignal('1');

  const reset = () => {
    const seed = Number.parseInt(seedText(), 10);
    if (Number.isFinite(seed)) props.send({ type: 'reset', seed });
  };

  return (
    <div class="overlay">
      <Show when={props.snapshot} fallback={<div>Waiting for sim…</div>}>
        {(snap) => (
          <>
            <div>
              tick <b>{snap().tick}</b>
            </div>
            <div>
              value <b>{snap().value.toFixed(4)}</b>
            </div>
            <div>seed {snap().seed}</div>
            <button type="button" onClick={() => props.send({ type: 'togglePause' })}>
              {snap().paused ? 'Resume' : 'Pause'}
            </button>
          </>
        )}
      </Show>
      <div class="row">
        <input
          type="number"
          aria-label="Seed"
          value={seedText()}
          onInput={(e) => setSeedText(e.currentTarget.value)}
        />
        <button type="button" onClick={reset}>
          Reset with seed
        </button>
      </div>
    </div>
  );
}
