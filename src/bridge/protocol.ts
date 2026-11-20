/** The single source of truth for every message crossing the main ↔ worker boundary. */
import type { SimCommand, SimSnapshot } from '../sim/types';

export type { SimCommand, SimSnapshot };

/** main → worker */
export type MainToWorker = { readonly kind: 'command'; readonly command: SimCommand };

/** worker → main */
export type WorkerToMain = { readonly kind: 'snapshot'; readonly snapshot: SimSnapshot };

/** Minimum interval between snapshots sent to the main thread. */
export const SNAPSHOT_INTERVAL_MS = 250;

export const INITIAL_SEED = 1;
