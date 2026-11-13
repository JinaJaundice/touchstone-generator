/* The laundering typologies.

   The first eight follow AMLGentex's alert patterns
   (src/data_creation/temporal_simulation/alert_patterns.py, Apache License 2.0,
   https://github.com/aidotse/AMLGentex). Each has the shape and the algorithm
   of its AMLGentex pattern in code that was written for this repository, with
   an onward leg, roles and countries added. They are fan-in, fan-out, cycle,
   bipartite, stacked layers with amount splitting and a fee skimmed at each
   layer, scatter-gather and gather-scatter with their two phases, and random.
   The next six are UK placement and profile typologies. Five follow laundering
   types of the SAML-D benchmark (the register of sources, S49): structuring,
   smurfing, deposit-and-send, behavioural change and single large. The sixth,
   rapid pass-through, follows the mule literature. Three more come from the
   scenario libraries and SAML-D (the register of sources, S32 and S49):
   cash-out (credits taken out in cash), over-invoicing (trade-based laundering
   on a business account) and a dormant account that wakes and passes money
   through (Oracle's "escalation in inactive account", BioCatch's sleeper
   accounts, S18).

   Every leg carries its role: placement (money arriving), layering (moving
   between accounts), integration (leaving to the world outside the data).

   Amounts. A laundering leg's amount is a truncated normal whose mean sits
   above the ordinary transfer mean by a factor the run chooses: with
   amountOverlap at 1 the two distributions match (AMLGentex's difficult
   setting), at 0 laundering legs run four times larger (its easy setting).

   Members. Accounts are drawn with a weight that rises with their degree in
   the payment graph when centralityBias is above zero, which is AMLGentex's
   account selector in miniature: launderers tend to sit on connected
   accounts. An account already inside a pattern can join a second one with
   probability multiPatternShare. */

import { dirichlet, lognormalLinear, rint, sampleK, truncNormal, weightedK } from "../rng";
import { sampleBurstiness, scheduleSteps } from "./scheduler";
import type { World } from "./world";
import type { AmlTypology, Family, LegRole } from "./types";
import { TYPOLOGY_LABEL } from "./types";
import sources from "./sources.json";

type Level = 1 | 2 | 3 | 4;

export function amountParams(w: World, main: number) {
  const base = w.typicalTransfer(main);
  const factor = 1 + 3 * (1 - w.cfg.amountOverlap);
  const mean = base * factor;
  return { mean, sd: mean * 0.35, lo: 5, hi: mean * 6 };
}
export const sampleAmount = (w: World, p: { mean: number; sd: number; lo: number; hi: number }) =>
  truncNormal(w.r, p.mean, p.sd, p.lo, p.hi);

