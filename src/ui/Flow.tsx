// The chapter's flow (M7): the teaser card and "preparing the day" (06 §9, 04 §2), the hint of the
// moment (06 §7) and the end screen (06 §9). None of them is a modal: the rest of the screen stays.
import { createSignal, For, onSettled, Show } from 'solid-js';
import type { Game } from './game';
import type { HintId } from './hints';

type Text = (key: string, p?: Record<string, string | number>) => string;

/** Over the world view before the day starts: the anchor's line, and why it is waiting. */
export function TeaserCard(props: { game: Game; text: Text }) {
  const ui = () => props.game.ui;
  return (
    <Show when={ui().phase !== 'play'}>
      <div class="teaser" data-testid="teaser" data-phase={ui().phase}>
        <Show when={ui().phase === 'teaser'}>
          <p class="line">{props.text(props.game.content.anchor.teaserKey)}</p>
          <button type="button" class="skip" onClick={() => props.game.skipTeaser()}>
            {props.text('ui.teaser.skip')}
          </button>
        </Show>
        <Show when={ui().phase === 'preparing'}>
          <p class="preparing" role="status" data-testid="preparing">
            {props.text('ui.preparing')}
          </p>
        </Show>
        <Show when={ui().bootNotice}>
          {(key) => (
            <p class="notice-line" role="status" data-testid="boot-notice">
              {props.text(key())}
            </p>
          )}
        </Show>
      </div>
    </Show>
  );
}

/** What each hint points at: the `data-testid` it stands next to (06 §7). */
function anchorOf(game: Game, id: HintId): string {
  const c = game.content;
  const lure = c.powers.find((p) => p.effects.some((e) => e.prim === 'attract'))?.id ?? '';
  const gaze = c.powers.find((p) => p.effects.some((e) => e.prim === 'collapse'))?.id ?? '';
  const at: Record<HintId, string> = {
    watch: 'play',
    ghosts: 'world',
    inspect: 'world',
    card: 'hand',
    barely: 'charge',
    scroll: 'timeline',
    fray: 'timeline',
    power: `power-${lure}`,
    notready: 'journal-hooks',
    morning: 'timeline',
    others: 'hand',
    gaze: `power-${gaze}`,
    sandbox: 'timeline',
  };
  return at[id];
}

const GAP = 10;

/**
 * The hint showing now, one short line near its subject. It takes no input but its own dismiss button,
 * so it never blocks the game (06 §7).
 */
export function HintLine(props: { game: Game; text: Text }) {
  const [box, setBox] = createSignal<{ left: number; top: number } | null>(null);
  let el: HTMLDivElement | undefined;
  const id = () => props.game.ui.hint;
  const place = () => {
    const h = id();
    const anchor = h && document.querySelector(`[data-testid="${anchorOf(props.game, h)}"]`);
    if (!h || !anchor || !el) return setBox(null);
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const left = Math.max(GAP, Math.min(innerWidth - w - GAP, a.left + a.width / 2 - w / 2));
    // inside a large subject (the world view), at its top; otherwise above it, or below if no room
    const top =
      a.height > innerHeight / 3
        ? a.top + GAP
        : a.top - hgt - GAP > 0
          ? a.top - hgt - GAP
          : a.bottom + GAP;
    setBox({ left, top });
  };
  onSettled(() => {
    const timer = setInterval(place, 250); // subjects move (the hand fills, the bar rescales)
    return () => clearInterval(timer);
  });
  return (
    <Show when={id()}>
      {(h) => (
        <div
          class="hint-line"
          role="status"
          data-testid="hint"
          data-hint={h()}
          ref={(e) => {
            el = e;
            queueMicrotask(place);
          }}
          style={
            box()
              ? { left: `${box()?.left ?? 0}px`, top: `${box()?.top ?? 0}px` }
              : { visibility: 'hidden' }
          }
        >
          <span>{props.text(`ui.hint.${h()}`)}</span>
          <button
            type="button"
            data-testid="hint-dismiss"
            aria-label={props.text('ui.hint.dismiss')}
            onClick={() => props.game.dismissHint()}
          >
            ×
          </button>
        </div>
      )}
    </Show>
  );
}

/** The end screen's buttons whose URL is set (06 §9): a button without a URL is not drawn. */
export function ctaButtons(env: Readonly<Record<string, unknown>>): { id: string; url: string }[] {
  const all = [
    ['follow', env['VITE_URL_FOLLOW']],
    ['wishlist', env['VITE_URL_WISHLIST']],
    ['newsletter', env['VITE_URL_NEWSLETTER']],
  ] as const;
  return all.flatMap(([id, url]) => (typeof url === 'string' && url !== '' ? [{ id, url }] : []));
}

/** After the strike (06 §9): a title, a line, the buttons with URLs, and "Keep playing". */
export function EndScreen(props: { game: Game; text: Text }) {
  const buttons = ctaButtons(import.meta.env);
  return (
    <Show when={props.game.ui.endOpen}>
      <section class="end-screen" data-testid="end-screen" aria-labelledby="end-title">
        <h2 id="end-title">{props.text('ui.end.title')}</h2>
        <p>{props.text('ui.end.line')}</p>
        <div class="buttons">
          <For each={buttons}>
            {(b) => (
              <a
                class="button"
                data-testid={`end-${b.id}`}
                href={b.url}
                target="_blank"
                rel="noopener"
              >
                {props.text(`ui.end.${b.id}`)}
              </a>
            )}
          </For>
          <button
            type="button"
            data-testid="keep-playing"
            ref={(e) => queueMicrotask(() => e.focus())}
            onClick={() => props.game.keepPlaying()}
          >
            {props.text('ui.end.keepPlaying')}
          </button>
        </div>
      </section>
    </Show>
  );
}
