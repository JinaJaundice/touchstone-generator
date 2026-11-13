/* Set the dials from a bank's own figures.

   The first task when a bank sets up its own twin: the totals and
   shares a business-wide risk assessment already holds, or a warehouse gives
   in one query, become the settings of the twin. No customer record is
   involved; every figure here is a count, a share or a yes-or-no about the
   bank as a whole.

   A share may be written as a fraction (0.3) or a percentage (30). Every
   figure the file carries is reported as applied, with the dial it set and
   the value; anything the file carries that has no dial is reported as
   ignored, so nothing is silently dropped. */

import { normaliseConfig } from "./config";
import { ARCHETYPES, type ArchetypeKey } from "./archetypes";
import type { CountryMix, GenConfig, Segment } from "./types";

export const FIGURES_FORMAT = "touchstone-figures/1";

export interface BankFigures {
  format?: string;
  name?: string;
  /** start from one of the seven bank types before the figures are applied */
  bankType?: ArchetypeKey;
  accounts?: number;
  days?: number;
  banksInTheData?: number;
  /** accounts by segment, as counts or shares; personal takes whatever is left when a segment is missing */
  segments?: Partial<Record<Segment, number>>;
  takenOnOnline?: number;
  livingOutsideTheUk?: number;
  livingOutsideTheUkFromFatfListed?: number;
  politicallyExposed?: number;
  cashBasedFirms?: number;
  newAccountsInThePeriod?: number;
  withACard?: number;
  withAnOverdraft?: number;
  cashServices?: "branch" | "partner" | "none";
  paymentsAbroadOffered?: boolean;
  withALinkedWallet?: number;
  paymentsThatCrossABorder?: number;
  abroadToRemittanceCorridors?: number;
  abroadToFatfListed?: number;
  transactionsPerAccountPerDay?: number;
  spendingInCash?: number;
  /** anything else the file carries is reported as ignored */
  [other: string]: unknown;
}

export interface Applied { figure: string; dial: string; value: string }
export interface Calibration { config: GenConfig; applied: Applied[]; ignored: string[]; notes: string[] }

/** legs per account-day by segment at activity 1, the figures the builder's estimate uses (measured, see make-timing.mjs) */
const LEGS: Record<Segment, number> = { retail: 0.55, sme: 0.8, corporate: 2.1, private: 0.75 };
const KNOWN = new Set(["format", "name", "bankType", "accounts", "days", "banksInTheData", "segments", "takenOnOnline", "livingOutsideTheUk", "livingOutsideTheUkFromFatfListed", "politicallyExposed", "cashBasedFirms", "newAccountsInThePeriod", "withACard", "withAnOverdraft", "cashServices", "paymentsAbroadOffered", "withALinkedWallet", "paymentsThatCrossABorder", "abroadToRemittanceCorridors", "abroadToFatfListed", "transactionsPerAccountPerDay", "spendingInCash"]);

/** a share written as 0.3 or as 30 */
const share = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 1 ? Math.min(1, n / 100) : n;
};
const pct = (x: number) => `${(100 * x).toFixed(x < 0.1 ? 1 : 0)}%`;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** move one pool of a country mix to a value and scale the others to fill the rest */
function withPool(mix: CountryMix, pool: keyof CountryMix, value: number): CountryMix {
  const rest = (Object.keys(mix) as (keyof CountryMix)[]).filter((k) => k !== pool);
  const restSum = rest.reduce((s, k) => s + mix[k], 0) || 1;
  const out = { ...mix, [pool]: value } as CountryMix;
  for (const k of rest) out[k] = mix[k] / restSum * (1 - value);
  return out;
}