/** Pick n accounts for a pattern, biased to well-connected ones. */
export function pickMembers(w: World, n: number, opts: { established?: boolean; retailOnly?: boolean; young?: boolean } = {}): number[] {
  const bias = w.cfg.centralityBias * 2.5;
  const weights = w.accounts.map((a, i) => {
    if (a.quietDaysBefore > 0) return 0;
    if (opts.established && a.openedDay > -60) return 0;
    if (opts.retailOnly && a.segment !== "retail") return 0;
    if (opts.young && a.openedDay < -400 && w.r() > 0.25) return 0;
    if (a.patterns.length > 0 && w.r() > w.cfg.multiPatternShare) return 0;
    return Math.pow(1 + w.degree[i], bias);
  });
  const chosen = weightedK(w.r, weights, n);
  while (chosen.length < n) {
    const c = rint(w.r, 0, w.accounts.length - 1);
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen;
}

/** A pattern's period. It cannot start before its members' accounts exist,
    so the earliest start is the day after the latest opening among them. */
export function period(w: World, members: number[] = []): { start: number; end: number; level: Level } {
  const dur = Math.max(2, Math.min(w.cfg.days - 1, Math.round(lognormalLinear(w.r, w.cfg.durationMean, w.cfg.durationSd))));
  const earliest = Math.max(0, ...members.map((m) => w.accounts[m].openedDay + 1));
  const latestStart = Math.max(earliest, w.cfg.days - dur - 1);
  const start = Math.min(w.cfg.days - 3, rint(w.r, earliest, latestStart));
  return { start, end: Math.min(w.cfg.days - 1, start + dur), level: sampleBurstiness(w.r, w.cfg.burstinessBias) };
}

const FAMILY: Family = "aml";

/** The five layered patterns whose members, on the "rides on existing
    relationships" setting, are a connected group of the payment graph. */
const RIDES_ON_LINKS = new Set<AmlTypology>(["stack", "scatter_gather", "gather_scatter", "bipartite", "cycle"]);

/** Pick n accounts that already pay one another: a walk out from a
    well-connected seed over the bank's own payment graph, breadth first, so
    the order follows the layers. Random members fill any shortfall. */
export function pickConnected(w: World, n: number): number[] {
  const [seed] = pickMembers(w, 1);
  const out = [seed];
  const seen = new Set(out);
  let frontier = [seed];
  while (out.length < n && frontier.length) {
    const next: number[] = [];
    for (const a of frontier) {
      const pool = [...w.beneficiaries[a], ...w.originators[a]];
      for (const b of sampleK(w.r, pool, pool.length)) {
        if (out.length >= n) break;
        if (seen.has(b)) continue;
        seen.add(b);
        if (w.accounts[b].patterns.length > 0 && w.r() > w.cfg.multiPatternShare) continue;
        out.push(b); next.push(b);
      }
    }
    frontier = next;
  }
  while (out.length < n) {
    const c = rint(w.r, 0, w.accounts.length - 1);
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}

/** A leg sized like the ordinary transfers between the two accounts (sized for the smaller party, as ordinary payments between customers are), so what it adds sits inside the accounts' usual noise. */
function quietAmount(w: World, from: number, to = -1): number {
  const mean = to >= 0 ? Math.min(w.typicalTransfer(from), w.typicalTransfer(to)) : w.typicalTransfer(from);
  return truncNormal(w.r, mean, mean * 0.45, 5, mean * 3);
}

/** Where a dispersal leg lands: a share goes abroad, some of that to higher-risk places. */
function dispersalCountry(w: World): string | undefined {
  const u = w.r();
  if (u < 0.10) return w.country("high");
  if (u < 0.22) return w.country("medium");
  if (u < 0.30) return w.country("any-foreign");
  return undefined;
}

export function scheduleAml(w: World) {
  const n = w.accounts.length;
  for (const key of Object.keys(w.cfg.aml) as AmlTypology[]) {
    const tc = w.cfg.aml[key];
    if (!tc.enabled) continue;
    const count = Math.round(tc.per1k * n / 1000);
    for (let c = 0; c < count; c++) {
      const size = rint(w.r, tc.minAccounts, tc.maxAccounts);
      inject(w, key, size);
    }
  }
}

const CASH_SHAPES = new Set<AmlTypology>(["structuring", "smurfing", "deposit_send", "cash_out"]);

function inject(w: World, key: AmlTypology, size: number) {
  if (CASH_SHAPES.has(key) && w.cfg.products.cashServices === "none") return;
  if (key === "over_invoicing" && !w.cfg.products.international) return;
  // on the "rides on existing relationships" setting the layered patterns take connected members, quiet amounts, no border and no visible placement
  const hidden = !!w.cfg.ridesExistingLinks && RIDES_ON_LINKS.has(key);
  const legAmount = (from: number, ap: { mean: number; sd: number; lo: number; hi: number }, to = -1) => hidden ? quietAmount(w, from, to) : sampleAmount(w, ap);
  /** of several payees, the one with the smallest ordinary transfers: a quiet leg split among them is sized for it */
  const smallest = (xs: number[]) => xs.reduce((a, b) => (w.typicalTransfer(b) < w.typicalTransfer(a) ? b : a), xs[0]);
  // members first, then a period that begins after every member's account exists
  const picked = hidden ? pickConnected(w, key === "bipartite" ? Math.max(4, size) : key === "cycle" ? size : Math.max(5, size))
    : key === "behaviour_change" || key === "single_large" ? pickMembers(w, 1, { established: true })
    : key === "bipartite" ? pickMembers(w, Math.max(4, size))
    : key === "stack" || key === "scatter_gather" || key === "gather_scatter" || key === "smurfing" ? pickMembers(w, Math.max(5, size))
    : key === "structuring" ? pickMembers(w, 1)
    : key === "passthrough" ? pickMembers(w, Math.max(2, size))
    : key === "cash_out" ? pickMembers(w, Math.max(1, size), { young: true })
    : key === "over_invoicing" || key === "dormant_reactivation" ? []
    : pickMembers(w, size);
  if ((key === "over_invoicing" || key === "dormant_reactivation") ? false : picked.length === 0) return;
  const { start, end, level } = period(w, picked);
  // some laundering moves round sums (an assumption, sources.json; register S32): each transfer rounded to the nearest GBP 100
  const round = !hidden && w.r() < sources.assumptions.launderingRoundShare;
  const T = (day: number, from: number, to: number, amount: number, patternId: number, extra: Partial<Parameters<World["schedule"]>[0]> = {}) => {
    if (round && amount >= 450) amount = Math.round(amount / 100) * 100;
    if (hidden) {
      if (from >= 0 && to >= 0) w.knownPayee(from, to);
      extra = { ...extra, country: undefined, hidden: true };
    }
    const role: LegRole = from >= 0 && to >= 0 ? "layering" : to < 0 ? "integration" : "placement";
    w.schedule({ day, minute: w.minute("day"), from, to, amount, type: "TRANSFER", patternId, typology: key, family: FAMILY, role, caseId: caseOf(patternId), ...extra });
  };
  const story = TYPOLOGY_LABEL[key];
  const caseOf = (pid: number) => w.patterns[w.patterns.length - 1]?.id === pid ? w.patterns[w.patterns.length - 1].caseId : (w.patterns.find((q) => q.id === pid)?.caseId ?? -1);

  switch (key) {
    case "fan_out": {
      const [main, ...members] = picked;
      const p = w.newPattern(key, FAMILY, [main, ...members], main, start, end, story);
      const ap = amountParams(w, main);
      const steps = scheduleSteps(w.r, start, end, members.length, level);
      members.forEach((m, i) => T(steps[i], main, m, sampleAmount(w, ap), p.id, { fund: i === 0, country: dispersalCountry(w) }));
      return;
    }
    case "fan_in": {
      const [main, ...members] = picked;
      const p = w.newPattern(key, FAMILY, [main, ...members], main, start, end, story);
      const ap = amountParams(w, main);
      const steps = scheduleSteps(w.r, start, end, members.length, level);
      members.forEach((m, i) => T(steps[i], m, main, sampleAmount(w, ap), p.id, { fund: true }));
      // the collected sum moves on
      if (w.r() < 0.7) {
        const total = members.length * ap.mean * (1 - w.cfg.marginRatio);
        T(Math.min(w.cfg.days - 1, end + rint(w.r, 0, 3)), main, -1, total * truncNormal(w.r, 0.85, 0.05, 0.6, 0.95), p.id,
          { country: dispersalCountry(w) ?? w.country("any-foreign") });
      }
      return;
    }
    case "cycle": {
      const all = picked;
      const p = w.newPattern(key, FAMILY, all, all[0], start, end, story);
      const ap = amountParams(w, all[0]);
      const steps = scheduleSteps(w.r, start, end, all.length, level);
      let amt = legAmount(all[0], ap, hidden ? smallest(all) : -1) * (hidden ? 1 : 2);
      all.forEach((a, i) => {
        T(steps[i], a, all[(i + 1) % all.length], amt, p.id, { fund: i === 0 });
        amt *= (1 - w.cfg.marginRatio) * truncNormal(w.r, 1, 0.02, 0.95, 1.02);
      });
      return;
    }
    case "bipartite": {
      const all = picked;
      const p = w.newPattern(key, FAMILY, all, all[0], start, end, story);
      const ap = amountParams(w, all[0]);
      const nOrig = rint(w.r, 2, all.length - 2);
      const origs = all.slice(0, nOrig), benes = all.slice(nOrig);
      const steps = scheduleSteps(w.r, start, end, origs.length * benes.length, level);
      let i = 0;
      for (const o of origs) for (const b of benes) T(steps[i++], o, b, legAmount(o, ap, b), p.id, { fund: true });
      return;
    }
    case "stack": {
      const all = picked;
      const layers = splitLayers(w, all, rint(w.r, 2, Math.min(5, Math.floor(all.length / 2))));
      const p = w.newPattern(key, FAMILY, all, layers[0][0], start, end, story);
      const ap = amountParams(w, all[0]);
      const span = end - start, nPer = layers.length - 1;
      const incoming = new Map<number, number>();
      let lastStep = start;
      for (let li = 0; li < nPer; li++) {
        const from = layers[li], to = layers[li + 1];
        const ls = Math.max(lastStep + 1, start + Math.floor(li * span / nPer));
        const le = Math.max(ls + 1, start + Math.floor((li + 1) * span / nPer));
        const legs: [number, number, number][] = [];
        for (const f of from) {
          const k = Math.min(to.length, rint(w.r, 1, 3));
          const targets = sampleK(w.r, to, k);
          const total = li === 0 ? legAmount(f, ap, hidden ? smallest(targets) : -1) * (hidden ? 1 : 2) : (incoming.get(f) ?? 0) * (1 - w.cfg.marginRatio);
          if (total <= 1) continue;
          const shares = dirichlet(w.r, k);
          targets.forEach((t, j) => legs.push([f, t, total * shares[j]]));
        }
        const steps = scheduleSteps(w.r, ls, Math.min(le, w.cfg.days), legs.length, level);
        legs.forEach(([f, t, a], j) => {
          T(steps[j], f, t, a, p.id, { fund: li === 0 });
          incoming.set(t, (incoming.get(t) ?? 0) + a);
          lastStep = Math.max(lastStep, steps[j]);
        });
      }
      return;
    }
    case "scatter_gather":
    case "gather_scatter": {
      const all = picked;
      const [ph0, ph1, ph2] = splitLayers(w, all, 3);
      const p = w.newPattern(key, FAMILY, all, ph0[0], start, end, story);
      const ap = amountParams(w, all[0]);
      const mid = start + Math.floor((end - start) / 2);
      // phase 1: sources -> middle
      const sources = key === "scatter_gather" ? ph0 : ph1;
      const middle = key === "scatter_gather" ? ph1 : ph0;
      const targets = key === "scatter_gather" ? ph2 : ph2;
      const p1: [number, number][] = [];
      for (const m of middle) for (const s of sampleK(w.r, sources, Math.min(sources.length, rint(w.r, 1, 3)))) p1.push([s, m]);
      const s1 = scheduleSteps(w.r, start, Math.max(start + 1, mid), p1.length, level);
      const inMid = new Map<number, number>();
      let last = start;
      p1.forEach(([s, m], i) => {
        const a = legAmount(s, ap, m);
        T(s1[i], s, m, a, p.id, { fund: true });
        inMid.set(m, (inMid.get(m) ?? 0) + a);
        last = Math.max(last, s1[i]);
      });
      const p2: [number, number, number][] = [];
      for (const m of middle) {
        const got = (inMid.get(m) ?? 0) * (1 - w.cfg.marginRatio);
        if (got <= 1) continue;
        const k = Math.min(targets.length, rint(w.r, 1, 3));
        const ts = sampleK(w.r, targets, k), sh = dirichlet(w.r, k);
        ts.forEach((t, j) => p2.push([m, t, got * sh[j]]));
      }
      const s2 = scheduleSteps(w.r, Math.min(last + 1, end - 1), Math.max(last + 2, end), p2.length, level);
      p2.forEach(([m, t, a], i) => T(s2[i], m, t, a, p.id, { country: dispersalCountry(w) }));
      return;
    }
    case "random": {
      const all = picked;
      const p = w.newPattern(key, FAMILY, all, all[0], start, end, story);
      const ap = amountParams(w, all[0]);
      const steps = scheduleSteps(w.r, start, end, all.length * 2, level);
      steps.forEach((s, i) => {
        const f = all[rint(w.r, 0, all.length - 1)];
        let t = all[rint(w.r, 0, all.length - 1)];
        if (t === f) t = all[(all.indexOf(f) + 1) % all.length];
        T(s, f, t, sampleAmount(w, ap), p.id, { fund: i < all.length });
      });
      return;
    }
    case "structuring": {
      const [main] = picked;
      const p = w.newPattern(key, FAMILY, [main], main, start, end, story);
      const k = rint(w.r, 3, 9);
      const steps = scheduleSteps(w.r, start, end, k, level);
      const th = w.cfg.cashThreshold;
      let placed = 0;
      steps.forEach((s) => {
        const a = truncNormal(w.r, th * 0.9, th * 0.05, th * 0.72, th * 0.995);
        placed += a;
        w.schedule({ day: s, minute: w.minute("business"), from: -2, to: main, amount: a, type: "CASH_IN", patternId: p.id, typology: key, family: FAMILY, role: "placement", caseId: p.caseId });
      });
      if (w.r() < 0.7) T(Math.min(w.cfg.days - 1, steps[steps.length - 1] + rint(w.r, 0, 4)), main, -1, placed * truncNormal(w.r, 0.85, 0.06, 0.5, 0.97), p.id,
        { country: dispersalCountry(w) });
      return;
    }
    case "smurfing": {
      const [main, ...smurfs] = picked;
      const p = w.newPattern(key, FAMILY, [main, ...smurfs], main, start, end, story);
      const th = w.cfg.cashThreshold;
      const steps = scheduleSteps(w.r, start, end, smurfs.length, level);
      let total = 0;
      smurfs.forEach((s, i) => {
        const nDep = rint(w.r, 1, 2);
        let got = 0;
        for (let d = 0; d < nDep; d++) {
          const a = truncNormal(w.r, th * 0.45, th * 0.18, 300, th * 0.95);
          got += a;
          w.schedule({ day: Math.max(start, steps[i] - d), minute: w.minute("business"), from: -2, to: s, amount: a, type: "CASH_IN", patternId: p.id, typology: key, family: FAMILY, role: "placement", caseId: p.caseId });
        }
        const fwd = got * truncNormal(w.r, 0.95, 0.03, 0.8, 1);
        total += fwd;
        T(Math.min(w.cfg.days - 1, steps[i] + rint(w.r, 0, 2)), s, main, fwd, p.id);
      });
      if (w.r() < 0.75) T(Math.min(w.cfg.days - 1, end + rint(w.r, 0, 3)), main, -1, total * truncNormal(w.r, 0.9, 0.04, 0.6, 0.98), p.id,
        { country: dispersalCountry(w) ?? w.country("any-foreign") });
      return;
    }
    case "deposit_send": {
      const main = picked[0];
      const p = w.newPattern(key, FAMILY, picked, main, start, end, story);
      const rounds = rint(w.r, 1, 3);
      const steps = scheduleSteps(w.r, start, end, rounds, level);
      const th = w.cfg.cashThreshold;
      steps.forEach((s) => {
        const a = truncNormal(w.r, th * 0.8, th * 0.35, th * 0.3, th * 2.2);
        w.schedule({ day: s, minute: w.minute("business"), from: -2, to: main, amount: a, type: "CASH_IN", patternId: p.id, typology: key, family: FAMILY, role: "placement", caseId: p.caseId });
        const to = picked.length > 1 && w.r() < 0.5 ? picked[1] : -1;
        w.schedule({ day: Math.min(w.cfg.days - 1, s + rint(w.r, 0, 2)), minute: w.minute("day"), from: main, to, amount: a * truncNormal(w.r, 0.9, 0.04, 0.7, 0.98),
          type: "TRANSFER", patternId: p.id, typology: key, family: FAMILY, role: to === -1 ? "integration" : "layering", caseId: p.caseId, country: to === -1 ? (dispersalCountry(w) ?? "GB") : undefined });
      });
      return;
    }
    case "behaviour_change": {
      const [main] = picked;
      const p = w.newPattern(key, FAMILY, [main], main, start, end, story);
      const mult = truncNormal(w.r, 8, 2.5, 4, 14);
      const k = rint(w.r, 6, 16);
      const perLeg = w.accounts[main].declaredMonthlyOut * mult / k;
      const steps = scheduleSteps(w.r, start, end, k, level);
      steps.forEach((s, i) => T(s, main, -1, perLeg * truncNormal(w.r, 1, 0.2, 0.5, 1.6), p.id,
        { fund: true, country: i % 3 === 0 ? (dispersalCountry(w) ?? w.country("any-foreign")) : undefined }));
      return;
    }
    case "single_large": {
      const [main] = picked;
      const p = w.newPattern(key, FAMILY, [main], main, start, end, story);
      const amt = w.accounts[main].declaredMonthlyOut * truncNormal(w.r, 22, 8, 12, 45);
      const day = scheduleSteps(w.r, start, end, 1, level)[0];
      w.schedule({ day: Math.max(0, day - rint(w.r, 0, 3)), minute: w.minute("business"), from: -2, to: main, amount: amt * 1.05, type: "INCOME",
        country: w.r() < 0.5 ? w.country("any-foreign") : "GB", cpRef: `SL-${p.id}`, patternId: p.id, typology: key, family: FAMILY, role: "placement", caseId: p.caseId });
      T(day, main, -1, amt, p.id, { country: w.r() < 0.4 ? (dispersalCountry(w) ?? w.country("any-foreign")) : undefined });
      return;
    }
    case "passthrough": {
      const main = picked[0];
      const p = w.newPattern(key, FAMILY, picked, main, start, end, story);
      const ap = amountParams(w, main);
      const rounds = rint(w.r, 1, 3);
      const steps = scheduleSteps(w.r, start, end, rounds, level);
      steps.forEach((s) => {
        const nIn = rint(w.r, 2, 3);
        let got = 0;
        for (let i = 0; i < nIn; i++) {
          const a = sampleAmount(w, ap) * 3;
          got += a;
          const src = picked.length > 1 && w.r() < 0.4 ? picked[1 + (i % (picked.length - 1))] : -2;
          w.schedule({ day: s, minute: w.minute("day"), from: src, to: main, amount: a, type: src === -2 ? "INCOME" : "TRANSFER",
            patternId: p.id, typology: key, family: FAMILY, fund: src !== -2, role: src === -2 ? "placement" : "layering", caseId: p.caseId, cpRef: src === -2 ? `PT-${p.id}-${i}` : undefined });
        }
        const out = got * truncNormal(w.r, 0.9, 0.04, 0.8, 0.97);
        const nOut = rint(w.r, 1, 2), sh = dirichlet(w.r, nOut);
        for (let j = 0; j < nOut; j++) {
          T(Math.min(w.cfg.days - 1, s + rint(w.r, 0, 1)), main, -1, out * sh[j], p.id, { country: dispersalCountry(w) });
        }
      });
      return;
    }
    case "cash_out": {
      // credits from several sources, then taken out in cash: machines up to GBP 500 a day and the counter for the rest (SAML-D's cash withdrawal type)
      const [main, ...feeders] = picked;
      const p = w.newPattern(key, FAMILY, picked, main, start, end, story, { sources: ["S49", "S37", "S40"] });
      const rounds = rint(w.r, 1, 3);
      const steps = scheduleSteps(w.r, start, Math.max(start + 1, end - 3), rounds, level);
      steps.forEach((s, ri) => {
        let got = 0;
        const nIn = rint(w.r, 2, 4);
        for (let i = 0; i < nIn; i++) {
          const a = truncNormal(w.r, 900, 400, 150, 3000) * (1 + 2 * (1 - w.cfg.amountOverlap));
          got += a;
          const src = feeders.length && w.r() < 0.5 ? feeders[i % feeders.length] : -2;
          w.schedule({ day: s, minute: w.minute("day"), from: src, to: main, amount: a, type: src === -2 ? "INCOME" : "TRANSFER", cpRef: src === -2 ? `CO-${p.id}-${ri}-${i}` : undefined,
            patternId: p.id, typology: key, family: FAMILY, role: src === -2 ? "placement" : "layering", caseId: p.caseId, fund: src !== -2 });
        }
        // out in cash over the next few days
        let left = got * truncNormal(w.r, 0.9, 0.04, 0.75, 0.97);
        for (let d = 0; left > 20 && d < 5; d++) {
          const atm = Math.min(500, left);
          w.schedule({ day: Math.min(w.cfg.days - 1, s + d), minute: w.minute(d === 0 ? "evening" : "day"), from: main, to: -1, amount: atm, type: "CASH_OUT", method: "atm", patternId: p.id, typology: key, family: FAMILY, role: "cash-out", caseId: p.caseId });
          left -= atm;
          if (left > 1500 && w.cfg.products.cashServices !== "none") {
            const counter = Math.min(left, truncNormal(w.r, 2500, 800, 800, 6000));
            w.schedule({ day: Math.min(w.cfg.days - 1, s + d), minute: rint(w.r, 600, 960), from: main, to: -1, amount: counter, type: "CASH_OUT", method: "counter", patternId: p.id, typology: key, family: FAMILY, role: "cash-out", caseId: p.caseId });
            left -= counter;
          }
        }
      });
      return;
    }
    case "over_invoicing": {
      // a firm pays a trading partner abroad well above the goods' value, again and again (FATF/Egmont trade-based laundering; SAML-D's over-invoicing)
      const firms = w.accounts.filter((a) => (a.segment === "sme" || a.segment === "corporate") && a.quietDaysBefore === 0 && a.openedDay < -60 && (a.patterns.length === 0 || w.r() < w.cfg.multiPatternShare)).map((a) => a.id);
      if (!firms.length || !w.cfg.products.international) return;
      const main = firms[rint(w.r, 0, firms.length - 1)];
      const p = w.newPattern(key, FAMILY, [main], main, start, end, story, { sources: ["S49", "S37", "S32"] });
      const country = w.r() < 0.5 ? w.country("medium") : w.r() < 0.5 ? w.country("high") : w.country("any-foreign");
      const partner = `TRADE-${p.id}`;
      const k = rint(w.r, 3, 6);
      const steps = scheduleSteps(w.r, start, end, k, level);
      steps.forEach((s) => {
        const amt = w.typicalTransfer(main) * truncNormal(w.r, 4 + 2 * (1 - w.cfg.amountOverlap), 1.2, 2, 9);
        w.schedule({ day: s, minute: w.minute("business"), from: main, to: -1, amount: amt, type: "TRANSFER", method: "swift", country, cpRef: partner, payeeType: "business",
          payee: { reason: "invoice" }, patternId: p.id, typology: key, family: FAMILY, role: "integration", caseId: p.caseId, fund: true });
      });
      return;
    }
    case "dormant_reactivation": {
      // an account quiet for months wakes on a new device, takes in large credits and sends them on within days (a sold or lent account)
      const quiet = w.accounts.filter((a) => a.quietDaysBefore > 0 && a.patterns.length === 0 && a.openedDay < 0).map((a) => a.id);
      if (!quiet.length) return;
      const main = quiet[rint(w.r, 0, quiet.length - 1)];
      const p = w.newPattern(key, FAMILY, [main], main, start, end, story, { sources: ["S32", "S18", "S30"] });
      const newDevice = `dev-sold-${p.id}`;
      const where = w.r() < 0.4 ? w.country("any-foreign") : "GB";
      w.event(main, start, w.minute("evening"), "device-added", { deviceId: newDevice, ipCountry: where, patternId: p.id, typology: key });
      w.event(main, start, w.minute("evening"), "login-new-location", { deviceId: newDevice, ipCountry: where, patternId: p.id, typology: key });
      const rounds = rint(w.r, 1, 3);
      const steps = scheduleSteps(w.r, Math.min(end, start + 1), end, rounds, level);
      steps.forEach((s, ri) => {
        const a = truncNormal(w.r, 6000, 2500, 1500, 20000) * (1 + (1 - w.cfg.amountOverlap));
        w.schedule({ day: s, minute: w.minute("day"), from: -2, to: main, amount: a, type: "INCOME", cpRef: `DR-${p.id}-${ri}`, patternId: p.id, typology: key, family: FAMILY, role: "placement", caseId: p.caseId });
        const out = a * truncNormal(w.r, 0.9, 0.04, 0.75, 0.98);
        const nOut = rint(w.r, 1, 3);
        for (let j = 0; j < nOut; j++) {
          const country = dispersalCountry(w);
          w.schedule({ day: Math.min(w.cfg.days - 1, s + rint(w.r, 0, 2)), minute: w.minute("day"), from: main, to: -1, amount: out / nOut, type: "TRANSFER", country, method: country && country !== "GB" ? "swift" : undefined,
            session: { deviceId: newDevice, ipCountry: where }, patternId: p.id, typology: key, family: FAMILY, role: "integration", caseId: p.caseId });
        }
      });
      return;
    }
  }
}

/** Split accounts into ordered layers, each with at least one member. */
function splitLayers(w: World, all: number[], nLayers: number): number[][] {
  const shuffled = sampleK(w.r, all, all.length);
  const layers: number[][] = [];
  let idx = 0;
  for (let i = 0; i < nLayers; i++) {
    const remainingLayers = nLayers - i - 1;
    const maxHere = shuffled.length - idx - remainingLayers;
    const take = i === nLayers - 1 ? shuffled.length - idx : rint(w.r, 1, Math.max(1, Math.min(maxHere, Math.ceil(shuffled.length / nLayers) + 1)));
    layers.push(shuffled.slice(idx, idx + take));
    idx += take;
  }
  return layers.filter((l) => l.length > 0);
}
