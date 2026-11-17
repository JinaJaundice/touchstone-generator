/* The planter (docs/PATTERN_FORMAT.md section 6): places the cases of the library patterns that a user has switched on.
   scheduleLibrary(w) runs after scheduleCrypto and settleLibrary(w) after the days have run. A typed copy of the
   reference planter, with the same order of random draws, so that a case planted here matches the stored cases of
   scripts/fixtures/library-golden. The working state of a world is kept in a map of this file and never reaches the
   data set. */

import { mulberry32 } from "../../rng";
import { makeEthAddress, makeSegwitAddress, makeTronAddress } from "../address";
import { streamSeed } from "../streams";
import { classOf } from "../walletClass";
import sources from "../sources.json";
import { LIBRARY_VERSION } from "./version";
import { PARTS, PATTERNS } from "./index";
import { drawPlan, price } from "./expand";
import labelsFile from "./labels.json";
import type { Scheduled, World } from "../world";
import type { AccountRole, GenConfig, LibraryCase, LibraryRecord, PatternInstance, Tx } from "../types";
import type {
  CaseLeg as PricedLeg, CaseParty, Chain, CustomerPick, Part, Party as PartParty, Pattern, Plan, PlanLeg, PlanSettings, PricedCase, SourcePart, Step, TraceClass, Via,
} from "./types";
import { partIdOf } from "./types";

/** The most rows of case legs that one pattern may write. */
export const LIBRARY_ROW_CAP = 20000;
let rowCap = LIBRARY_ROW_CAP;
/** Sets the cap of rows for one pattern. Check L10 of qa-library.ts calls it to reach the cap with a small data set, and sets it back to LIBRARY_ROW_CAP. */
export function setRowCap(n: number): void { rowCap = n; }

const FPS_LIMIT = sources.fasterPayments.perPaymentGbp as Record<string, number>;
const SCHEME_LIMIT = sources.fasterPayments.schemeLimit;
const ALLOWED: ReadonlyMap<string, readonly string[]> = new Map(labelsFile.patterns.map((p) => [p.id, p.allowed]));

// section 6.1: the need of a party as a sentence
const SEG_WORD: Record<string, string> = { retail: "a personal customer", sme: "a small firm", corporate: "a corporate", private: "a private client" };
/** The need of a customer party as a sentence in plain words, made from its pick. */
export function needSentence(pick: CustomerPick | undefined): string {
  const pk: CustomerPick = pick ?? {}, segs = (pk.segments ?? []).map((x) => SEG_WORD[x]);
  const bits = [segs.length ? (segs.length < 2 ? segs[0] : segs.slice(0, -1).join(", ") + " or " + segs[segs.length - 1]) : "a customer"];
  if (pk.minAge !== undefined) bits.push(`aged ${pk.minAge} or over`);
  if (pk.maxAge !== undefined) bits.push(`aged ${pk.maxAge} or under`);
  if (pk.openedWithinDays !== undefined) bits.push(`with an account opened in the ${pk.openedWithinDays} days before the case`);
  if (pk.hasWallet) bits.push("with a linked wallet");
  if (pk.hasCard) bits.push("with a card");
  if (pk.cashBusiness) bits.push("that takes most of its money in cash");
  if (pk.balance === "top-quarter") bits.push("among the quarter that holds the most");
  return bits.join(" ");
}

const part = (id: string): Part => { const p = PARTS.get(id); if (!p) throw new Error(`The pattern library holds no part ${id}`); return p; };
const partyDef = (use: string, group: string): PartParty | undefined => part(partIdOf(use)).parties.find((x) => `${use}.${x.id}` === group);
const stepOf = (use: string, stepId: string): Step | undefined => part(partIdOf(use)).steps.find((x) => x.id === stepId);

