/* The expander: drawPlan makes every random draw of one case and price makes none. A typed copy of the reference
   implementation of the pattern library, with the same functions and the same order of draws, so that a stored case of
   the reference matches the case that this file makes. The 2 file formats are in ./types.

   ORDER OF DRAWS. Every draw comes from the one generator r. A Range draws exactly one number, even when low equals high,
   and an absent Wait counts as [0,0] and still draws one. No count depends on size, speed or bankSees, so the sequence
   is the same for every setting. (settings.atMax = true takes the upper end of every Range, plants every supporting
   step and draws nothing: it is only for check 10 of the validator.)
     Rule 1  no draw.
     Rule 2  1 draw for the value number u; then 1 draw (int) for the count of each customer party, in part order and then party order.
     Rule 3  parts in order source, hiding..., cash-out. Before a part's steps (not the first part) the hand-off takes 1 draw (int 1..30).
             Per step: a supporting step draws 1 number (planted if below chance); if not planted it draws nothing more.
             A step runs once, or once per leg of the step it follows (start.per), or once per member (each), or both
             (legs outside, members inside). Each run draws in this order, and a run is finished before the next starts:
     move    1 count n (int, times); 1 wait before the first leg (start); n-1 waits (between);
             the amount: of-forms 1 share, gbp or under n values (one per leg); then n weights (0.5..1.5) if split is uneven;
             then n via picks (int) if via is a list.
     chain   1 hop count N (int; none for through.party); 1 start wait; N between waits; 1 amount draw for the first leg;
             one peel share for each hop from fromHop to N; N+1 via picks if via is a list; one pick for each peel leg if peel.via is a list.
     split   1 ways W (int); 1 start wait; 1 over wait (the length of the fan-out); W over waits if gather; 1 amount draw
             (of-forms) or W (gbp, under); W via picks, then W more if gather, if via is a list.
     Rule 4  hand-off: the 1 draw above.   Rules 5 to 7  no draw. */

import { resolveAssets, PAIRS, RAILS } from "./types";
import type {
  Amount, BankSees, Chain, CaseLeg, CaseParty, ChainStep, LegRole, LegSpec, MoveStep, Part, PartKind, PartLookup,
  Pair, Pattern, Plan, PlanLeg, PlanParty, PlanRun, PlanSettings, PricedCase, Range, SeenBy, SplitStep, Step, Via, Wait,
  PartyKind, Asset,
} from "./types";
import { hashSeed, mulberry32, type Rng } from "../../rng";

type Unit = "minutes" | "hours" | "days";
const MIN: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };
const ZERO: Wait = { minutes: [0, 0] };
const OFF_CHAIN: readonly PartyKind[] = ["customer", "outside-account", "cash", "merchant"]; // kinds that have no chain of their own

/** The context of a run: the member of a customer party that the run is for, by party id. */
type Ctx = Record<string, number>;
/** A leg while the plan is made, with its creation number and its context. */
interface Draft {
  ci: number; part: string; step: string; minute: number; from: string; to: string; via: Via; asset: string; chain: Chain | null;
  seenBy: SeenBy; say: string; legRole: LegRole | null; need: "required" | "supporting"; pays: "case" | "own"; spec: LegSpec;
  run: number; first: boolean; ctx: Ctx;
}
/** The fields that a step gives to add. */
interface AddArgs {
  step: string; minute: number; from: string; to: string; via: Via; asset: Asset | "in" | "out"; say: string; legRole?: LegRole;
  need: "required" | "supporting"; pays?: "case" | "own"; spec: LegSpec; run: number; first?: boolean; ctx?: Ctx;
}
type AmountDraw = { s: number } | { pounds: number[] };

const getPart = (m: PartLookup, id: string): Part | undefined => (m instanceof Map ? m.get(id) : (m as Readonly<Record<string, Part>>)[id]);
const entryOf = (d: Part): string => { if (d.kind === "source") throw new Error(`${d.id}: a source part has no entry`); return d.entry; };
const exitOf = (d: Part): string => { if (d.kind === "cash-out") throw new Error(`${d.id}: a cash-out part has no exit`); return d.exit; };

