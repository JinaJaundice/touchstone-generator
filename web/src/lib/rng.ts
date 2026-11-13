/* Seeded randomness for the generator. Every draw in a run comes from one
   stream, so the same seed and the same configuration give the same
   dataset, byte for byte. That is what lets a tuning run be repeated and
   what lets a config be shared instead of a file. */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small string hash so a named preset can seed a stream. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const normal = (r: Rng, mean = 0, sd = 1) => {
  const u = Math.max(r(), 1e-12), v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/* A TypeScript translation of the class TruncatedNormal of AMLGentex
   (src/data_creation/temporal_simulation/utils.py, Apache License 2.0,
   https://github.com/aidotse/AMLGentex), changed to draw from a seeded
   generator: rejection sampling, then a clamp after 100 failed draws. */
export const truncNormal = (r: Rng, mean: number, sd: number, lo: number, hi: number) => {
  if (sd <= 0 || lo >= hi) return Math.min(hi, Math.max(lo, mean));
  for (let i = 0; i < 100; i++) {
    const x = normal(r, mean, sd);
    if (x >= lo && x <= hi) return x;
  }
  return Math.min(hi, Math.max(lo, normal(r, mean, sd)));
};

export const lognormal = (r: Rng, median: number, sigma: number) =>
  median * Math.exp(sigma * normal(r));

/* Lognormal from linear-space mean and standard deviation, a TypeScript
   translation of linear_to_lognormal_params of AMLGentex
   (src/data_creation/temporal_simulation/simulator.py, Apache License 2.0). */
export const lognormalLinear = (r: Rng, mean: number, sd: number) => {
  const v = sd * sd, m2 = mean * mean;
  const sigma2 = Math.log(1 + v / m2);
  const mu = Math.log(mean) - sigma2 / 2;
  return Math.exp(mu + Math.sqrt(sigma2) * normal(r));
};

export const poisson = (r: Rng, lam: number) => {
  if (lam <= 0) return 0;
  if (lam > 60) return Math.max(0, Math.round(normal(r, lam, Math.sqrt(lam))));
  const L = Math.exp(-lam);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
};

export function gamma(r: Rng, shape: number): number {
  if (shape < 1) return gamma(r, shape + 1) * Math.pow(Math.max(r(), 1e-12), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(r), v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = r();
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

export const beta = (r: Rng, a: number, b: number) => {
  const x = gamma(r, a), y = gamma(r, b);
  return x / (x + y);
};

/** Dirichlet(1,...,1): a random split of one unit into n shares. */
export const dirichlet = (r: Rng, n: number) => {
  const g = Array.from({ length: n }, () => gamma(r, 1));
  const s = g.reduce((a, b) => a + b, 0);
  return g.map((x) => x / s);
};

export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export const rint = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

export function shuffle<T>(r: Rng, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sampleK<T>(r: Rng, arr: readonly T[], k: number): T[] {
  if (k >= arr.length) return shuffle(r, arr);
  const a = [...arr];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(r() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

/** Weighted draw of k distinct indices; weights need not sum to one. */
export function weightedK(r: Rng, weights: number[], k: number, exclude?: Set<number>): number[] {
  const out: number[] = [];
  const w = weights.slice();
  if (exclude) for (const e of exclude) if (e < w.length) w[e] = 0;
  let total = w.reduce((a, b) => a + b, 0);
  for (let n = 0; n < k && total > 0; n++) {
    let u = r() * total;
    let i = 0;
    for (; i < w.length; i++) { u -= w[i]; if (u <= 0) break; }
    if (i >= w.length) i = w.length - 1;
    out.push(i);
    total -= w[i]; w[i] = 0;
  }
  return out;
}

export function weightedPick(r: Rng, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let u = r() * total;
  for (let i = 0; i < weights.length; i++) { u -= weights[i]; if (u <= 0) return i; }
  return weights.length - 1;
}