/** True where a case was cut short: some required step, other than a hand-off, has no payment whose number is in happened. A step is one pair of the use and the step of a payment. */
export function cutShortOf(legs: readonly PlanLeg[], happened: ReadonlySet<number>): boolean {
  const stepHappened = new Map<string, boolean>();
  for (const l of legs) if (l.need === "required" && l.step !== "handoff") { const k = `${l.part}.${l.step}`; stepHappened.set(k, (stepHappened.get(k) ?? false) || happened.has(l.seq)); }
  return [...stepHappened.values()].some((v) => !v);
}

/** The patterns that are switched on with a rate above 0, in the order of their ids. */
export function patternsOn(cfg: GenConfig): Pattern[] {
  const lib = cfg.library;
  return PATTERNS.filter((p) => { const s = lib?.[p.id]; return !!s?.on && (s.per1k ?? p.per1k) > 0; });
}

interface Info extends CaseParty { ref: string; address: string | null; u1: number; u2: number; def: PartParty | undefined; country: string; lost: number }
interface Row { l: PricedLeg; t: number; sched: boolean }
interface Rec {
  caseId: number; pattern: string; sees: "source" | "cash-out" | "both"; n: number;
  plan: Plan; first: PricedCase; facts: Record<string, number[]>;
  account: Map<string, number>;          // party key -> account
  info: Map<string, Info>;               // party key -> the party of the first price with its details
  traceClass: TraceClass;
  planted: { end: "source" | "cash-out"; p: PatternInstance }[];
  rows: Map<number, Row>;                // seq -> row of the first price
  fixed: Record<number, number>;         // written amounts (0 for a refused or unscheduled leg)
  sched: Map<number, Scheduled>;
  queued: Set<number>;
  txs: Map<number, Tx | null>;
}
interface State { recs: Map<number, Rec>; list: Rec[]; held: Set<number>; skipIdx: Map<string, LibraryRecord["skipped"][number]> }
const STATE = new WeakMap<World, State>();

const pen = (x: number) => Math.round(x * 100);

function hex(r: () => number, n: number): string { let s = ""; for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16); return s; }
function addressFor(r: () => number, chain: Chain): string {
  if (chain === "bitcoin") return makeSegwitAddress(r);
  if (chain === "ethereum") return makeEthAddress(r);
  return makeTronAddress(r);
}

/** Adds one to the entry of the record of skipped cases that has this pattern, reason, party and need. The entries stay in the order in which each first occurred. */
function skip(w: World, st: State, pattern: string, reason: "no-account" | "no-rail" | "no-transaction", party: string | null, need: string | null): void {
  const k = [pattern, reason, party ?? "", need ?? ""].join("|");
  let e = st.skipIdx.get(k);
  if (!e) { e = { pattern, reason, party, need, cases: 0 }; st.skipIdx.set(k, e); (w.library as LibraryRecord).skipped.push(e); }
  e.cases++;
}

/** Plants the cases of every library pattern that is switched on with a rate above 0. It returns before it draws or writes anything where there is none. */
export function scheduleLibrary(w: World): void {
  const on = patternsOn(w.cfg);
  if (!on.length) return;
  const lib = w.cfg.library!;
  w.library = { version: LIBRARY_VERSION, cases: [], skipped: [], capped: [] };
  const st: State = { recs: new Map(), list: [], held: new Set(w.accounts.filter((a) => a.patterns.length > 0).map((a) => a.id)), skipIdx: new Map() }; // rule 2
  STATE.set(w, st);
  w.onLibraryLeg = (s, tx) => onLeg(st, s, tx);
  const saved = w.r, period = w.cfg.period ?? 1;
  try {
    for (const p of on) { // rule 1
      w.r = mulberry32(streamSeed(w.cfg.seed, period, `lib:${p.id}`));
      plantPattern(w, st, p, lib[p.id]);
    }
  } finally { w.r = saved; }
}

