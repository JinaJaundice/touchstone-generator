/* The run. Build the book, build the payment graph, schedule ordinary life
   and every injected typology, then walk the days and let the world emit.
   The output is one dataset object: accounts with truth flags, the
   transaction log, the pattern register, and a summary. */

import { mulberry32, poisson } from "../rng";
import { normaliseConfig } from "./config";
import { buildAccounts, buildGraph } from "./population";
import { dailyBehaviour, initDaily, scheduleNormalModels } from "./normal";
import { scheduleAml } from "./aml";
import { scheduleFraud } from "./fraud";
import { scheduleCrypto } from "./crypto";
import { World } from "./world";
import { makeCalendar } from "./calendar";
import type { Dataset, DatasetSummary, GenConfig, Tx, WalletClass, WalletRef } from "./types";

export type Progress = (stage: string, done: number, total: number) => void;

/** Map the behaviour class that the wallet pool gives an address onto the classes the rail uses. A class of "government criminal blacklist" is not a listing, so it maps to unknown; "sanctioned" is kept for an address on the OFAC list. */
export function classOf(type: string): WalletClass {
  switch (type) {
    case "centralized exchange": return "exchange";
    case "tumbler": case "money laundering": return "mixer";
    case "darknet market": case "blackmail": case "cyber-security service": return "darknet";
    case "gambling": return "gambling";
    case "individual wallet": case "P2P financial service": case "P2P financial infrastructure": return "personal";
    default: return "unknown";
  }
}

/** The wallet pool as wallet_pool.json writes it. */
export function readWalletPool(j: { wallets: { id: string; chain: "bitcoin"; label: "illicit" | "licit" | "unknown"; predicted: string; conf: number }[] }): WalletRef[] {
  return j.wallets.map((w) => ({ id: w.id, chain: w.chain, cls: classOf(w.predicted), label: w.label, predicted: w.predicted, conf: w.conf }));
}

/** The version of the generator. A data set carries it, because a seed number
    only makes the same data again on the generator that made it: the moment
    the mechanics change, the same seed gives a different bank, which is what
    every world-generating game records against its seeds. Bump it when the
    output of a seed changes. */
export { GENERATOR_VERSION } from "./version";
import { GENERATOR_VERSION } from "./version";

/** lowbias32 (Wellons, 2018): a 32-bit mixer with near-ideal avalanche, so two
    inputs that differ in one bit give unrelated outputs. Seeds are mixed, never
    used raw, for the reason O'Neill gives for seed sequences: a seed and its
    neighbour must start unrelated streams. */
