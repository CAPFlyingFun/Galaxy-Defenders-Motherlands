// ============================================================================
// mind/random.ts -- A SEEDED RANDOM NUMBER GENERATOR, so a character's choices can be played back exactly (the same seed,
// the same day: the headless simulation's results can be checked, and a bug seen once can be seen again).
// Mulberry32: tiny, fast, good enough for choices (not for secrets).
// ============================================================================

/** A function giving numbers in 0..1, the same run of them for the same seed. */
export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number between `lo` and `hi`. */
export function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** A seed from a name ("mary" always gives the same one). */
export function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}
