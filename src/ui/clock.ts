// The clock time of a tick as HH:MM (03 §2), for display.
import type { Content } from '../content/schemas/content';

export function clockText(c: Content, tick: number): string {
  const [h, m] = c.world.startClock.split(':').map(Number);
  const minutes = ((h ?? 0) * 60 + (m ?? 0) + tick * c.world.tickMinutes) % (24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