function plantPattern(w: World, st: State, p: Pattern, set: NonNullable<GenConfig["library"]>[string]) {
  const sees = set.bankSees ?? p.bankSees;
  if (!(ALLOWED.get(p.id) ?? []).includes(sees)) throw new Error(`${p.id}: bankSees ${sees} is not allowed`);
  const settings: PlanSettings = { size: set.size ?? 1, speed: set.speed ?? 1, bankSees: sees, cashThreshold: w.cfg.cashThreshold, travelRuleThreshold: w.cfg.travelRuleThreshold };
  const rate = set.per1k ?? p.per1k;
  const wanted = Math.max(1, Math.round((rate * w.accounts.length) / 1000)); // rule 3
  const rec0 = w.library as LibraryRecord;
  const usedP = new Set<number>();
  let rows = 0;
  for (let n = 0; n < wanted; n++) {
    const plan = drawPlan(p, PARTS, settings, w.r); // rule 4
    const pre: Record<number, number> = {};
    { // a rail that the bank does not offer: another rail of the step's list, or the case is not planted
      const pr = w.cfg.products;
      const off = (v: string) => ((v === "cash-in" || v === "cash-out") && pr.cashServices === "none") || (v === "swift" && pr.international === false) || (v === "bank-crypto" && !(w.cfg.cryptoActiveShare > 0));
      let noRail: string | null = null;
      for (const l of plan.legs) {
        if (l.seenBy !== "bank" || !off(l.via)) continue;
        const step = stepOf(l.part, l.step);
        if (!step) throw new Error(`${p.id}: the step ${l.part}.${l.step} is not in the library`);
        const peel = step.kind === "chain" ? step.peel : undefined;
        const isPeel = !!peel && l.say === peel.say;
        const list: Via[] = ([] as Via[]).concat(isPeel && peel ? peel.via ?? step.via : step.via);
        const alt = list.find((v) => !off(v));
        if (alt) l.via = alt; else if (step.need === "supporting") pre[l.seq] = 0; else { noRail = l.via; break; } // a supporting step is left out of the case
      }
      if (noRail) { skip(w, st, p.id, "no-rail", null, noRail); continue; }
    }
    if (rows + plan.legs.length > rowCap) { if (!rec0.capped.includes(p.id)) rec0.capped.push(p.id); break; } // rule 12
    let lastRel = 0; for (const l of plan.legs) lastRel = Math.max(lastRel, l.minute);
    const startMin = 540 + Math.floor(w.r() * 601);
    const endOff = Math.floor((startMin + lastRel) / 1440);
    const day0 = Math.floor(w.r() * (Math.max(0, w.cfg.days - 1 - endOff) + 1));
    // rule 5: fill each member of each customer party that the bank sees
    const custKeys: string[] = plan.parties.filter((q) => q.kind === "customer").map((q) => q.key);
    const groups = new Map<string, string[]>();
    for (const k of custKeys) { const g = k.split("#")[0]; (groups.get(g) ?? groups.set(g, []).get(g)!).push(k); }
    const account = new Map<string, number>(), usedC = new Set<number>();
    let fail: { party: string; need: string } | null = null;
    for (const [g, keys] of groups) {
      const q = plan.parties.find((x) => x.group === g)!;
      const def = partyDef(q.part, g);
      const pool = poolFor(w, def, day0);
      keys.sort((a, b) => Number(a.split("#")[1]) - Number(b.split("#")[1]));
      for (const k of keys) {
        const cand: number[] = [];
        for (const id of pool) {
          if (usedP.has(id) || usedC.has(id)) continue;
          if (st.held.has(id) && !(w.r() < w.cfg.multiPatternShare)) continue;
          cand.push(id);
        }
        if (!cand.length) { fail = { party: g, need: needSentence(def?.pick) }; break; }
        const id = cand[Math.floor(w.r() * cand.length)];
        account.set(k, id); usedC.add(id);
      }
      if (fail) break;
    }
    if (fail) { skip(w, st, p.id, "no-account", fail.party, fail.need); continue; }
    for (const id of usedC) usedP.add(id);
    // rule 6
    const facts: Record<string, number[]> = {};
    for (const [k, id] of account) {
      const [g, m] = k.split("#"), a = w.accounts[id];
      (facts[g] ??= [])[Number(m) - 1] = Math.max(0, a.initialBalance + a.overdraftLimit);
    }
    const first = price(plan, facts, pre);
    rows += first.legs.length;
    const rec = plantCase(w, p, sees, n, plan, first, facts, account, day0 * 1440 + startMin);
    st.recs.set(rec.caseId, rec); st.list.push(rec);
  }
}