/** Makes every random draw of one case and returns the plan. The plan holds no amount in pounds, apart from a written sum. */
export function drawPlan(pattern: Pattern, partsById: PartLookup, settings: PlanSettings, r: Rng): Plan {
  const get = (id: string): Part => { const x = getPart(partsById, id); if (!x) throw new Error(`${pattern.id}: names no part (${id})`); return x; };
  const size = settings.size ?? 1, speed = settings.speed ?? 1, sees: BankSees = settings.bankSees ?? pattern.bankSees, atMax = !!settings.atMax;
  if (!(size >= 0.25 && size <= 4) || !(speed >= 0.25 && speed <= 4)) throw new Error("size and speed must be 0.25 to 4");
  if (!["source", "cash-out", "both"].includes(sees)) throw new Error("bankSees must be source, cash-out or both");
  const defs = [pattern.parts.source, ...pattern.parts.hiding, pattern.parts.cashOut].map(get);
  const assets = resolveAssets(pattern, partsById); // rule 1
  if (!assets) throw new Error(`${pattern.id}: the assets do not join`);
  const P = defs.map((def, i) => ({ def, end: def.kind, in: assets[i].in, out: assets[i].out }));
  // draw helpers: one number from r each
  const flt = (g: Range): number => (atMax ? g[1] : g[0] + r() * (g[1] - g[0]));
  const int = (g: Range): number => (atMax ? g[1] : g[0] + Math.floor(r() * (g[1] - g[0] + 1)));
  const wait = (w: Wait): number => { // minutes: divided by speed, rounded, at least 1 where the range is above 0
    const u = (Object.keys(MIN) as Unit[]).find((k) => k in w);
    if (!u) throw new Error("a wait needs minutes, hours or days");
    const g = w[u] as Range, m = Math.round((flt(g) * MIN[u]) / speed);
    return g[1] > 0 && m < 1 ? 1 : m;
  };
  const thr = (name: "cashThreshold" | "travelRuleThreshold"): number => {
    const v = settings[name];
    if (v === undefined || !(v > 0)) throw new Error(`settings.${name} is needed for an under amount`);
    return v;
  };
  // rule 2
  const u = r(), counts: Record<string, number> = {};
  for (const p of P) for (const q of p.def.parties) if (q.kind === "customer") counts[`${p.def.id}.${q.id}`] = int(q.count ?? [1, 1]);

  const legs: Draft[] = [], parties = new Map<string, PlanParty>(), runs: PlanRun[] = [], nth: Record<string, number> = {};
  const stepLegs: Record<string, Draft[]> = {}, stepEnd: Record<string, number> = {};
  let ci = 0, runN = 0;
  const seesEnd = (end: PartKind): boolean => sees === "both" || sees === end;
  const reg = (key: string, group: string, p: { def: Part; end: PartKind }, kind: PartyKind, label: string, chain: Chain | undefined, cust?: boolean): string => {
    if (!parties.has(key)) parties.set(key, { key, group, part: p.def.id, end: p.end, kind, label, chain: chain ?? null, cust: !!cust });
    return key;
  };
  // rule 5: the key of a party. A customer ends #member (member 1 unless the step runs for each member);
  // a party with reuse "leg" is new for each leg that names it; others are one party for the case.
  const ref = (pi: number, id: string, ctx: Ctx, scope: Record<string, string>): string => {
    const p = P[pi], q = p.def.parties.find((x) => x.id === id), base = `${p.def.id}.${id}`;
    if (!q) throw new Error(`${p.def.id}: names no party (${id})`);
    if (q.kind === "customer")
      return reg(`${base}#${ctx[id] ?? 1}`, base, p, seesEnd(p.end) ? "customer" : "outside-account", q.label, q.chain, true);
    if (q.reuse === "leg") {
      if (!scope[id]) { nth[base] = (nth[base] ?? 0) + 1; scope[id] = `${base}#${nth[base]}`; }
      return reg(scope[id], base, p, q.kind, q.label, q.chain);
    }
    return reg(base, base, p, q.kind, q.label, q.chain);
  };
  // new wallets of a chain or a split are keyed <part>.<step id>#n
  const fresh = (pi: number, step: Step, kind: PartyKind, i: number): string =>
    reg(`${P[pi].def.id}.${step.id}#${i}`, `${P[pi].def.id}.${step.id}`, P[pi], kind, `a new ${kind}`, undefined);
  // rules 6 and 7 for one leg: its asset and chain, and who sees it
  const add = (pi: number, o: AddArgs): Draft => {
    const p = P[pi], pair: Pair | null = o.asset === "in" ? p.in : o.asset === "out" ? p.out : null;
    const sym = pair ? pair.split("@")[0] : o.asset, hit: string | undefined = pair ?? [p.in, p.out, ...PAIRS].find((x) => x.startsWith(sym + "@"));
    const chain = (o.via === "chain" || o.via === "bank-crypto") && sym !== "XMR" && hit ? (hit.split("@")[1] as Chain) : null;
    const cust = (k: string): boolean => parties.get(k)?.kind === "customer";
    const seenBy: SeenBy = (RAILS as readonly string[]).includes(o.via) && (cust(o.from) || cust(o.to)) ? "bank" : o.via === "chain" && sym !== "XMR" ? "chain" : "none";
    const leg: Draft = { ci: ci++, part: p.def.id, step: o.step, minute: o.minute, from: o.from, to: o.to, via: o.via, asset: sym, chain, seenBy,
      say: o.say, legRole: o.legRole ?? null, need: o.need, pays: o.pays ?? "case", spec: o.spec, run: o.run, first: !!o.first, ctx: o.ctx ?? {} };
    legs.push(leg);
    return leg;
  };
  const newRun = (pi: number, step: { id: string }, kind: PlanRun["kind"], n: number): number => { runs.push({ id: ++runN, part: P[pi].def.id, step: step.id, kind, n }); return runN; };
  const picks = (via: Via | Via[], n: number): number[] | null => (Array.isArray(via) ? Array.from({ length: n }, () => int([0, via.length - 1])) : null);
  const viaAt = (via: Via | Via[], vp: number[] | null, k: number): Via => (Array.isArray(via) && vp ? via[vp[k]] : (via as Via));
  const drawAmt = (am: Amount, n: number): AmountDraw => ("of" in am ? { s: flt(am.share) }
    : { pounds: Array.from({ length: n }, () => ("gbp" in am ? flt(am.gbp) * size : flt(am.share) * thr(am.under))) });
  const specOf = (am: Amount, d: AmountDraw, frac: number, k: number, par: Draft | null): LegSpec => ("of" in am && "s" in d
    ? { form: am.of, frac: d.s * frac, parent: par?.ci }
    : { form: "gbp" in am ? "gbp" : "under", pounds: "pounds" in d ? d.pounds[k] : 0 });

  // a move: n legs from `from` to `to`, the amount a share or a sum split over the legs
  const moveRun = (pi: number, step: MoveStep, anchor: number, ctx: Ctx, par: Draft | null): void => {
    const n = int(step.times ?? [1, 1]), t0 = wait(step.start);
    const gaps = Array.from({ length: n - 1 }, () => wait(step.between ?? ZERO));
    const d = drawAmt(step.amount, n);
    let w: number[] = Array(n).fill(1);
    if ("of" in step.amount && step.split === "uneven") w = Array.from({ length: n }, () => flt([0.5, 1.5]));
    else if ("of" in step.amount && step.split === "rising") w = w.map((_, k) => k + 1);
    const vp = picks(step.via, n), sum = w.reduce((a, b) => a + b, 0), run = newRun(pi, step, "move", n);
    let t = anchor + t0;
    for (let k = 0; k < n; k++) {
      if (k) t += gaps[k - 1];
      add(pi, { step: step.id, minute: t, from: ref(pi, step.from, ctx, {}), to: ref(pi, step.to, ctx, {}), via: viaAt(step.via, vp, k),
        asset: step.asset, say: step.say, legRole: step.legRole, need: step.need, pays: step.pays, run, first: k === 0, ctx,
        spec: specOf(step.amount, d, w[k] / sum, k, par) });
    }
  };
  // a chain: from -> hop 1 -> ... -> hop N -> to. Each hop from fromHop first sends its peel share to the peel party,
  // and then sends everything that is left onwards. The peel leg has the minute of the leg that follows it.
  const chainRun = (pi: number, step: ChainStep, anchor: number, ctx: Ctx, par: Draft | null): void => {
    const th = step.through, pl = step.peel, fromHop = pl?.fromHop ?? 1;
    const N = "party" in th ? counts[`${P[pi].def.id}.${th.party}`] : int(th.count), t0 = wait(step.start);
    const gaps = Array.from({ length: N }, () => wait(step.between ?? ZERO)), d = drawAmt(step.amount, 1);
    const peels: number[] = []; if (pl) for (let i = fromHop; i <= N; i++) peels.push(flt(pl.share));
    const vp = picks(step.via, N + 1), pv = pl && pl.via ? picks(pl.via, peels.length) : null, run = newRun(pi, step, "chain", N);
    const node = (i: number): string => (i === 0 ? ref(pi, step.from, ctx, {}) : i === N + 1 ? ref(pi, step.to, ctx, {})
      : "party" in th ? ref(pi, th.party, { [th.party]: i }, {}) : fresh(pi, step, th.new, i));
    const mainVia = (j: number): Via => viaAt(step.via, vp, j);
    let t = anchor + t0;
    for (let j = 0; j <= N; j++) {
      if (j) t += gaps[j - 1];
      if (pl && j >= Math.max(1, fromHop)) {
        const pvia: Via = pl.via ? viaAt(pl.via, pv, j - fromHop) : mainVia(j);
        add(pi, { step: step.id, minute: t, from: node(j), to: ref(pi, pl.to, ctx, {}), via: pvia, asset: step.asset, say: pl.say,
          legRole: step.legRole, need: step.need, run, ctx, spec: { form: "held", live: true, frac: peels[j - fromHop] } });
      }
      add(pi, { step: step.id, minute: t, from: node(j), to: node(j + 1), via: mainVia(j), asset: step.asset, say: step.say,
        legRole: step.legRole, need: step.need, run, first: j === 0, ctx, spec: j === 0 ? specOf(step.amount, d, 1, 0, par) : { form: "all" } });
    }
  };
  // a split: W legs from `from` to W wallets, spread evenly over the `over` wait, equal parts (the split kind has no weights).
  // Without gather the W-th wallet is the party `to`; with gather W new wallets each send all they hold to `to`.
  const splitRun = (pi: number, step: SplitStep, anchor: number, ctx: Ctx, par: Draft | null): void => {
    const W = int(step.ways), t0 = wait(step.start), over = wait(step.over);
    const gw = step.gather ? Array.from({ length: W }, () => wait(step.over)) : [], d = drawAmt(step.amount, W);
    const vp = picks(step.via, step.gather ? 2 * W : W), run = newRun(pi, step, "split", W);
    const node = (k: number): string => (!step.gather && k === W ? ref(pi, step.to, ctx, {}) : fresh(pi, step, "wallet", k));
    const times: number[] = [];
    for (let k = 1; k <= W; k++) {
      times[k] = anchor + t0 + (W > 1 ? Math.round(((k - 1) * over) / (W - 1)) : 0);
      add(pi, { step: step.id, minute: times[k], from: ref(pi, step.from, ctx, {}), to: node(k), via: viaAt(step.via, vp, k - 1),
        asset: step.asset, say: step.say, legRole: step.legRole, need: step.need, run, first: k === 1, ctx, spec: specOf(step.amount, d, 1 / W, k - 1, par) });
    }
    if (step.gather) for (let k = 1; k <= W; k++)
      add(pi, { step: step.id, minute: times[k] + gw[k - 1], from: node(k), to: ref(pi, step.to, ctx, {}), via: viaAt(step.via, vp, W + k - 1),
        asset: step.asset, say: step.say, legRole: step.legRole, need: step.need, run, ctx, spec: { form: "all" } });
  };
  const runStep = (pi: number, step: Step, anchor: number, ctx: Ctx, par: Draft | null): void => {
    if (step.kind === "move") moveRun(pi, step, anchor, ctx, par);
    else if (step.kind === "chain") chainRun(pi, step, anchor, ctx, par);
    else splitRun(pi, step, anchor, ctx, par);
  };

  P.forEach((p, pi) => {
    let entryT = 0;
    if (pi > 0) { // rule 4: the hand-off leg
      const prev = P[pi - 1], last = Math.max(0, ...legs.filter((l) => l.part === prev.def.id).map((l) => l.minute));
      entryT = last + int([1, 30]);
      const label = p.def.parties.find((q) => q.id === entryOf(p.def))?.label ?? "";
      add(pi, { step: "handoff", minute: entryT, from: ref(pi - 1, exitOf(prev.def), {}, {}), to: ref(pi, entryOf(p.def), {}, {}), via: "chain", asset: "in",
        say: `The funds move to ${label}.`, need: "required", run: newRun(pi, { id: "handoff" }, "move", 1), first: true, spec: { form: "all" } });
    }
    for (const step of p.def.steps) {
      const sk = `${p.def.id}.${step.id}`, a = step.start.after;
      const ref0 = a === "case" ? 0 : a === "entry" ? entryT : stepEnd[`${p.def.id}.${a}`];
      if (step.need === "supporting" && !(atMax || r() < (step.chance ?? 0))) { stepLegs[sk] = []; stepEnd[sk] = ref0; continue; }
      const parents: (Draft | null)[] = step.start.per === "leg" ? stepLegs[`${p.def.id}.${a}`] : [null];
      const each = step.kind === "move" ? step.each : undefined;
      const members: (number | null)[] = each ? Array.from({ length: counts[`${p.def.id}.${each}`] }, (_, i) => i + 1) : [null];
      const from = legs.length;
      for (const par of parents) for (const m of members)
        runStep(pi, step, par ? par.minute : ref0, { ...(par ? par.ctx : {}), ...(m && each ? { [each]: m } : {}) }, par);
      stepLegs[sk] = legs.slice(from);
      stepEnd[sk] = legs.length > from ? Math.max(...stepLegs[sk].map((l) => l.minute)) : ref0;
    }
  });

  // rule 7: running number in order of time (ties keep the order they were made in)
  legs.sort((x, y) => x.minute - y.minute || x.ci - y.ci);
  const seqOf = new Map(legs.map((l, i) => [l.ci, i + 1]));
  for (const l of legs) { // a party on a chain takes the chain of the first on-chain leg it is in, unless the file names one
    if (l.chain) for (const k of [l.from, l.to]) { const q = parties.get(k); if (q && !q.chain && !OFF_CHAIN.includes(q.kind)) q.chain = l.chain; }
  }
  const src = defs[0];
  if (src.kind !== "source") throw new Error(`${pattern.id}: the first part is no source part`);
  const sv = src.value;
  return {
    pattern: pattern.id, settings: { size, speed, bankSees: sees }, assets: P.map((p) => ({ part: p.def.id, in: p.in, out: p.out })),
    thresholds: { cashThreshold: settings.cashThreshold ?? null, travelRuleThreshold: settings.travelRuleThreshold ?? null },
    counts, runs, value: { u, part: src.id, log: pattern.value?.log ?? ("log" in sv ? sv.log : null), steps: "from" in sv, cap: "capByBalance" in sv ? sv.capByBalance ?? null : null },
    parties: [...parties.values()],
    legs: legs.map((l): PlanLeg => ({ seq: seqOf.get(l.ci) as number, part: l.part, step: l.step, minute: l.minute, from: l.from, to: l.to, via: l.via, asset: l.asset,
      chain: l.chain, seenBy: l.seenBy, say: l.say, legRole: l.legRole, need: l.need, pays: l.pays, run: l.run, first: l.first,
      spec: l.spec.parent != null ? { ...l.spec, parent: seqOf.get(l.spec.parent) } : l.spec })),
  };
}

