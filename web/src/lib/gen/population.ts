/* The book: who holds the accounts, and who pays whom.

   Demographics follow AMLGentex's approach (age band, income for the band,
   balance as months of income with structural and random noise) with UK
   figures. The age bands, their shares and the take-home pay of each band
   are assumptions of this generator. The pay of the four working-age bands
   is within 9% of the monthly take-home pay of a full-time employee on the
   median gross annual pay of an overlapping age group in the ONS Annual
   Survey of Hours and Earnings for 2024 (the register of sources, S56),
   under the tax rules of 2024 to 2025. The pay for age 65 to 84 and the
   shares have no published source. Business turnover is lognormal around a
   small-firm median. The payment graph is AMLGentex's scale-free network: a
   truncated power law on degree with an exponential cutoff, the exponent
   solved so the mean degree comes out at four. */

import { lognormal, mulberry32, rint, shuffle, truncNormal, weightedPick, type Rng } from "../rng";
import type { Account, Channel, CountryMix, GenConfig, Segment, Tier, WalletRef } from "./types";
import { CORRIDOR_COUNTRIES, EEA_COUNTRIES, HIGH_RISK_COUNTRIES, OTHER_COUNTRIES } from "./types";
import { makeSegwitAddress } from "./address";
import sources from "./sources.json";

const AGE_BANDS: { lo: number; hi: number; weight: number; takeHome: number }[] = [
  { lo: 18, hi: 24, weight: 0.11, takeHome: 1750 },
  { lo: 25, hi: 34, weight: 0.22, takeHome: 2450 },
  { lo: 35, hi: 49, weight: 0.29, takeHome: 2850 },
  { lo: 50, hi: 64, weight: 0.24, takeHome: 2650 },
  { lo: 65, hi: 84, weight: 0.14, takeHome: 1650 },
];

const BANK_NAMES = ["Bank A", "Bank B", "Bank C", "Bank D", "Bank E", "Bank F"];

function tierFor(r: Rng, seg: Segment, channel: Channel): Tier {
  if (seg === "corporate" || seg === "private") return 3;
  if (seg === "sme") return r() < 0.4 ? 2 : 3;
  const u = r();
  // a customer taken on online without being met sits on the lighter tiers more often
  if (channel === "digital") return u < 0.2 ? 1 : u < 0.85 ? 2 : 3;
  return u < 0.08 ? 1 : u < 0.8 ? 2 : 3;
}

/** Weights inside the remittance corridors: India, Pakistan and Nigeria are the three largest destinations for money sent from the UK (Migration Observatory, 2024), so they carry the most. */
const CORRIDOR_WEIGHTS = CORRIDOR_COUNTRIES.map((c) => c === "IN" ? 5 : c === "PK" ? 4 : c === "NG" ? 3 : 1);

/** A country drawn from the four pools by the mix given. */
export function pickCountry(r: Rng, mix: CountryMix): string {
  const pools = [EEA_COUNTRIES, OTHER_COUNTRIES, CORRIDOR_COUNTRIES, HIGH_RISK_COUNTRIES];
  const k = weightedPick(r, [mix.eea, mix.other, mix.corridor, mix.highRisk]);
  if (k === 2) return CORRIDOR_COUNTRIES[weightedPick(r, CORRIDOR_WEIGHTS)];
  const pool = pools[k];
  return pool[rint(r, 0, pool.length - 1)];
}