function mix32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
const tagHash = (tag: string): number => { let h = 0x811c9dc5; for (let i = 0; i < tag.length; i++) { h ^= tag.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

/** The families of activity that draw from their own stream. Ordinary life, each
    crime family and the running of the days are separate, the way a world
    generator gives each structure its own salted seed and a splittable
    generator hands each task its own split: change one dial and only that
    family's draws change, and the rest of the period stays as it was. */
export const STREAMS = ["life", "aml", "fraud", "crypto", "days"] as const;
export type StreamTag = (typeof STREAMS)[number];

/** The seed of one stream of one period of one bank: the seed number, the period and the family, mixed. The same three always give the same stream. */
export function streamSeed(seed: number, period: number, tag: StreamTag): number {
  return mix32((mix32(seed >>> 0) ^ Math.imul(period, 0x9e3779b1) ^ tagHash(tag)) >>> 0);
}

export function generate(input: GenConfig, walletPool: WalletRef[], progress?: Progress, poolAbout?: string): Dataset {
  const cfg = normaliseConfig(input);
  const r = mulberry32(cfg.seed);
  progress?.("building the data set", 0, 1);
  const { accounts, banks } = buildAccounts(cfg, r, walletPool);
  const beneficiaries = buildGraph(cfg.accounts, cfg.seed);
  const period0 = cfg.period ?? 1;
  const cal = makeCalendar(period0, cfg.days);
  const w = new World(cfg, r, cal, accounts, walletPool, banks, beneficiaries);
  // established accounts already know their graph neighbours as payees
  accounts.forEach((a, i) => { if (a.openedDay < -30) beneficiaries[i].forEach((b) => { if (r() < 0.6) w.knownPayee(i, b); }); });

  // The bank is built; the days begin. Period 1 keeps the bank's own single
  // stream, so every data set, model card and fixture made before periods
  // existed is made again byte for byte. From period 2 each family of activity
  // draws from its own stream (STREAMS): the same customers and relationships,
  // a new run of days and of crime, and a dial moved on one family leaves the
  // other families' draws where they were.
  const period = cfg.period ?? 1;
  const stream = (tag: StreamTag) => { if (period > 1) w.r = mulberry32(streamSeed(cfg.seed, period, tag)); };

  progress?.("scheduling ordinary activity", 0, 1);
  stream("life");
  const st = initDaily(w);
  scheduleNormalModels(w);
  progress?.("planting laundering patterns", 0, 1);
  stream("aml");
  scheduleAml(w);
  progress?.("planting fraud", 0, 1);
  stream("fraud");
  scheduleFraud(w);
  progress?.("planting crypto patterns", 0, 1);
  stream("crypto");
  scheduleCrypto(w);

  stream("days");
  for (let day = 0; day < cfg.days; day++) {
    if (day % 5 === 0) progress?.("running the days", day, cfg.days);
    dailyBehaviour(w, day, st);
    for (const s of w.scheduledOn(day)) w.emit(s);
  }
  progress?.("closing the accounts", 1, 1);

  // opening balances as the first record, so a balance-reading rule can start
  const opening: Tx[] = [];
  // sort by time
  w.txs.sort((a, b) => a.day - b.day || a.minute - b.minute || a.id - b.id);
  w.txs.forEach((t, i) => { t.id = i; });
  w.events.sort((a, b) => a.day - b.day || a.minute - b.minute || a.account - b.account);

  // pattern stats and account behaviour fields
  const byPattern = new Map<number, { n: number; total: number }>();
  for (const t of w.txs) {
    if (t.patternId >= 0) {
      const s = byPattern.get(t.patternId) ?? { n: 0, total: 0 };
      s.n++; s.total += t.amount; byPattern.set(t.patternId, s);
    }
  }
  for (const p of w.patterns) { const s = byPattern.get(p.id); p.txCount = s?.n ?? 0; p.total = Math.round(s?.total ?? 0); }
  // a pattern that wrote no transaction is not in the truth: drop it and unmark its accounts
  const empty = new Set(w.patterns.filter((p) => p.txCount === 0).map((p) => p.id));
  if (empty.size) {
    w.patterns = w.patterns.filter((p) => !empty.has(p.id));
    for (const e of w.events) if (empty.has(e.patternId)) { e.patternId = -1; e.typology = null; }
    for (const a of w.accounts) {
      a.patterns = a.patterns.filter((id) => !empty.has(id));
      if (a.patterns.length === 0) { a.isSar = false; a.isFraud = false; a.fraudRole = null; }
    }
  }
  // an account's flags follow the patterns it is still in: laundering, mule, crypto roles make it SAR; any fraud or mule role makes it fraud
  const byId = new Map(w.patterns.map((p) => [p.id, p]));
  for (const a of w.accounts) {
    if (!a.patterns.length) continue;
    const roles = a.patterns.map((id) => byId.get(id)!).map((p) => ({ fam: p.family, role: p.roles[a.id] }));
    a.isSar = roles.some((x) => x.role === "launderer" || x.role === "mule" || x.role === "collector" || x.role === "first-party");
    a.isFraud = roles.some((x) => x.fam === "fraud" || x.fam === "mule");
    a.fraudRole = roles.some((x) => x.role === "first-party") ? "first-party" : roles.some((x) => x.role === "mule" || x.role === "collector") && roles.some((x) => x.fam === "mule") ? "mule" : roles.some((x) => x.fam === "fraud" && x.role === "victim") ? "victim" : null;
  }
  for (const a of w.accounts) {
    a.daysInBank = a.openedDay < 0 ? -a.openedDay + cfg.days : cfg.days - a.openedDay;
    a.phoneChanges += poisson(r, (a.isSar ? cfg.days / 380 : cfg.days / 1400));
  }

  const summary = summarise(w.txs, w, cfg);
  return {
    version: 1,
    generator: GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    config: cfg,
    day0: cal.day0,
    accounts: w.accounts,
    txs: [...opening, ...w.txs],
    events: w.events,
    adjustments: w.adjustments,
    patterns: w.patterns,
    wallets: walletPool,
    summary,
    grounding: {
      wallets: `${poolAbout ?? "The caller passed no description of the wallet pool."} Sanctioned addresses come from OFAC's list`,
      accounts: "AMLGentex behaviour model (AI Sweden with Handelsbanken and Swedbank), UK demographics, UK payment rails and calendar",
    },
  };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

function summarise(txs: Tx[], w: World, cfg: GenConfig): DatasetSummary {
  const byType: Record<string, number> = {}, byRail: Record<string, number> = {}, byMethod: Record<string, number> = {};
  let declined = 0;
  const byTypology: DatasetSummary["byTypology"] = {};
  let total = 0;
  for (const t of txs) {
    byType[t.type] = (byType[t.type] ?? 0) + 1;
    byRail[t.rail] = (byRail[t.rail] ?? 0) + 1;
    byMethod[t.method] = (byMethod[t.method] ?? 0) + 1;
    if (t.status === "declined") { declined++; continue; }
    total += t.amount;
    if (t.typology) {
      const s = byTypology[t.typology] ?? { instances: 0, accounts: 0, txs: 0, total: 0 };
      s.txs++; s.total += t.amount; byTypology[t.typology] = s;
    }
  }
  for (const p of w.patterns) {
    const s = byTypology[p.typology] ?? { instances: 0, accounts: 0, txs: 0, total: 0 };
    s.instances++; s.accounts += p.accounts.length; byTypology[p.typology] = s;
  }
  for (const k of Object.keys(byTypology)) byTypology[k].total = Math.round(byTypology[k].total);
  const amounts = txs.filter((t) => t.type !== "INITIAL" && t.status !== "declined").map((t) => t.amount).sort((a, b) => a - b);
  return {
    accounts: w.accounts.length,
    txs: txs.length,
    days: cfg.days,
    patterns: w.patterns.length,
    sarAccounts: w.accounts.filter((a) => a.isSar).length,
    fraudAccounts: w.accounts.filter((a) => a.isFraud).length,
    byTypology, byType, byRail, byMethod,
    amountPercentiles: { p50: percentile(amounts, 50), p90: percentile(amounts, 90), p99: percentile(amounts, 99), p999: percentile(amounts, 99.9), max: amounts[amounts.length - 1] ?? 0 },
    totalValue: Math.round(total),
    newAccounts: w.accounts.filter((a) => a.openedDay >= 0).length,
    cryptoAccounts: w.accounts.filter((a) => a.wallet).length,
    events: w.events.length,
    declined,
  };
}
