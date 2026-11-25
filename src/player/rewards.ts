// Rewards (04 §7): what a watched fact pays, the first time each kind of thing is watched. Keyed by
// kind, never by history, so scrolling, editing or watching again pays nothing new. Also the draws of
// the played-card rule `discard` (04 §3.4).
import type { Requirement } from '../content/schemas/chapter';
import type { Content } from '../content/schemas/content';
import { requirementItems } from '../sim/frames';
import { mulPm } from '../sim/math';
import { hash32 } from '../sim/rng';
import type { CardId, WatchedFact } from '../sim/types';
import { addSorted, type PlayerState, type Reward } from './state';

/** The facts a requirement item names. */
const itemFacts = (r: Requirement): string[] =>
  'fact' in r ? [r.fact] : ('all' in r ? r.all : r.any).flatMap(itemFacts);

/** The charge a payout of `base` gives under the fact's total pressure (04 §7), capped. */
export function payoutGain(c: Content, base: number, totalPressure: number): number {
  const { per, addPercent } = c.economy.pressureScale;
  const mult = Math.min(
    c.tuning.charge.multCapPm,
    1000 + Math.trunc(totalPressure / per) * addPercent * 10,
  );
  return mulPm(base, mult);
}

/** Whether a detector is the rain's start: its kernel is the single event `rainStarted` (04 §7). */
const isRainStart = (c: Content, id: string): boolean => {
  const kernel = c.detectors.find((d) => d.id === id)?.kernel ?? [];
  const only = kernel[0];
  return (
    kernel.length === 1 && only !== undefined && 'event' in only && only.event === 'rainStarted'
  );
};

/**
 * Draws `n` cards (rule `discard`, 04 §3.4): with the draw pile empty, every discarded card is
 * reshuffled into it in the seed's order for this reshuffle; then its first card goes to the hand.
 */
export function draw(p: PlayerState, n: number): { player: PlayerState; drawn: CardId[] } {
  let player = p;
  const drawn: CardId[] = [];
  for (let i = 0; i < n; i++) {
    if (player.drawPile.length === 0) {
      const discard = Object.keys(player.cards)
        .filter((id) => player.cards[id]?.zone === 'discard')
        .sort();
      if (discard.length === 0) break;
      const key = (id: string) => hash32(`${player.seed}|reshuffle|${player.reshuffles}|${id}`);
      const pile = [...discard].sort((a, b) => key(a) - key(b) || (a < b ? -1 : 1));
      const cards = { ...player.cards };
      for (const id of pile) cards[id] = { zone: 'draw' };
      player = { ...player, cards, drawPile: pile, reshuffles: player.reshuffles + 1 };
    }
    const [top, ...rest] = player.drawPile;
    if (top === undefined) break;
    player = { ...player, drawPile: rest, cards: { ...player.cards, [top]: { zone: 'hand' } } };
    drawn.push(top);
  }
  return { player, drawn };
}

/** Moves a card found by exploring from `unfound` to the hand. */
const find = (p: PlayerState, id: CardId | null | undefined): CardId[] =>
  id && p.cards[id]?.zone === 'unfound' ? [id] : [];

/**
 * What a watched fact pays (04 §7), the first time each key is seen: charge for storylet states and
 * detectors with a payout and for requirement items, the anchor, the charge floor at the rain's start,
 * hooks (and their cards), revealed places (and their regions' cards). Under rule `discard`, every
 * exploring payout (a hook, a region) also draws a card.
 */
export function reward(
  c: Content,
  p: PlayerState,
  fact: WatchedFact,
): { player: PlayerState; rewards: Reward[] } {
  const { summary } = fact;
  const { economy } = c;
  const variant = economy.charge.variantRainStartPays;
  let player = p;
  const rewards: Reward[] = [];
  const fresh = (key: string): boolean => {
    if (player.paid.includes(key)) return false;
    player = { ...player, paid: addSorted(player.paid, key) };
    return true;
  };
  const pay = (key: string, base: number) => {
    if (!fresh(key)) return;
    const gain = payoutGain(c, base, summary.totalPressure);
    player = { ...player, charge: Math.min(economy.charge.cap, player.charge + gain) };
    rewards.push({ key, charge: gain });
  };
  const give = (key: string, cards: CardId[], extra: Omit<Reward, 'key' | 'cards'>) => {
    const next = { ...player.cards };
    for (const id of cards) next[id] = { zone: 'hand' };
    player = { ...player, cards: next };
    let all = cards;
    if (c.tuning.player.playedCardRule === 'discard') {
      const d = draw(player, 1);
      player = d.player;
      all = [...cards, ...d.drawn];
    }
    rewards.push({ key, ...extra, ...(all.length > 0 && { cards: all }) });
  };

  for (const key of summary.storylets) {
    const base = economy.payouts.storyletState[key];
    if (base !== undefined) pay(`sl:${key}`, base);
  }
  for (const id of summary.detectors) {
    const listed = economy.payouts.detector[id];
    const base = variant && isRainStart(c, id) ? economy.charge.floorAtRainStart : listed;
    if (base !== undefined) pay(`det:${id}`, base);
  }
  requirementItems(c).forEach((item, i) => {
    if (itemFacts(item).some((f) => summary.factsSet.includes(f)))
      pay(`req:${i}`, economy.payouts.anchorRequirement);
  });
  if (summary.factsSet.includes(c.anchor.id) && fresh('anchor')) {
    player = { ...player, anchorWatched: true };
    rewards.push({ key: 'anchor' });
  }
  if (summary.events.includes('rainStarted') && fresh('rain')) {
    const before = player.charge;
    if (c.tuning.charge.floorOn && !variant)
      player = { ...player, charge: Math.max(player.charge, economy.charge.floorAtRainStart) };
    rewards.push({ key: 'rain', charge: player.charge - before });
  }
  for (const name of summary.events) {
    const h = name.startsWith('voice:') ? name.slice('voice:'.length) : null;
    if (h === null || h.includes(':') || !c.hook[h] || !fresh(`hook:${h}`)) continue;
    player = { ...player, journal: { ...player.journal, hooks: [...player.journal.hooks, h] } };
    give(`hook:${h}`, find(player, economy.cardsFromExploring.discoverHook[h]), { hook: h });
  }
  for (const node of summary.nodesSeen) {
    if (player.revealed.includes(node) || !fresh(`reveal:${node}`)) continue;
    const region = c.node[node]?.region;
    const opened =
      region !== undefined && !player.revealed.some((n) => c.node[n]?.region === region);
    player = { ...player, revealed: addSorted(player.revealed, node) };
    if (opened) {
      const card = economy.cardsFromExploring.revealRegion[region];
      give(`reveal:${node}`, find(player, card), { revealed: [node] });
    } else rewards.push({ key: `reveal:${node}`, revealed: [node] });
  }
  return { player, rewards };
}