function poolFor(w: World, def: PartParty | undefined, day0: number): number[] {
  const pk: CustomerPick = def?.pick ?? {};
  let c = w.accounts.filter((a) => a.openedDay <= day0
    && (!pk.segments || pk.segments.includes(a.segment))
    && (pk.minAge === undefined || a.age >= pk.minAge) && (pk.maxAge === undefined || a.age <= pk.maxAge)
    && (pk.openedWithinDays === undefined || day0 - a.openedDay <= pk.openedWithinDays)
    && (pk.hasWallet === undefined || (a.wallet !== null) === pk.hasWallet)
    && (pk.hasCard === undefined || a.hasCard === pk.hasCard)
    && (pk.cashBusiness === undefined || a.cashBusiness === pk.cashBusiness));
  if (pk.balance === "top-quarter") {
    const hold = (a: { initialBalance: number; overdraftLimit: number }) => a.initialBalance + a.overdraftLimit;
    c = [...c].sort((x, y) => hold(y) - hold(x) || x.id - y.id).slice(0, Math.ceil(c.length / 4)).sort((x, y) => x.id - y.id);
  }
  return c.map((a) => a.id);
}

function plantCase(w: World, p: Pattern, sees: "source" | "cash-out" | "both", n: number, plan: Plan, first: PricedCase, facts: Record<string, number[]>, account: Map<string, number>, base: number): Rec {
  const caseId = w.nextCase++;
  const srcDef = part(p.parts.source) as SourcePart, outDef = part(p.parts.cashOut);
  const lost = 1 - p.parts.hiding.reduce((a, id) => a * (1 - ((part(id) as { hides?: { chance: number } }).hides?.chance ?? 0)), 1);
  const info = new Map<string, Info>(first.parties.map((q) => [q.key, { ...q, ref: "", address: null, u1: 0, u2: 0, def: undefined, country: "GB", lost }]));
  // party details, drawn in party order: reference, address, the two label draws and the country
  for (const q of first.parties) {
    if (q.kind === "customer") continue;
    const def = partyDef(q.part, q.group);
    const o = info.get(q.key)!;
    o.ref = q.kind === "exchange" ? "VASP-" + Math.floor(w.r() * 8) : "LIB-" + hex(w.r, 8);
    o.address = q.chain ? addressFor(w.r, q.chain) : null;
    o.u1 = w.r(); o.u2 = w.r();
    o.def = def;
    const c = def?.country ?? "GB";
    o.country = c === "GB" ? "GB" : c === "high-risk" ? w.country("high") : c === "corridor" ? w.country("destination") : w.country("any-foreign");
  }
  const rec: Rec = { caseId, pattern: p.id, sees, n, plan, first, facts, account, info, traceClass: srcDef.traceClass, planted: [], rows: new Map(), fixed: {}, sched: new Map(), queued: new Set(), txs: new Map() };
  // rule 7: one planted pattern for each end that the bank sees
  const ends: ("source" | "cash-out")[] = sees === "both" ? ["source", "cash-out"] : [sees];
  const abs = (l: PricedLeg) => base + l.minute;
  for (const end of ends) {
    const pt = end === "source" ? srcDef : outDef;
    const cust = first.parties.filter((q) => q.kind === "customer" && q.end === end);
    if (!cust.length) continue;
    const accs = cust.map((q) => account.get(q.key)!);
    const roles: Record<number, AccountRole> = {};
    for (const q of cust) roles[account.get(q.key)!] = partyDef(q.part, q.group)!.role!;
    const firstParty = pt.parties.find((x) => x.kind === "customer" && cust.some((q) => q.group === `${pt.id}.${x.id}`))!;
    const mk = cust.filter((q) => q.group === `${pt.id}.${firstParty.id}`).sort((a, b) => Number(a.key.split("#")[1]) - Number(b.key.split("#")[1]))[0];
    const named = first.legs.filter((l) => cust.some((q) => q.key === l.from || q.key === l.to));
    const sd = named.length ? Math.floor(Math.min(...named.map(abs)) / 1440) : Math.floor(base / 1440), ed = named.length ? Math.floor(Math.max(...named.map(abs)) / 1440) : sd;
    const ids = [...new Set<string>([...p.references.map((x) => x.id), ...pt.references.map((x) => x.id)])];
    if (!pt.family) throw new Error(`${pt.id}: family: is required where the part has a customer party`);
    const inst = w.newPattern(`lib.${p.id}.${end}`, pt.family, accs, account.get(mk.key)!, sd, ed, p.title, { caseId, roles, sources: ids });
    inst.library = { pattern: p.id, end };
    rec.planted.push({ end, p: inst });
  }
  // rows of the first price. A leg that the first price left out stays out in every later price.
  for (const l of first.legs) rec.rows.set(l.seq, { l, t: 0, sched: false });
  for (const l of plan.legs) if (!rec.rows.has(l.seq)) rec.fixed[l.seq] = 0;
  // rule 8: schedule each leg that the bank sees, in order of time; a delay moves every later leg
  let prev = 0, late = false; // prev is the time of the latest earlier leg: the legs of a case are written in their order
  const endT = w.cfg.days * 1440;
  for (const l of first.legs) {
    let t = Math.max(abs(l), prev);
    if (l.seenBy === "bank" && (l.via === "cash-in" || l.via === "cash-out")) { // a counter is open from 09:00 to 17:00: ask for its next opening
      const m = t % 1440, d = Math.floor(t / 1440);
      if (m > 1020) t = (d + 1) * 1440 + 540; else if (m < 540) t = d * 1440 + 540;
    }
    const row = rec.rows.get(l.seq)!;
    row.t = t; row.sched = false;
    prev = t;
    if (t >= endT) { rec.fixed[l.seq] = 0; late = true; continue; } // after the last day: the leg did not happen
    if (l.seenBy !== "bank") continue;
    const s = toScheduled(w, rec, l, t);
    const ok = w.schedule(s);
    if (ok) {
      const t2 = s.day * 1440 + s.minute;
      row.t = t2; row.sched = true; prev = Math.max(prev, t2);
      rec.sched.set(l.seq, s); rec.queued.add(l.seq);
    } else { rec.fixed[l.seq] = 0; late = true; } // a slot after the last day, or a payment to itself
  }
  if (late) { // the legs that still wait take the price that follows from the legs that did not happen
    const res = price(rec.plan, rec.facts, rec.fixed);
    const amt = new Map<number, number>(res.legs.map((l) => [l.seq, l.amount]));
    for (const q of rec.queued) rec.sched.get(q)!.amount = amt.get(q) ?? 0;
  }
  return rec;
}

