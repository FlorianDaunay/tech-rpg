/**
 * Seeded PRNG (mulberry32). All gameplay randomness goes through an Rng whose state lives in the
 * game state, so simulations are deterministic, replayable and identical on every peer.
 */
export interface Rng {
  /** Current internal state; store it to resume the sequence later. */
  readonly state: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks a key by weight (weights need not sum to 1). */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    get state() {
      return s;
    },
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() on an empty list");
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: (entries) => {
      const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
      if (total <= 0) throw new Error("weighted() needs at least one positive weight");
      let roll = next() * total;
      for (const [value, w] of entries) if ((roll -= Math.max(0, w)) < 0) return value;
      return entries[entries.length - 1]![0];
    },
  };
  return rng;
}

/** Stable 32-bit hash of a string, e.g. to turn "2026-10-10" into the daily Rift seed. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
