/* The streams of random numbers. A seed is mixed with the period and the name of a family of activity, so that each
   family of each period draws from its own stream. generate.ts exports these names again, and the planter of the
   pattern library (patterns/plant.ts) uses them without importing generate.ts. */

/** lowbias32 (Wellons, 2018): a 32-bit mixer with near-ideal avalanche, so two
    inputs that differ in one bit give unrelated outputs. Seeds are mixed, never
    used raw, for the reason O'Neill gives for seed sequences: a seed and its
    neighbour must start unrelated streams. */
export function mix32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
/** A 32-bit hash of a text (FNV-1a), which gives each stream tag its own number. */
export const tagHash = (tag: string): number => { let h = 0x811c9dc5; for (let i = 0; i < tag.length; i++) { h ^= tag.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

/** The families of activity that draw from their own stream. Ordinary life, each
    crime family and the running of the days are separate, the way a world
    generator gives each structure its own salted seed and a splittable
    generator hands each task its own split: change one dial and only that
    family's draws change, and the rest of the period stays as it was. */
export const STREAMS = ["life", "aml", "fraud", "crypto", "days"] as const;
/** The name of one of the streams of STREAMS. */
export type StreamTag = (typeof STREAMS)[number];

/** The seed of one stream of one period of one bank: the seed number, the period and the family, mixed. The same three always give the same stream. A tag of the form "lib:" and a pattern id gives the stream of one library pattern. */
export function streamSeed(seed: number, period: number, tag: StreamTag | `lib:${string}`): number {
  return mix32((mix32(seed >>> 0) ^ Math.imul(period, 0x9e3779b1) ^ tagHash(tag)) >>> 0);
}