export function buildAccounts(cfg: GenConfig, r: Rng, _walletPool: WalletRef[]): { accounts: Account[]; banks: string[] } {
  const banks = BANK_NAMES.slice(0, cfg.banks);
  const segW = [cfg.segments.retail, cfg.segments.sme, cfg.segments.corporate, cfg.segments.private ?? 0];
  const segs: Segment[] = ["retail", "sme", "corporate", "private"];
  const accounts: Account[] = [];
  // a customer's own wallet is made for them (address.ts); a separate stream keeps the bank's other draws where they were
  const walletStream = mulberry32((cfg.seed ^ 0x5eed1e55) >>> 0);
  let household = 0;
  for (let i = 0; i < cfg.accounts; i++) {
    const segment = segs[weightedPick(r, segW)];
    let age: number, income: number;
    if (segment === "retail") {
      const band = AGE_BANDS[weightedPick(r, AGE_BANDS.map((b) => b.weight))];
      age = rint(r, band.lo, band.hi);
      income = Math.round(lognormal(r, band.takeHome, 0.38));
    } else if (segment === "sme") {
      age = rint(r, 2, 30); // years trading
      income = Math.round(lognormal(r, 22000, 0.85));
    } else if (segment === "private") {
      // a private client: older, and a monthly income several times a salary (investment income, drawings, a large salary)
      age = rint(r, 35, 80);
      income = Math.round(lognormal(r, 14000, 0.6));
    } else {
      age = rint(r, 5, 60);
      income = Math.round(lognormal(r, 320000, 0.7));
    }
    const channel: Channel = r() < cfg.customers.digitalShare ? "digital" : "branch";
    const personal = segment === "retail" || segment === "private";
    const isNew = r() < cfg.newAccountShare;
    const openedDay = isNew ? rint(r, 0, cfg.days - 1) : -rint(r, 45, 3600);
    const months = segment === "retail" ? 2.2 : segment === "sme" ? 1.1 : segment === "private" ? 3.5 : 1.4;
    const initialBalance = Math.round(Math.max(20, income * months * Math.exp(0.55 * gauss(r))) * 100) / 100;
    const declared = personal
      ? income * truncNormal(r, 0.62, 0.15, 0.2, 1.1)
      : income * truncNormal(r, 0.9, 0.12, 0.5, 1.2);
    // home country: the UK, or one drawn from the bank's mix of non-UK homes
    const country = r() < cfg.customers.nonResidentShare ? pickCountry(r, cfg.geography.homeMix) : "GB";
    const wallet = personal && r() < cfg.cryptoActiveShare ? makeSegwitAddress(walletStream) : null;
    // an arranged overdraft for the share of customers the bank gives one to, sized to income;
    // ordinary spending may dip into it, so a negative balance on its own means nothing
    const odShare = segment === "retail" ? cfg.products.overdrafts : segment === "sme" ? Math.min(1, cfg.products.overdrafts * 1.2) : segment === "private" ? cfg.products.overdrafts * 0.5 : 0;
    const overdraftLimit = r() < odShare
      ? Math.round(income * truncNormal(r, segment === "sme" ? 0.8 : 0.6, 0.3, 0.2, 1.5) / 50) * 50 : 0;
    // a politically exposed person is rare among personal customers and eight times as common among private clients
    const pep = personal && r() < cfg.customers.pepShare * (segment === "private" ? 8 : 1);
    const cashBusiness = segment === "sme" && r() < cfg.customers.cashBusinessShare;
    const hasCard = r() < (personal ? cfg.products.cards : Math.min(1, cfg.products.cards + 0.02));
    // an established personal account may have sat quiet for months before the period: a dormant account (an assumption, sources.json)
    const quietDaysBefore = personal && !isNew && openedDay < -400 && walletStream() < sources.assumptions.dormantShare ? rint(walletStream, 180, Math.min(1400, -openedDay)) : 0;
    // about three in ten personal customers share an address with another customer here (a household)
    const joinsHousehold = personal && i > 0 && walletStream() < sources.assumptions.householdShare && accounts[i - 1].segment !== "sme" && accounts[i - 1].segment !== "corporate";
    const addressId = joinsHousehold ? accounts[i - 1].addressId : `ADDR-${(household++).toString(36)}`;
    accounts.push({
      id: i, customerId: `CUST-${String(i + 1).padStart(6, "0")}`,
      bank: banks[rint(r, 0, banks.length - 1)],
      segment, tier: tierFor(r, segment, channel), age, income,
      declaredMonthlyOut: Math.round(declared),
      country, openedDay, quietDaysBefore, initialBalance, overdraftLimit,
      // some households bank on one phone or tablet (an assumption, sources.json): the ordinary noise a shared-device rule lives with
      deviceId: joinsHousehold && walletStream() < sources.assumptions.householdSharedDevice ? accounts[i - 1].deviceId : `dev-${(i * 2654435761 >>> 0).toString(16)}`,
      addressId,
      wallet, pep, cashBusiness, channel, hasCard,
      isSar: false, isFraud: false, fraudRole: null, patterns: [],
      daysInBank: 0, phoneChanges: 0,
    });
  }
  return { accounts, banks };
}

const gauss = (r: Rng) => { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* ---- the scale-free payment graph (AMLGentex generate_scalefree) ---- */

function degreePmf(gamma: number, kmin: number, kmax: number): number[] {
  const p: number[] = [];
  let s = 0;
  for (let k = kmin; k <= kmax; k++) { const v = Math.pow(k, -gamma) * Math.exp(-2 * k / kmax); p.push(v); s += v; }
  return p.map((v) => v / s);
}
function meanDegree(gamma: number, kmin: number, kmax: number): number {
  const p = degreePmf(gamma, kmin, kmax);
  return p.reduce((acc, v, i) => acc + v * (kmin + i), 0);
}
/** Solve for the exponent that gives the target mean degree (bisection; the
    mean is strictly decreasing in gamma). */
export function solveGamma(target: number, kmin: number, kmax: number): number {
  let lo = -2, hi = 6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (meanDegree(mid, kmin, kmax) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function buildGraph(n: number, seed: number, averageDegree = 4): number[][] {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const kmin = 1, kmax = Math.max(2, Math.min(n - 1, Math.floor(Math.sqrt(n))));
  const gamma = solveGamma(averageDegree, kmin, kmax);
  const pmf = degreePmf(gamma, kmin, kmax);
  const cdf: number[] = []; let c = 0;
  for (const p of pmf) { c += p; cdf.push(c); }
  const draw = () => { const u = r(); let i = 0; while (i < cdf.length - 1 && cdf[i] < u) i++; return kmin + i; };
  const outDeg = Array.from({ length: n }, draw);
  const inDeg = shuffle(r, outDeg);
  // configuration model: a pool of stubs weighted by in-degree
  const pool: number[] = [];
  inDeg.forEach((k, i) => { for (let j = 0; j < k; j++) pool.push(i); });
  const stubs = shuffle(r, pool);
  let cursor = 0;
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const want = outDeg[i];
    const mine = new Set<number>();
    let tries = 0;
    while (mine.size < want && tries < want * 4 && stubs.length) {
      const cand = stubs[cursor % stubs.length]; cursor++; tries++;
      if (cand !== i && !mine.has(cand)) mine.add(cand);
    }
    out[i] = [...mine];
  }
  return out;
}