function toScheduled(w: World, rec: Rec, l: PricedLeg, t: number): Scheduled {
  const fp = rec.info.get(l.from)!, tp = rec.info.get(l.to)!;
  const fc = fp.kind === "customer", tc = tp.kind === "customer";
  const f = stepOf(l.part, l.step)?.facts ?? {};
  const endOf = (fc ? fp.end : tp.end) as "source" | "cash-out";
  const pat = rec.planted.find((x) => x.end === endOf)!.p;
  const s: Scheduled = {
    day: Math.floor(t / 1440), minute: t % 1440, from: -2, to: -1, amount: l.amount, type: "TRANSFER",
    patternId: pat.id, typology: pat.typology, family: pat.family, role: l.legRole, caseId: rec.caseId,
    leg: { caseId: rec.caseId, seq: l.seq }, useOverdraft: true,
  };
  const A = (q: CaseParty) => rec.account.get(q.key)!;
  if (fc) s.from = A(fp); if (tc) s.to = A(tp);
  const out = fc && !tc, inn = !fc && tc;
  const fpsOrChaps = (): void => {
    if (l.via === "chaps") { s.method = "chaps"; return; }
    const limit = fc ? FPS_LIMIT[w.accounts[s.from].segment] : SCHEME_LIMIT;
    s.method = l.amount > limit || l.amount > SCHEME_LIMIT ? "chaps" : "fps";
  };
  if (l.via === "fps" || l.via === "chaps") {
    fpsOrChaps();
    s.type = inn ? "INCOME" : "TRANSFER";
    if (out) s.cpRef = tp.ref; if (inn) s.cpRef = fp.ref;
    if (fc && s.type === "TRANSFER") { if (f.payeeType) s.payeeType = f.payeeType; }
  } else if (l.via === "swift") {
    s.method = "swift"; s.type = inn ? "INCOME" : "TRANSFER";
    if (out) { s.cpRef = tp.ref; s.country = tp.country; } else { s.cpRef = fp.ref; s.country = fp.country; }
  } else if (l.via === "cash-in") { s.type = "CASH_IN"; s.method = w.cfg.products.cashServices === "partner" ? "partner-counter" : "counter"; s.from = -2; }
  else if (l.via === "cash-out") { s.type = "CASH_OUT"; s.method = w.cfg.products.cashServices === "partner" ? "partner-counter" : "counter"; s.to = -1; }
  else if (l.via === "card") {
    s.type = "SPEND"; s.to = -1; s.merchant = tp.ref;
    if (f.method) s.method = f.method; if (f.mcc) s.mcc = f.mcc;
  } else if (l.via === "bank-crypto") {
    const other = out ? tp : fp, kind = other.kind;
    s.type = out ? "CRYPTO_OUT" : "CRYPTO_IN"; s.wallet = other.address; s.cpRef = other.address ?? undefined;
    if (out) s.to = w.slotOf(other.address as string); else s.from = -2;
    const c: NonNullable<Scheduled["crypto"]> = { counterparty: kind === "exchange" ? "exchange" : kind === "wallet" ? "self-hosted" : "service", travelRule: kind === "exchange" ? "complete" : "not-required", ownershipProven: kind === "wallet" ? false : null };
    // rule 10
    if (inn && other.end === "cash-out" && kind === "wallet") {
      if (other.u1 < other.lost) { c.label = "unknown"; c.predicted = null; c.confidence = null; }
      else { c.label = "illicit"; c.predicted = rec.traceClass; c.confidence = 0.8 + 0.19 * other.u2; }
    } else if (out && other.def?.known) {
      if (other.u1 < other.def.known.chance) { c.label = "illicit"; c.predicted = other.def.known.class; c.confidence = 0.8 + 0.19 * other.u2; }
      else { c.label = "unknown"; c.predicted = null; c.confidence = null; }
    }
    s.walletClass = c.label === "illicit" && c.predicted ? classOf(c.predicted) : "unknown";
    s.crypto = c;
  }
  if (fc && (f.reason || f.callActive !== undefined || f.remoteAccess !== undefined || f.newDevice !== undefined)) {
    if (f.reason) s.payee = { reason: f.reason };
    const ses: NonNullable<Scheduled["session"]> = {};
    if (f.callActive !== undefined) ses.callActive = f.callActive;
    if (f.remoteAccess !== undefined) ses.remoteAccess = f.remoteAccess;
    if (f.newDevice !== undefined) ses.newDevice = f.newDevice;
    if (Object.keys(ses).length) s.session = ses;
  }
  return s;
}

