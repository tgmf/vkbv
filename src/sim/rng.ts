// Counter-based randomness (spec 03 §1). A number depends only on who asks, when and why.
// Copied exactly from the spec; never replace it with a sequential generator.

export function hash32(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Integer in [0, maxExclusive). Keys must be ASCII. */
export function rand(
  seed: number,
  scope: string,
  tick: number,
  purpose: string,
  maxExclusive: number,
): number {
  return hash32(`${seed}|${scope}|${tick}|${purpose}`) % maxExclusive;
}