export function calibrate(fig: BankFigures, base: GenConfig): Calibration {
  const applied: Applied[] = [], ignored: string[] = [], notes: string[] = [];
  let c: GenConfig = { ...base };
  if (fig.bankType && ARCHETYPES[fig.bankType]) { c = ARCHETYPES[fig.bankType].patch(c); applied.push({ figure: "bankType", dial: "bank type", value: ARCHETYPES[fig.bankType].label }); }
  else if (fig.bankType) ignored.push(`bankType "${String(fig.bankType)}" must be one of the seven bank types`);
  if (typeof fig.name === "string" && fig.name.trim()) { c = { ...c, name: fig.name.trim() }; applied.push({ figure: "name", dial: "name", value: c.name }); }

  const count = (key: "accounts" | "days" | "banksInTheData", dial: "accounts" | "days" | "banks", lo: number, hi: number) => {
    if (fig[key] === undefined) return;
    const n = Number(fig[key]);
    if (!Number.isFinite(n)) { ignored.push(`${key} must be a number`); return; }
    const v = Math.round(clamp(n, lo, hi));
    if (v !== n) notes.push(`${key} ${n} is outside what the dials allow; set to ${v}.`);
    c = { ...c, [dial]: v };
    applied.push({ figure: key, dial, value: String(v) });
  };
  count("accounts", "accounts", 500, 12000);
  count("days", "days", 30, 180);
  count("banksInTheData", "banks", 1, 12);

  if (fig.segments && typeof fig.segments === "object") {
    // counts or shares; a segment left out is zero, and personal takes whatever the others leave
    const given: Partial<Record<Segment, number>> = {};
    for (const k of ["retail", "sme", "corporate", "private"] as Segment[]) { const v = Number(fig.segments[k]); if (fig.segments[k] !== undefined && Number.isFinite(v) && v >= 0) given[k] = v; }
    const total = Object.values(given).reduce((s, v) => s + v, 0);
    if (total > 0) {
      const asShare = total > 1.0001 ? (v: number) => v / total : (v: number) => v;
      const seg: Record<Segment, number> = { retail: 0, sme: 0, corporate: 0, private: 0 };
      for (const k of ["sme", "corporate", "private"] as Segment[]) seg[k] = given[k] !== undefined ? asShare(given[k]!) : 0;
      const others = seg.sme + seg.corporate + seg.private;
      seg.retail = given.retail !== undefined ? asShare(given.retail) : Math.max(0, 1 - others);
      const sum = seg.retail + others || 1;
      for (const k of Object.keys(seg) as Segment[]) seg[k] = seg[k] / sum;
      c = { ...c, segments: seg };
      applied.push({ figure: "segments", dial: "small firms, corporates, private clients", value: `${pct(seg.retail)} personal, ${pct(seg.sme)} small firms, ${pct(seg.corporate)} corporate, ${pct(seg.private)} private` });
    } else ignored.push("segments carries no usable number");
  }

  const shareDial = (key: keyof BankFigures & string, dial: string, set: (v: number) => void) => {
    if (fig[key] === undefined) return;
    const v = share(fig[key]);
    if (v === null) { ignored.push(`${key} must be a share`); return; }
    set(v);
    applied.push({ figure: key, dial, value: pct(v) });
  };
  shareDial("takenOnOnline", "taken on online", (v) => { c = { ...c, customers: { ...c.customers, digitalShare: v } }; });
  shareDial("livingOutsideTheUk", "live outside the UK", (v) => { c = { ...c, customers: { ...c.customers, nonResidentShare: v } }; });
  shareDial("livingOutsideTheUkFromFatfListed", "customers from FATF-listed countries", (v) => { c = { ...c, geography: { ...c.geography, homeMix: withPool(c.geography.homeMix, "highRisk", v) } }; });
  shareDial("politicallyExposed", "politically exposed", (v) => { c = { ...c, customers: { ...c.customers, pepShare: v } }; });
  shareDial("cashBasedFirms", "cash-based businesses", (v) => { c = { ...c, customers: { ...c.customers, cashBusinessShare: v } }; });
  shareDial("newAccountsInThePeriod", "new customers", (v) => { c = { ...c, newAccountShare: v }; });
  shareDial("withACard", "cards", (v) => { c = { ...c, products: { ...c.products, cards: v } }; });
  shareDial("withAnOverdraft", "overdrafts", (v) => { c = { ...c, products: { ...c.products, overdrafts: v } }; });
  shareDial("withALinkedWallet", "linked wallets", (v) => { c = { ...c, cryptoActiveShare: v }; });
  shareDial("paymentsThatCrossABorder", "share of payments abroad", (v) => { c = { ...c, internationalShare: v }; });
  shareDial("abroadToRemittanceCorridors", "to remittance corridors", (v) => { c = { ...c, geography: { ...c.geography, corridorMix: withPool(c.geography.corridorMix, "corridor", v) } }; });
  shareDial("abroadToFatfListed", "to FATF-listed countries", (v) => { c = { ...c, geography: { ...c.geography, corridorMix: withPool(c.geography.corridorMix, "highRisk", v) } }; });
  shareDial("spendingInCash", "cash", (v) => { c = { ...c, cashShare: v }; });

  if (fig.cashServices !== undefined) {
    const v = String(fig.cashServices).toLowerCase();
    if (v === "branch" || v === "partner" || v === "none") { c = { ...c, products: { ...c.products, cashServices: v } }; applied.push({ figure: "cashServices", dial: "cash services", value: v === "branch" ? "branches and ATMs" : v === "partner" ? "partner counter" : "none" }); }
    else ignored.push(`cashServices must be branch, partner or none`);
  }
  if (fig.paymentsAbroadOffered !== undefined) {
    const v = fig.paymentsAbroadOffered === true || String(fig.paymentsAbroadOffered).toLowerCase() === "yes" || String(fig.paymentsAbroadOffered).toLowerCase() === "true";
    c = { ...c, products: { ...c.products, international: v } };
    applied.push({ figure: "paymentsAbroadOffered", dial: "payments abroad", value: v ? "offered" : "not offered" });
  }
  if (fig.transactionsPerAccountPerDay !== undefined) {
    const n = Number(fig.transactionsPerAccountPerDay);
    if (!Number.isFinite(n) || n <= 0) ignored.push("transactionsPerAccountPerDay must be a number above zero");
    else {
      // the builder's estimate: legs per account-day at activity 1 by segment mix, times (1 + 5a) / 6
      const seg = c.segments;
      const atOne = (["retail", "sme", "corporate", "private"] as Segment[]).reduce((s, k) => s + seg[k] * LEGS[k], 0);
      const a = clamp((6 * n / atOne - 1) / 5, 0.5, 2);
      c = { ...c, activity: Number(a.toFixed(2)) };
      applied.push({ figure: "transactionsPerAccountPerDay", dial: "activity", value: `${c.activity.toFixed(2)}x` });
      if (Math.abs(a - (6 * n / atOne - 1) / 5) > 1e-9) notes.push(`transactionsPerAccountPerDay ${n} is outside the activity dial's range; set to ${c.activity.toFixed(2)}x.`);
    }
  }
  for (const k of Object.keys(fig)) if (!KNOWN.has(k)) ignored.push(`"${k}" has no dial`);
  notes.push("The spread of amounts has no dial. Compare the twin's amount spread in the summary with the bank's and record the gap in the report.");
  return { config: normaliseConfig(c), applied, ignored, notes };
}