// rule 9
function onLeg(st: State, s: Scheduled, tx: Tx | null): void {
  const rec = st.recs.get(s.leg!.caseId);
  if (!rec) return;
  const seq = s.leg!.seq;
  rec.fixed[seq] = tx ? tx.amount : 0;
  rec.txs.set(seq, tx);
  rec.queued.delete(seq);
  const res = price(rec.plan, rec.facts, rec.fixed);
  const amt = new Map<number, number>(res.legs.map((l) => [l.seq, l.amount]));
  for (const q of rec.queued) rec.sched.get(q)!.amount = amt.get(q) ?? 0;
}

/** Settles each case after the days have run: writes its parties and its rows, sets the windows of its planted patterns again, and removes a case whose planted patterns wrote no transaction. */
export function settleLibrary(w: World): void {
  const st = STATE.get(w);
  const lib = w.library;
  if (!st || !lib) return;
  const alive = new Set(w.patterns.map((p) => p.id));
  const txBy = new Map<number, Tx[]>();
  for (const t of w.txs) if (t.patternId >= 0 && alive.has(t.patternId) && t.typology && String(t.typology).startsWith("lib.")) (txBy.get(t.patternId) ?? txBy.set(t.patternId, []).get(t.patternId)!).push(t);
  for (const rec of st.list) {
    const last = price(rec.plan, rec.facts, rec.fixed);
    const lastAmt = new Map<number, number>(last.legs.map((l) => [l.seq, l.amount]));
    const rows: typeof w.caseLegs = [];
    const stats = { planned: 0, atPlanned: 0 };
    let reduced = false;
    const happened = new Set<number>();
    for (const l of rec.first.legs) {
      const r = rec.rows.get(l.seq)!;
      const bank = l.seenBy === "bank";
      const tx = rec.txs.get(l.seq) ?? null;
      let amount: number, day: number, minute: number, txId: number | null = null;
      if (bank) {
        stats.planned++;
        if (tx && tx.amount > 0) {
          amount = tx.amount; day = tx.day; minute = tx.minute; txId = tx.id;
          if (pen(l.amount) - pen(amount) > 1) reduced = true; else stats.atPlanned++;
        } else { amount = 0; day = Math.floor(r.t / 1440); minute = r.t % 1440; }
      } else { amount = lastAmt.get(l.seq) ?? 0; day = Math.floor(r.t / 1440); minute = r.t % 1440; }
      if (amount > 0) happened.add(l.seq);
      rows.push({ caseId: rec.caseId, seq: l.seq, pattern: rec.pattern, part: l.part, step: l.step, day, minute, from: l.from, to: l.to, via: l.via,
        asset: l.asset, chain: l.chain, planned: l.amount, amount, seenBy: l.seenBy, tx: txId, say: l.say });
    }
    const cutShort = cutShortOf(rec.plan.legs, happened);
    const live = rec.planted.filter((x) => alive.has(x.p.id));
    if (!live.length) { skip(w, st, rec.pattern, "no-transaction", null, null); continue; }
    // the windows of the planted patterns follow their transactions
    for (const x of live) {
      const ts = txBy.get(x.p.id) ?? [];
      x.p.startDay = Math.min(...ts.map((t) => t.day)); x.p.endDay = Math.max(...ts.map((t) => t.day));
    }
    const liveEnds = new Set(live.map((x) => x.end));
    for (const q of rec.first.parties) {
      const o = rec.info.get(q.key)!;
      const acc = q.kind === "customer" ? rec.account.get(q.key)! : null;
      w.parties.push({ caseId: rec.caseId, key: q.key, group: q.group, pattern: rec.pattern, part: q.part, end: q.end, kind: q.kind, label: q.label,
        account: acc !== null && liveEnds.has(q.end as "source" | "cash-out") ? acc : null, chain: q.chain ?? null, address: o.address ?? null });
    }
    for (const r of rows) w.caseLegs.push(r);
    const entry: LibraryCase = { caseId: rec.caseId, pattern: rec.pattern, bankSees: rec.sees, value: rec.first.value,
      startDay: Math.min(...rows.map((r) => r.day)), endDay: Math.max(...rows.map((r) => r.day)), reduced, cutShort, bankLegs: stats.planned, inFull: stats.atPlanned };
    lib.cases.push(entry);
  }
}
