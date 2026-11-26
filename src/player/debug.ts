// The debug panel's Player tab (06 §10): reveal all, unlock all cards (test cards included), +100
// charge, clear `paid`, clear `watched`. Pure functions over the player state, like the actions; the
// played-card rule is a tuning knob and switches through the Tuning tab's path.
import type { Content } from '../content/schemas/content';
import type { PlayerState } from './state';

export type DebugAction = 'revealAll' | 'unlockCards' | 'charge' | 'clearPaid' | 'clearWatched';

export const DEBUG_ACTIONS: readonly DebugAction[] = [
  'revealAll',
  'unlockCards',
  'charge',
  'clearPaid',
  'clearWatched',
];

const DEBUG_CHARGE = 100; // the button's label says +100 (06 §10)

/** Applies one of the Player tab's buttons. Clearing `watched` also clears what it marked. */
export function debugAction(p: PlayerState, c: Content, action: DebugAction): PlayerState {
  switch (action) {
    case 'revealAll':
      return { ...p, revealed: c.nodes.map((n) => n.id).sort() };
    case 'unlockCards': {
      const cards = { ...p.cards };
      for (const def of c.cards)
        if (!cards[def.id] || cards[def.id]?.zone === 'unfound') cards[def.id] = { zone: 'hand' };
      return { ...p, cards };
    }
    case 'charge':
      return { ...p, charge: Math.min(c.economy.charge.cap, p.charge + DEBUG_CHARGE) };
    case 'clearPaid':
      return { ...p, paid: [] };
    case 'clearWatched':
      return { ...p, watched: [], marks: { changedUnwatched: [] } };
    default: {
      const never: never = action;
      throw new Error(`unknown debug action ${String(never)}`);
    }
  }
}
