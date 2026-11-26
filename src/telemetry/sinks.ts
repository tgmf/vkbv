// Telemetry sinks (07 §6): a buffer kept in localStorage across page loads (Tagir, M8-1), shown in the
// debug panel, and beacon batches to `VITE_TELEMETRY_URL` while the remote sink is on. Everything
// outside is passed in, so tests use fakes.
import type { EventName, EventProps, TelemetryEvent } from './events';

export const BUFFER_KEY = 'acfw.telemetry';
const BATCH = 20; // events per beacon; the rest go when the page is left

export interface TelemetryDeps {
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  /** Real milliseconds since the page loaded. */
  now: () => number;
  session: string;
  /** The remote sink: its URL and `navigator.sendBeacon`; absent when `VITE_TELEMETRY_URL` is unset. */
  remote?: { url: string; send: (url: string, body: string) => boolean };
  /** Whether the remote sink may send now (`flags.telemetry` and the player's setting). */
  remoteOn: () => boolean;
}

export interface Telemetry {
  track<N extends EventName>(name: N, props: EventProps[N]): void;
  /** Every event in the buffer, oldest first, all sessions. */
  events(): TelemetryEvent[];
  clear(): void;
  /** Sends what waits for the remote sink (the page is being left). */
  flush(): void;
  readonly session: string;
}

function read(deps: TelemetryDeps): TelemetryEvent[] {
  try {
    const v: unknown = JSON.parse(deps.storage.getItem(BUFFER_KEY) ?? '[]');
    return Array.isArray(v) ? (v as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

export function createTelemetry(deps: TelemetryDeps): Telemetry {
  let buffer = read(deps);
  let n = 0;
  let outbox: TelemetryEvent[] = [];

  const flush = () => {
    if (!deps.remote || outbox.length === 0) return;
    if (!deps.remoteOn()) {
      outbox = [];
      return;
    }
    if (deps.remote.send(deps.remote.url, JSON.stringify(outbox))) outbox = [];
  };

  return {
    session: deps.session,
    track(name, props) {
      const e: TelemetryEvent = {
        session: deps.session,
        n: n++,
        ms: Math.round(deps.now()),
        name,
        props: { ...props },
      };
      buffer.push(e);
      try {
        deps.storage.setItem(BUFFER_KEY, JSON.stringify(buffer));
      } catch {
        // storage full or blocked: the events stay in memory for this page
      }
      if (deps.remote && deps.remoteOn()) {
        outbox.push(e);
        if (outbox.length >= BATCH) flush();
      }
    },
    events: () => [...buffer],
    clear() {
      buffer = [];
      deps.storage.setItem(BUFFER_KEY, '[]');
    },
    flush,
  };
}
