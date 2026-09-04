/**
 * Deterministic PRNG. Same seed string in, same sequence out — every run, every
 * machine. The mock data has to be stable or the seeded annotations stop lining
 * up with the candles they were drawn against.
 */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for mock price paths. */
export function makeRng(seed: string | number) {
  let a = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, so the walk has fat-ish tails instead of uniform steps. */
export function makeGaussian(rng: () => number) {
  return function gaussian(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}
