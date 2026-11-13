/* A TypeScript translation of the class PatternScheduler of AMLGentex
   (src/data_creation/temporal_simulation/alert_patterns.py, Apache License 2.0,
   https://github.com/aidotse/AMLGentex), changed to draw from this repository's
   seeded generator and to leave out the case of more transactions than days.
   A pattern's transactions are placed inside its period by a beta
   distribution whose shape is the burstiness level:
   level 1 spreads them evenly, level 4 piles them into a few days. The
   level is drawn from a softmax over four levels whose temperature is the
   run's burstiness bias, so a bias of +4 makes nearly every pattern bursty
   and -4 makes nearly every pattern smooth. */

import { beta, rint, type Rng } from "../rng";

const BETA_PARAMS: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [1, 1], 2: [2, 2], 3: [0.5, 3], 4: [0.1, 5],
};

export function sampleBurstiness(r: Rng, bias: number): 1 | 2 | 3 | 4 {
  const scores = [0, 1, 2, 3].map((s) => Math.exp(bias * s));
  const total = scores.reduce((a, b) => a + b, 0);
  let u = r() * total;
  for (let i = 0; i < 4; i++) { u -= scores[i]; if (u <= 0) return (i + 1) as 1 | 2 | 3 | 4; }
  return 4;
}

export function scheduleSteps(r: Rng, start: number, end: number, n: number, level: 1 | 2 | 3 | 4): number[] {
  if (n <= 0) return [];
  if (start >= end) return new Array(n).fill(start);
  const period = end - start;
  if (n === 1) return [rint(r, start, end - 1)];
  const [a, b] = BETA_PARAMS[level];
  let steps = Array.from({ length: n }, () => start + Math.floor(beta(r, a, b) * period))
    .map((s) => Math.min(end - 1, Math.max(start, s)))
    .sort((x, y) => x - y);
  if (n <= period) {
    const uniq = new Set(steps);
    if (uniq.size < n) {
      // redistribute collisions onto distinct days, keeping the burst shape
      const avail = Array.from({ length: period }, (_, i) => start + i);
      const weights = avail.map(() => beta(r, a, b) + 0.01);
      const chosen: number[] = [];
      const w = weights.slice();
      for (let k = 0; k < n; k++) {
        const total = w.reduce((x, y) => x + y, 0);
        if (total <= 0) break;
        let u = r() * total; let i = 0;
        for (; i < w.length; i++) { u -= w[i]; if (u <= 0) break; }
        if (i >= w.length) i = w.length - 1;
        chosen.push(avail[i]); w[i] = 0;
      }
      steps = chosen.sort((x, y) => x - y);
    }
  }
  return steps;
}