/** A file to fill in: every figure, with the default bank's value and a line on where the number comes from. */
export function figuresTemplate(base: GenConfig): string {
  const t = {
    format: FIGURES_FORMAT,
    _help: "Fill in the figures a business-wide risk assessment holds. A share may be written as 0.3 or as 30. Delete any line you do not have; it keeps the bank type's value. Segments may be counts or shares; a segment you leave out is zero and personal takes the rest. Shares are of accounts unless the name says otherwise.",
    name: "Our retail bank, calibrated",
    bankType: "highstreet",
    accounts: base.accounts,
    days: base.days,
    banksInTheData: base.banks,
    segments: { retail: base.segments.retail, sme: base.segments.sme, corporate: base.segments.corporate, private: base.segments.private },
    takenOnOnline: base.customers.digitalShare,
    livingOutsideTheUk: base.customers.nonResidentShare,
    livingOutsideTheUkFromFatfListed: base.geography.homeMix.highRisk,
    politicallyExposed: base.customers.pepShare,
    cashBasedFirms: base.customers.cashBusinessShare,
    newAccountsInThePeriod: base.newAccountShare,
    withACard: base.products.cards,
    withAnOverdraft: base.products.overdrafts,
    cashServices: base.products.cashServices,
    paymentsAbroadOffered: base.products.international,
    withALinkedWallet: base.cryptoActiveShare,
    paymentsThatCrossABorder: base.internationalShare,
    abroadToRemittanceCorridors: base.geography.corridorMix.corridor,
    abroadToFatfListed: base.geography.corridorMix.highRisk,
    transactionsPerAccountPerDay: 0.6,
    spendingInCash: base.cashShare,
    _sources: {
      segments: "customer master, accounts by segment", takenOnOnline: "onboarding channel field", livingOutsideTheUk: "address country",
      livingOutsideTheUkFromFatfListed: "address country against the FATF lists", politicallyExposed: "PEP flag, share of personal and private customers",
      cashBasedFirms: "SIC code or the bank's cash-intensive flag, share of small firms", newAccountsInThePeriod: "open date", withACard: "product holdings",
      withAnOverdraft: "product holdings, share of personal customers", cashServices: "branch, partner or none", paymentsAbroadOffered: "product set",
      withALinkedWallet: "payment counterparties, share of personal customers", paymentsThatCrossABorder: "payments warehouse, by beneficiary country",
      abroadToRemittanceCorridors: "of the payments abroad", abroadToFatfListed: "of the payments abroad", transactionsPerAccountPerDay: "payments warehouse, all debits and credits",
      spendingInCash: "cash withdrawals and deposits against total debits",
    },
  };
  return JSON.stringify(t, null, 2) + "\n";
}

export function readFigures(text: string): { ok: true; figures: BankFigures } | { ok: false; error: string } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, error: "The text could not be read as a JSON file. Download the template and fill it in." }; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, error: "The file must be one object of figures. Download the template to see the shape." };
  const f = j as Record<string, unknown>;
  const figures: BankFigures = {};
  for (const [k, v] of Object.entries(f)) if (!k.startsWith("_")) figures[k] = v;
  return { ok: true, figures };
}