/** Prices a plan: money only, and no draw. Amounts are whole pennies inside and pounds in the result.
    facts gives what each member of a customer party held on the first day, in pounds (balance plus overdraft), as
    { "<part>.<party>": [member 1, member 2, ...] }. fixed gives the written amount of a leg by its number, in pounds,
    where 0 means that the leg did not happen. */
export function price(plan: Plan, facts: Record<string, number[]> = {}, fixed: Record<number, number> = {}): PricedCase {
  const pen = (x: number): number => Math.round(x * 100);
  const held = new Map<string, number>(), amt = new Map<number, number>(), snap = new Map<number, number>(), get = (k: string): number => held.get(k) ?? 0;
  // rule 6: a customer's own money. facts gives what each member held on the first day, and an own leg takes at most
  // 90% of it, less the customer's earlier own legs. 90% is the share to which the generator cuts a payment.
  const ownTaken = new Map<string, number>();
  const fundsOf = (k: string): number | null => { const [g, m] = k.split("#"); const v = facts?.[g]?.[Number(m) - 1]; return v === undefined ? null : pen(v); };
  const fx = (l: PlanLeg): number | null => (fixed && fixed[l.seq] !== undefined ? pen(fixed[l.seq]) : null);
  const V = plan.value;
  let valueP: number; // rule 1
  if (V.steps) valueP = plan.legs.filter((l) => l.part === V.part && l.pays === "own").reduce((a, l) => a + (fx(l) ?? pen(l.spec.pounds ?? 0)), 0);
  else {
    const log = V.log as Range;
    let v = Math.exp(Math.log(log[0]) + V.u * (Math.log(log[1]) - Math.log(log[0]))) * plan.settings.size;
    if (V.cap != null) { // the paying customers: the senders of own legs in the source part
      const pay = [...new Set(plan.legs.filter((l) => l.part === V.part && l.pays === "own").map((l) => l.from))];
      const have = pay.map((k) => { const [g, m] = k.split("#"); return facts?.[g]?.[Number(m) - 1]; }).filter((x): x is number => x !== undefined);
      if (have.length) v = Math.min(v, V.cap * have.reduce((a, b) => a + b, 0));
    }
    valueP = pen(v);
  }
  const legs: CaseLeg[] = [];
  for (const l of plan.legs) { // rules 2 to 4, in order of time
    const s = l.spec;
    if (l.first && (s.form === "held" && !s.live)) snap.set(l.run, get(l.from));
    if (l.first && s.form === "leg") snap.set(l.run, amt.get(s.parent as number) ?? 0);
    let a: number;
    if (s.form === "value") a = Math.round(valueP * (s.frac as number));
    else if (s.form === "held") a = Math.round((s.live ? get(l.from) : snap.get(l.run) as number) * (s.frac as number));
    else if (s.form === "leg") a = Math.round((snap.get(l.run) as number) * (s.frac as number));
    else if (s.form === "all") a = get(l.from);
    else a = pen(s.pounds as number);
    if (l.pays !== "case") { // rule 6: the budget follows the planned amounts, so a written amount does not move a later leg's cap
      const f = fundsOf(l.from);
      if (f !== null) { a = Math.min(a, Math.max(0, Math.floor(f * 0.9) - (ownTaken.get(l.from) ?? 0))); ownTaken.set(l.from, (ownTaken.get(l.from) ?? 0) + a); }
    }
    const written = fx(l);
    if (written !== null) a = written; // rule 3: the written amount
    if (l.pays === "case") a = Math.min(a, get(l.from)); // never more than the sender holds
    a = Math.max(a, 0);
    amt.set(l.seq, a);
    if (a < 1) continue; // below 1 penny: the leg is left out (its seq stays, so a later fixed map still lines up)
    if (l.pays === "case") held.set(l.from, get(l.from) - a);
    held.set(l.to, get(l.to) + a);
    legs.push({ seq: l.seq, part: l.part, step: l.step, minute: l.minute, from: l.from, to: l.to, via: l.via, asset: l.asset, chain: l.chain,
      amount: a / 100, seenBy: l.seenBy, say: l.say, legRole: l.legRole, need: l.need, pays: l.pays });
  }
  if (V.steps) valueP = plan.legs.filter((l) => l.part === V.part && l.pays === "own").reduce((x, l) => x + (amt.get(l.seq) ?? 0), 0); // what the own legs moved
  const used = new Set(legs.flatMap((l) => [l.from, l.to]));
  const parties = plan.parties.filter((q) => q.cust || used.has(q.key))
    .map((q): CaseParty => ({ key: q.key, group: q.group, part: q.part, end: q.end, kind: q.kind, label: q.label, chain: q.chain }));
  return { value: valueP / 100, parties, legs };
}

/** Draws and prices one case. */
export function expandCase(pattern: Pattern, partsById: PartLookup, settings: PlanSettings, r: Rng, facts?: Record<string, number[]>): PricedCase {
  return price(drawPlan(pattern, partsById, settings, r), facts);
}

/** The case that a page draws for a pattern: the same generator, seeded from the pattern's id, so that the case is the same each time. */
export function typicalCase(pattern: Pattern, partsById: PartLookup, settings: PlanSettings): PricedCase {
  return expandCase(pattern, partsById, settings, mulberry32(hashSeed(pattern.id)));
}
