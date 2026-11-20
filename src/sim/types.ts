export interface SimState {
  readonly tick: number;
  readonly seed: number;
  readonly value: number;
  readonly paused: boolean;
  /** Internal PRNG state; never exposed to the UI. */
  readonly rng: number;
}

/** The read-only view of the sim sent to the main thread. */
export interface SimSnapshot {
  readonly tick: number;
  readonly seed: number;
  readonly value: number;
  readonly paused: boolean;
}

export type SimCommand =
  { readonly type: 'togglePause' } | { readonly type: 'reset'; readonly seed: number };
