/* The bank builder's model: seven bank archetypes, the dials a person can
   set in named steps, the six-stat card, the difficulty meter, and an
   estimate of what a configuration yields before it is generated.

   Nothing here changes how the generator works. An archetype is a patch on
   GenConfig; a dial reads and writes one or two GenConfig fields; the
   estimate is a calibrated approximation checked by scripts/smoke-builder.ts
   against real runs. The steps exist because a person reasons in "low,
   typical, high", and the exact value is one disclosure away. */

import type { AmlTypology, CryptoTypology, FraudTypology, GenConfig, TypologyConfig } from "./types";
import { AML_DEFAULTS, CRYPTO_DEFAULTS, DEFAULT_CONFIG, FRAUD_DEFAULTS, cashFactor, fraudFromLegacy, normaliseConfig, normaliseMix } from "./config";
import type { CountryMix, Segment } from "./types";

const t = (per1k: number, min: number, max: number, enabled = true): TypologyConfig => ({ enabled, per1k, minAccounts: min, maxAccounts: max });
const scale = <K extends string>(base: Record<K, TypologyConfig>, f: number, over: Partial<Record<K, number>> = {}): Record<K, TypologyConfig> => {
  const out = {} as Record<K, TypologyConfig>;
  for (const k of Object.keys(base) as K[]) out[k] = { ...base[k], per1k: Math.round(((over[k] ?? base[k].per1k * f)) * 10) / 10 };
  return out;
};

/* ------------------------------------------------------------- archetypes */

export type ArchetypeKey = "highstreet" | "challenger" | "buildingsociety" | "privatebank" | "payments" | "business" | "cryptolinked";
export type Glyph = "branch" | "phone" | "house" | "vault" | "card" | "briefcase" | "coin";

export interface Archetype {
  key: ArchetypeKey;
  label: string;
  line: string;
  glyph: Glyph;
  patch: (c: GenConfig) => GenConfig;
}

const base = (c: GenConfig, name: string, key: ArchetypeKey, patch: Partial<GenConfig>): GenConfig =>
  normaliseConfig({ ...DEFAULT_CONFIG, seed: c.seed, ...patch, name, archetype: key });

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  highstreet: {
    key: "highstreet", label: "High-street bank", glyph: "branch",
    line: "4,000 retail and small-business accounts across four banks. Cash, cards, Faster Payments. The standard bank.",
    patch: (c) => base(c, "UK high-street bank", "highstreet", { aml: { ...AML_DEFAULTS }, fraud: { ...FRAUD_DEFAULTS }, crypto: { ...CRYPTO_DEFAULTS } }),
  },
  challenger: {
    key: "challenger", label: "Challenger bank", glyph: "phone",
    line: "App-only, one bank, young customers. A fifth of accounts open inside the period. More scams, more crypto.",
    patch: (c) => base(c, "Challenger bank", "challenger", {
      banks: 1, newAccountShare: 0.2, cryptoActiveShare: 0.14, segments: { retail: 0.93, sme: 0.07, corporate: 0, private: 0 }, cashShare: 0.03,
      customers: { pepShare: 0.001, nonResidentShare: 0.12, cashBusinessShare: 0.08, digitalShare: 1 },
      geography: { homeMix: { eea: 0.5, other: 0.1, corridor: 0.38, highRisk: 0.02 }, corridorMix: { eea: 0.45, other: 0.15, corridor: 0.37, highRisk: 0.03 } },
      products: { cards: 1, overdrafts: 0.15, cashServices: "partner", international: true },
      aml: scale(AML_DEFAULTS, 1, { passthrough: 3, fan_in: 2.4, structuring: 1, deposit_send: 0.8 }),
      fraud: fraudFromLegacy({ app_scam: 3.5, account_takeover: 2.0, mule_herd: 1.2, card_fraud: 3.0, bust_out: 1.5, invoice_fraud: 0.5 }),
      crypto: scale(CRYPTO_DEFAULTS, 1.3),
    }),
  },
  buildingsociety: {
    key: "buildingsociety", label: "Building society", glyph: "house",
    line: "Savings and mortgages. Older customers, slow money, little cash or cross-border. Crime is rare and looks like a change in behaviour.",
    patch: (c) => base(c, "Building society", "buildingsociety", {
      accounts: 3000, banks: 1, segments: { retail: 0.97, sme: 0.03, corporate: 0, private: 0 }, newAccountShare: 0.04, cryptoActiveShare: 0.02,
      customers: { pepShare: 0.001, nonResidentShare: 0.02, cashBusinessShare: 0.1, digitalShare: 0.3 },
      geography: { homeMix: { eea: 0.7, other: 0.2, corridor: 0.1, highRisk: 0 }, corridorMix: { eea: 0.7, other: 0.25, corridor: 0.05, highRisk: 0 } },
      products: { cards: 0.6, overdrafts: 0.05, cashServices: "branch", international: true },
      activity: 0.7, internationalShare: 0.02, cashShare: 0.06,
      aml: scale(AML_DEFAULTS, 0.6, { single_large: 2.2, behaviour_change: 2.2, structuring: 1.5 }),
      fraud: fraudFromLegacy({ app_scam: 2.5, account_takeover: 1.2, mule_herd: 0.3, card_fraud: 1.5, bust_out: 0.3, invoice_fraud: 0.2 }),
      crypto: scale(CRYPTO_DEFAULTS, 0.4),
    }),
  },
  privatebank: {
    key: "privatebank", label: "Private bank", glyph: "vault",
    line: "1,500 wealthy customers and their companies. Large values, a fifth cross-border, almost no cash. Crime is layered and round-trips.",
    patch: (c) => base(c, "Private bank", "privatebank", {
      accounts: 1500, banks: 1, segments: { retail: 0.1, sme: 0.1, corporate: 0.2, private: 0.6 }, newAccountShare: 0.05, cryptoActiveShare: 0.1,
      customers: { pepShare: 0.03, nonResidentShare: 0.35, cashBusinessShare: 0.02, digitalShare: 0.2 },
      geography: { homeMix: { eea: 0.35, other: 0.35, corridor: 0.2, highRisk: 0.1 }, corridorMix: { eea: 0.35, other: 0.4, corridor: 0.17, highRisk: 0.08 } },
      products: { cards: 0.9, overdrafts: 0.2, cashServices: "none", international: true },
      activity: 1.3, internationalShare: 0.18, cashShare: 0.02,
      aml: scale(AML_DEFAULTS, 0.6, { single_large: 3, cycle: 2.5, behaviour_change: 2.2, stack: 1.5, fan_out: 1.2, structuring: 0.4, smurfing: 0.3 }),
      fraud: fraudFromLegacy({ app_scam: 1.2, account_takeover: 1.0, mule_herd: 0.2, card_fraud: 1.0, bust_out: 0.1, invoice_fraud: 1.5 }),
      crypto: { offramp_layering: t(1.5, 1, 3), travel_rule_structuring: t(1.0, 1, 1), mixer_exposure: t(1.0, 1, 1), sanctioned_counterparty: t(0.8, 1, 1) },
    }),
  },
  payments: {
    key: "payments", label: "Payments firm", glyph: "card",
    line: "6,000 accounts moving money fast. A third opened this quarter, a fifth of payments abroad, no cash. Mules and pass-through.",
    patch: (c) => base(c, "Payments firm", "payments", {
      accounts: 6000, banks: 1, segments: { retail: 0.8, sme: 0.2, corporate: 0, private: 0 }, newAccountShare: 0.3, cryptoActiveShare: 0.12,
      customers: { pepShare: 0.001, nonResidentShare: 0.3, cashBusinessShare: 0.05, digitalShare: 1 },
      geography: { homeMix: { eea: 0.35, other: 0.1, corridor: 0.5, highRisk: 0.05 }, corridorMix: { eea: 0.3, other: 0.1, corridor: 0.55, highRisk: 0.05 } },
      products: { cards: 1, overdrafts: 0, cashServices: "none", international: true },
      activity: 1.8, internationalShare: 0.22, cashShare: 0,
      aml: scale(AML_DEFAULTS, 1, { passthrough: 4, fan_in: 3, fan_out: 3, scatter_gather: 2.5, gather_scatter: 2.5, stack: 2, smurfing: 2, structuring: 0.5, deposit_send: 0.3, single_large: 0.8 }),
      fraud: fraudFromLegacy({ app_scam: 4.0, account_takeover: 2.5, mule_herd: 2.0, card_fraud: 3.5, bust_out: 1.2, invoice_fraud: 1.2 }),
      crypto: { offramp_layering: t(1.5, 1, 3), travel_rule_structuring: t(1.5, 1, 1), mixer_exposure: t(1.0, 1, 1), sanctioned_counterparty: t(0.6, 1, 1) },
    }),
  },
  business: {
    key: "business", label: "Business bank", glyph: "briefcase",
    line: "3,000 accounts, most of them small firms. Cash takings, invoices in, suppliers out. Structuring and turnover above what was declared.",
    patch: (c) => base(c, "Business bank", "business", {
      accounts: 3000, banks: 2, segments: { retail: 0.25, sme: 0.6, corporate: 0.15, private: 0 }, newAccountShare: 0.08, cryptoActiveShare: 0.04,
      customers: { pepShare: 0.001, nonResidentShare: 0.04, cashBusinessShare: 0.28, digitalShare: 0.5 },
      geography: { homeMix: { eea: 0.6, other: 0.2, corridor: 0.18, highRisk: 0.02 }, corridorMix: { eea: 0.55, other: 0.25, corridor: 0.18, highRisk: 0.02 } },
      products: { cards: 0.9, overdrafts: 0.35, cashServices: "branch", international: true },
      activity: 1.2, internationalShare: 0.12, cashShare: 0.15,
      aml: scale(AML_DEFAULTS, 0.8, { structuring: 3, smurfing: 2, deposit_send: 2.5, behaviour_change: 2.5, fan_in: 2.5, cycle: 1.8, single_large: 2, passthrough: 1.5 }),
      fraud: fraudFromLegacy({ app_scam: 2.0, account_takeover: 1.2, mule_herd: 0.8, card_fraud: 1.5, bust_out: 1.0, invoice_fraud: 3.0 }),
      crypto: scale(CRYPTO_DEFAULTS, 0.6),
    }),
  },
  cryptolinked: {
    key: "cryptolinked", label: "Crypto-linked bank", glyph: "coin",
    line: "A third of customers hold a linked wallet. Every crypto pattern is on and doubled: off-ramps, mixers, a listed address.",
    patch: (c) => base(c, "Crypto-linked bank", "cryptolinked", {
      cryptoActiveShare: 0.34, segments: { retail: 0.9, sme: 0.08, corporate: 0, private: 0.02 },
      customers: { pepShare: 0.002, nonResidentShare: 0.15, cashBusinessShare: 0.1, digitalShare: 0.9 },
      products: { cards: 1, overdrafts: 0.2, cashServices: "partner", international: true },
      crypto: { offramp_layering: t(2.0, 1, 3), travel_rule_structuring: t(2.0, 1, 1), mixer_exposure: t(1.5, 1, 1), sanctioned_counterparty: t(0.8, 1, 1) },
    }),
  },
};
export const ARCHETYPE_ORDER: ArchetypeKey[] = ["highstreet", "challenger", "buildingsociety", "privatebank", "payments", "business", "cryptolinked"];

/* ------------------------------------------------------------- dials */

export type DialGroup = "customers" | "products" | "geography" | "transactions" | "crime" | "difficulty";
/* The first five groups are the five factors a business-wide risk assessment covers
   (FCA Financial Crime Guide, FCG 2.2.4): customers, products, countries, transactions, channel.
   Channel sits with the customers, as how they were taken on. */
export const DIAL_GROUPS: { key: DialGroup; label: string; line: string }[] = [
  { key: "customers", label: "Customers", line: "How many accounts, who holds them, where they live, how they were taken on." },
  { key: "products", label: "Products", line: "What the bank offers: cards, overdrafts, cash, payments abroad, linked wallets." },
  { key: "geography", label: "Countries", line: "Where payments abroad go, and where customers living abroad come from." },
  { key: "transactions", label: "Transactions", line: "How much moves, how fast, and how much of it is cash." },
  { key: "crime", label: "Crime", line: "How much of each crime family is planted." },
  { key: "difficulty", label: "Difficulty", line: "How hard the planted crime is to tell from ordinary business." },
];

export interface DialStep { label: string; value: number }
export interface Dial {
  key: string;
  group: DialGroup;
  label: string;
  help: string;
  steps: DialStep[];
  get: (c: GenConfig) => number;
  set: (c: GenConfig, v: number) => GenConfig;
  format: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const int = (v: number) => Math.round(v).toLocaleString("en-GB");

const sumPer1k = (fam: Record<string, TypologyConfig>) => Object.values(fam).reduce((a, x) => a + (x.enabled ? x.per1k : 0), 0);
const famFactor = (cur: Record<string, TypologyConfig>, def: Record<string, TypologyConfig>) => {
  const d = sumPer1k(def);
  return d ? sumPer1k(cur) / d : 1;
};
const setFamily = <K extends string>(cur: Record<K, TypologyConfig>, def: Record<K, TypologyConfig>, f: number): Record<K, TypologyConfig> => {
  // keep the archetype's mix; move the whole family up or down to the factor of the defaults
  const curF = famFactor(cur, def) || 1;
  const out = {} as Record<K, TypologyConfig>;
  for (const k of Object.keys(cur) as K[]) out[k] = { ...cur[k], per1k: Math.round(cur[k].per1k * (f / curF) * 10000) / 10000 };
  return out;
};

/** Set one segment's share; personal customers give or take the difference. */
function setSegment(c: GenConfig, key: Exclude<Segment, "retail">, v: number): GenConfig {
  const others = (["sme", "corporate", "private"] as const).filter((k) => k !== key).reduce((a, k) => a + c.segments[k], 0);
  const value = Math.max(0, Math.min(1 - others, v));
  return { ...c, segments: { ...c.segments, [key]: value, retail: Math.max(0, 1 - value - others) } };
}
/** Set one share of a country mix; the other three scale to fill the rest. */
function setMix(c: GenConfig, which: "homeMix" | "corridorMix", key: keyof CountryMix, v: number): GenConfig {
  const m = c.geography[which];
  const value = Math.max(0, Math.min(1, v));
  const restNow = (["eea", "other", "corridor", "highRisk"] as const).filter((k) => k !== key).reduce((a, k) => a + m[k], 0);
  const scale = restNow > 0 ? (1 - value) / restNow : 0;
  const next = { ...m, [key]: value } as CountryMix;
  for (const k of ["eea", "other", "corridor", "highRisk"] as const) if (k !== key) next[k] = restNow > 0 ? m[k] * scale : (1 - value) / 3;
  return { ...c, geography: { ...c.geography, [which]: normaliseMix(next, m) } };
}

export const DIALS: Dial[] = [
  { key: "accounts", group: "customers", label: "Accounts", help: "How many customers the data set has.", format: int,
    steps: [{ label: "Rehearsal", value: 800 }, { label: "Small", value: 2000 }, { label: "Typical", value: 4000 }, { label: "Large", value: 8000 }, { label: "Largest", value: 12000 }],
    get: (c) => c.accounts, set: (c, v) => ({ ...c, accounts: v }) },
  { key: "days", group: "customers", label: "Days", help: "How many days the data covers. A longer period holds more slow patterns.", format: (v) => `${int(v)} days`,
    steps: [{ label: "One month", value: 30 }, { label: "Two months", value: 60 }, { label: "A quarter", value: 90 }, { label: "Half a year", value: 180 }],
    get: (c) => c.days, set: (c, v) => ({ ...c, days: v }) },
  { key: "sme", group: "customers", label: "Small firms", help: "The share of accounts that are small firms. Personal customers take the rest; corporates and private clients stay as set.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Few", value: 0.05 }, { label: "Typical", value: 0.13 }, { label: "Many", value: 0.3 }, { label: "Business bank", value: 0.6 }],
    get: (c) => c.segments.sme, set: (c, v) => setSegment(c, "sme", v) },
  { key: "private", group: "customers", label: "Private clients", help: "The share of accounts that are wealthy individuals banked as private clients. Larger values, more money abroad, more politically exposed persons.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "A few", value: 0.02 }, { label: "Some", value: 0.1 }, { label: "Private bank", value: 0.6 }],
    get: (c) => c.segments.private, set: (c, v) => setSegment(c, "private", v) },
  { key: "pepShare", group: "customers", label: "Politically exposed", help: "The share of personal customers who are politically exposed persons or their close associates; private clients carry eight times the share. The Money Laundering Regulations ask for enhanced due diligence on them.", format: (v) => `${(100 * v).toFixed(1)}%`,
    steps: [{ label: "None", value: 0 }, { label: "Rare", value: 0.002 }, { label: "Some", value: 0.01 }, { label: "Many", value: 0.03 }],
    get: (c) => c.customers.pepShare, set: (c, v) => ({ ...c, customers: { ...c.customers, pepShare: v } }) },
  { key: "nonResidentShare", group: "customers", label: "Live outside the UK", help: "The share of customers whose home country is outside the UK. Where they live follows the mix under Countries.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Few", value: 0.06 }, { label: "Some", value: 0.15 }, { label: "Many", value: 0.35 }],
    get: (c) => c.customers.nonResidentShare, set: (c, v) => ({ ...c, customers: { ...c.customers, nonResidentShare: v } }) },
  { key: "cashBusinessShare", group: "customers", label: "Cash-based businesses", help: "The share of small firms that take most of their money in cash: shops, restaurants, taxis. They bank their takings most working days, and a cash rule has to live with that.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Few", value: 0.08 }, { label: "Typical", value: 0.18 }, { label: "Many", value: 0.3 }],
    get: (c) => c.customers.cashBusinessShare, set: (c, v) => ({ ...c, customers: { ...c.customers, cashBusinessShare: v } }) },
  { key: "digitalShare", group: "customers", label: "Taken on online", help: "The share of customers taken on online without being met. They sit on the lighter identity-check tiers more often. The rest were met in a branch.", format: pct,
    steps: [{ label: "Few", value: 0.3 }, { label: "Half", value: 0.55 }, { label: "Most", value: 0.9 }, { label: "All", value: 1 }],
    get: (c) => c.customers.digitalShare, set: (c, v) => ({ ...c, customers: { ...c.customers, digitalShare: v } }) },
  { key: "newAccountShare", group: "customers", label: "New customers", help: "The share of accounts that open during the period. Mules are recruited young.", format: pct,
    steps: [{ label: "Almost none", value: 0.02 }, { label: "Typical", value: 0.08 }, { label: "Growing", value: 0.15 }, { label: "Fast growth", value: 0.3 }, { label: "Start-up", value: 0.4 }],
    get: (c) => c.newAccountShare, set: (c, v) => ({ ...c, newAccountShare: v }) },
  { key: "activity", group: "transactions", label: "Activity", help: "How often customers pay and are paid. Doubles the transactions at the top step.", format: (v) => `${v.toFixed(1)}x`,
    steps: [{ label: "Slow", value: 0.6 }, { label: "Typical", value: 1 }, { label: "Busy", value: 1.4 }, { label: "Payments firm", value: 1.8 }],
    get: (c) => c.activity, set: (c, v) => ({ ...c, activity: v }) },
  { key: "cashShare", group: "transactions", label: "Cash", help: "The share of spending done in cash where the bank offers cash at all. Structuring needs cash to structure.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Low", value: 0.03 }, { label: "Typical", value: 0.08 }, { label: "High", value: 0.15 }, { label: "Cash-heavy", value: 0.25 }],
    get: (c) => c.cashShare, set: (c, v) => ({ ...c, cashShare: v }) },
  { key: "cards", group: "products", label: "Cards", help: "The share of customers with a debit or credit card. A customer without one pays shops and bills by bank transfer, and only a card works abroad.", format: pct,
    steps: [{ label: "Few", value: 0.6 }, { label: "Most", value: 0.9 }, { label: "Nearly all", value: 0.97 }, { label: "All", value: 1 }],
    get: (c) => c.products.cards, set: (c, v) => ({ ...c, products: { ...c.products, cards: v } }) },
  { key: "overdrafts", group: "products", label: "Overdrafts", help: "The share of personal customers with an arranged overdraft sized to their income; small firms get one a little more often. A first-party bust-out takes the overdraft with it.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Few", value: 0.15 }, { label: "Typical", value: 0.3 }, { label: "Many", value: 0.5 }],
    get: (c) => c.products.overdrafts, set: (c, v) => ({ ...c, products: { ...c.products, overdrafts: v } }) },
  { key: "cashServices", group: "products", label: "Cash services", help: "Branch counters and ATMs, a partner counter such as the Post Office, or none. Without cash services there are no cash deposits or withdrawals in the data.", format: (v) => v === 0 ? "none" : v < 1 ? "partner counter" : "branches and ATMs",
    steps: [{ label: "None", value: 0 }, { label: "Partner counter", value: 0.35 }, { label: "Branches", value: 1 }],
    get: (c) => cashFactor(c), set: (c, v) => ({ ...c, products: { ...c.products, cashServices: v === 0 ? "none" : v < 1 ? "partner" : "branch" } }) },
  { key: "international", group: "products", label: "Payments abroad", help: "Whether the bank sends money abroad at all. Off, nothing crosses a border except card payments on a trip.", format: (v) => v ? "offered" : "not offered",
    steps: [{ label: "Not offered", value: 0 }, { label: "Offered", value: 1 }],
    get: (c) => c.products.international ? 1 : 0, set: (c, v) => ({ ...c, products: { ...c.products, international: v >= 0.5 } }) },
  { key: "cryptoActiveShare", group: "products", label: "Linked wallets", help: "The share of personal customers with a crypto wallet linked to the account.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Few", value: 0.03 }, { label: "Typical", value: 0.06 }, { label: "Many", value: 0.15 }, { label: "Crypto-linked", value: 0.34 }],
    get: (c) => c.cryptoActiveShare, set: (c, v) => ({ ...c, cryptoActiveShare: v }) },
  { key: "internationalShare", group: "geography", label: "Share of payments abroad", help: "The share of ordinary payments that cross a border, where the bank sends money abroad at all.", format: pct,
    steps: [{ label: "Domestic", value: 0.01 }, { label: "Typical", value: 0.05 }, { label: "Open", value: 0.12 }, { label: "International", value: 0.22 }, { label: "Remittance", value: 0.3 }],
    get: (c) => c.internationalShare, set: (c, v) => ({ ...c, internationalShare: v }) },
  { key: "corridorCorridor", group: "geography", label: "To remittance corridors", help: "Of the payments abroad, the share that goes to the UK's remittance corridors: India, Pakistan, Nigeria and their like. Not on the FATF lists, but a higher risk reading. The rest goes to the European Economic Area and other lower-risk countries.", format: pct,
    steps: [{ label: "Few", value: 0.1 }, { label: "Typical", value: 0.27 }, { label: "Many", value: 0.55 }],
    get: (c) => c.geography.corridorMix.corridor, set: (c, v) => setMix(c, "corridorMix", "corridor", v) },
  { key: "corridorHigh", group: "geography", label: "To FATF-listed countries", help: "Of the payments abroad, the share that goes to a country on the FATF lists. Since 30 June 2026 the Money Laundering Regulations require enhanced due diligence for a country on the call-for-action list; a country under increased monitoring is a risk factor to weigh.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Rare", value: 0.01 }, { label: "Some", value: 0.03 }, { label: "Many", value: 0.08 }],
    get: (c) => c.geography.corridorMix.highRisk, set: (c, v) => setMix(c, "corridorMix", "highRisk", v) },
  { key: "homeHigh", group: "geography", label: "Customers from FATF-listed countries", help: "Of the customers who live outside the UK, the share whose home country is on the FATF lists.", format: pct,
    steps: [{ label: "None", value: 0 }, { label: "Rare", value: 0.02 }, { label: "Some", value: 0.1 }],
    get: (c) => c.geography.homeMix.highRisk, set: (c, v) => setMix(c, "homeMix", "highRisk", v) },
  { key: "banks", group: "geography", label: "Banks in the data", help: "How many banks the accounts sit with. One bank means every transfer is on-us or leaves the data set.", format: (v) => `${int(v)} ${v === 1 ? "bank" : "banks"}`,
    steps: [{ label: "One", value: 1 }, { label: "Two", value: 2 }, { label: "Four", value: 4 }, { label: "Six", value: 6 }],
    get: (c) => c.banks, set: (c, v) => ({ ...c, banks: v }) },
  { key: "amlPressure", group: "crime", label: "Money laundering", help: "How much laundering is planted, against the high-street bank. The mix of patterns stays as the bank type set it.", format: (v) => `${v.toFixed(1)}x`,
    steps: [{ label: "Off", value: 0 }, { label: "Rare", value: 0.5 }, { label: "Typical", value: 1 }, { label: "Heavy", value: 1.6 }, { label: "Laundromat", value: 2.5 }],
    get: (c) => famFactor(c.aml, AML_DEFAULTS), set: (c, v) => ({ ...c, aml: setFamily(c.aml, AML_DEFAULTS, v) }) },
  { key: "fraudPressure", group: "crime", label: "Fraud", help: "How many scams, takeovers, mule herds, card frauds, bust-outs and invoice frauds are planted.", format: (v) => `${v.toFixed(1)}x`,
    steps: [{ label: "Off", value: 0 }, { label: "Rare", value: 0.5 }, { label: "Typical", value: 1 }, { label: "Heavy", value: 1.6 }, { label: "Under attack", value: 2.5 }],
    get: (c) => famFactor(c.fraud, FRAUD_DEFAULTS), set: (c, v) => ({ ...c, fraud: setFamily(c.fraud, FRAUD_DEFAULTS, v) }) },
  { key: "cryptoPressure", group: "crime", label: "Crypto crime", help: "How much crypto misuse is planted on the linked wallets.", format: (v) => `${v.toFixed(1)}x`,
    steps: [{ label: "Off", value: 0 }, { label: "Rare", value: 0.5 }, { label: "Typical", value: 1 }, { label: "Heavy", value: 1.6 }, { label: "Exchange", value: 2.5 }],
    get: (c) => famFactor(c.crypto, CRYPTO_DEFAULTS), set: (c, v) => ({ ...c, crypto: setFamily(c.crypto, CRYPTO_DEFAULTS, v) }) },
];

/** The index of the step nearest the dial's current value. */
export function nearestStep(d: Dial, c: GenConfig): number {
  const v = d.get(c);
  let best = 0, bd = Infinity;
  d.steps.forEach((s, i) => { const dd = Math.abs(s.value - v); if (dd < bd) { bd = dd; best = i; } });
  return best;
}
/** Whether the current value sits exactly on a step. */
export function onStep(d: Dial, c: GenConfig): boolean {
  const v = d.get(c);
  // a family dial reads back through many small rates, each rounded, so a step is met within half a per cent of its value
  return d.steps.some((s) => Math.abs(s.value - v) <= Math.max(1e-6, 0.005 * Math.abs(s.value)));
}

/* ------------------------------------------------------------- difficulty */

export interface Difficulty { key: string; label: string; line: string; patch: Partial<GenConfig> }
export const DIFFICULTY: Difficulty[] = [
  { key: "easy", label: "Easy", line: "Laundering runs large, fast and central. Most rules should catch most of it.", patch: { amountOverlap: 0.3, burstinessBias: 3, durationMean: 12, durationSd: 5, marginRatio: 0.05, multiPatternShare: 0.15, centralityBias: 0.7 } },
  { key: "normal", label: "Normal", line: "The standard setting. Amounts half overlap ordinary amounts; patterns run about three weeks.", patch: { amountOverlap: 0.55, burstinessBias: 1.5, durationMean: 20, durationSd: 8, marginRatio: 0.08, multiPatternShare: 0.25, centralityBias: 0.5 } },
  { key: "hard", label: "Hard", line: "Amounts mostly overlap, patterns spread over a month, fees skimmed at each layer.", patch: { amountOverlap: 0.8, burstinessBias: 0, durationMean: 32, durationSd: 10, marginRatio: 0.1, multiPatternShare: 0.35, centralityBias: 0.3 } },
  { key: "brutal", label: "Brutal", line: "AMLGentex's hard setting. Laundering looks like ordinary business and takes six weeks.", patch: { amountOverlap: 1, burstinessBias: -1, durationMean: 45, durationSd: 12, marginRatio: 0.1, multiPatternShare: 0.4, centralityBias: 0.2 } },
];
export function difficultyIndex(c: GenConfig): number {
  let best = 0, bd = Infinity;
  DIFFICULTY.forEach((d, i) => {
    const dd = Math.abs((d.patch.amountOverlap ?? 0) - c.amountOverlap) * 2 + Math.abs((d.patch.burstinessBias ?? 0) - c.burstinessBias) / 4 + Math.abs((d.patch.durationMean ?? 0) - c.durationMean) / 40;
    if (dd < bd) { bd = dd; best = i; }
  });
  return best;
}
export function difficultyExact(c: GenConfig): boolean {
  const d = DIFFICULTY[difficultyIndex(c)].patch;
  return Object.entries(d).every(([k, v]) => Math.abs((c as unknown as Record<string, number>)[k] - (v as number)) < 1e-6);
}

/* ------------------------------------------------------------- the stat card */

export interface Stats { size: number; speed: number; cash: number; crossBorder: number; crypto: number; newCustomers: number }
export const STAT_LABELS: Record<keyof Stats, string> = { size: "Size", speed: "Speed", cash: "Cash", crossBorder: "Cross-border", crypto: "Crypto", newCustomers: "New customers" };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export function stats(c: GenConfig): Stats {
  return {
    size: clamp01((Math.log(c.accounts) - Math.log(200)) / (Math.log(12000) - Math.log(200))),
    speed: clamp01((c.activity - 0.4) / 1.6),
    cash: clamp01(c.cashShare / 0.3),
    crossBorder: clamp01(c.internationalShare / 0.3),
    crypto: clamp01(c.cryptoActiveShare / 0.4),
    newCustomers: clamp01(c.newAccountShare / 0.4),
  };
}

/* ------------------------------------------------------------- the estimate */

export interface Estimate { accounts: number; txs: number; patterns: number; laundering: number; fraud: number; baseRate: number; seconds: number }

const mean = (x: TypologyConfig) => (x.minAccounts + x.maxAccounts) / 2;
/** What a configuration yields, without generating it. Calibrated on the default
    data set (4,000 accounts, 90 days: 231,824 transactions, 123 patterns, 454
    laundering accounts, 119 fraud accounts) and checked by smoke-builder.ts. */
export function estimate(c: GenConfig): Estimate {
  const n = c.accounts, d = c.days;
  const per1k = (fam: Record<string, TypologyConfig>) => Object.values(fam).reduce((a, x) => a + (x.enabled ? x.per1k : 0), 0);
  // a scam or a takeover paid to mules at this bank plants a second pattern, the mule accounts: half the cases, less those paid through an exchange
  const VIA_EXCHANGE: Record<string, number> = { scam_investment: 0.5, scam_romance: 0.1, scam_impersonation_bank: 0.1 };
  const muleSides = Object.entries(c.fraud).reduce((a, [k, x]) => a + (x.enabled && (k.startsWith("scam_") || k.startsWith("ato_")) ? x.per1k * 0.5 * (1 - (VIA_EXCHANGE[k] ?? 0)) : 0), 0);
  const patterns = Math.round((per1k(c.aml) + per1k(c.fraud) + per1k(c.crypto) + muleSides) * n / 1000);
  const amlAccounts = Object.values(c.aml).reduce((a, x) => a + (x.enabled ? x.per1k * mean(x) : 0), 0) * n / 1000;
  const cryptoAccounts = Object.values(c.crypto).reduce((a, x) => a + (x.enabled ? x.per1k * mean(x) : 0), 0) * n / 1000;
  // a scam or a takeover pulls in a victim beyond its mules (the 1.5); card fraud and a bust-out are one account each
  const fraudAccounts = Object.entries(c.fraud).reduce((a, [k, x]) => a + (x.enabled ? x.per1k * mean(x) * (k.startsWith("card_") || k === "bust_out" ? 1 : 1.5) : 0), 0) * n / 1000;
  const laundering = Math.round((amlAccounts + cryptoAccounts) * 1.1 * (1 - 0.1 * c.multiPatternShare));
  const fraud = Math.round(fraudAccounts);
  // ordinary life: legs per account per day at activity 1 by segment (a retail customer
  // about 0.55, a small firm 0.8, a corporate 2.1), scaled by activity, plus the planted legs
  const perDay = c.segments.retail * 0.55 + c.segments.sme * 0.8 + c.segments.corporate * 2.1 + (c.segments.private ?? 0) * 0.75
    + c.segments.sme * c.customers.cashBusinessShare * 0.5 * cashFactor(c);
  // the activity dial: measured on 6 September 2026, transactions scale as (1 + 5a) / 6 (a = 0.6 gives 0.67x, a = 1.8 gives 1.67x)
  const ordinary = n * d * perDay * ((1 + 5 * c.activity) / 6) * (1 + 0.3 * c.cryptoActiveShare);
  const planted = patterns * 36;
  const txs = Math.round(ordinary + planted);
  // seconds: the whole wait as a reader sees it in the browser (the generator in its worker, the copy to the page, and the indexing for the rules), measured 6 September 2026 at four sizes: 1.5 s for 240k, 4.3 s for 720k, 8.0 s for 1.4M, 12 s for 2.4M transactions
  return { accounts: n, txs, patterns, laundering, fraud, baseRate: Math.min(1, (laundering + fraud * 0.6) / Math.max(1, n)), seconds: Math.round((0.3 + txs / 170000) * 10) / 10 };
}

/* ------------------------------------------------------------- save and share */

export interface SavedBank { name: string; config: GenConfig; savedAt: string }
const BANKS_KEY = "touchstone-banks-v1";
export function loadSavedBanks(): SavedBank[] {
  try { const raw = localStorage.getItem(BANKS_KEY); if (raw) { const j = JSON.parse(raw); if (Array.isArray(j)) return j.filter((b) => b && typeof b.name === "string" && b.config).map((b) => ({ ...b, config: normaliseConfig({ ...DEFAULT_CONFIG, ...b.config }) })); } } catch { /* fresh */ }
  return [];
}
export function storeSavedBanks(list: SavedBank[]) {
  try { localStorage.setItem(BANKS_KEY, JSON.stringify(list.slice(0, 12))); } catch { /* ignore */ }
}

/** The configuration as a link: JSON, base64url, in the hash query. */
export function encodeBank(c: GenConfig): string {
  const json = JSON.stringify(c);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeBank(s: string): GenConfig | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(b64)));
    const c = JSON.parse(json);
    if (!c || typeof c !== "object" || typeof c.accounts !== "number") return null;
    return normaliseConfig({ ...DEFAULT_CONFIG, ...c, aml: { ...DEFAULT_CONFIG.aml, ...(c.aml ?? {}) }, fraud: { ...DEFAULT_CONFIG.fraud, ...(c.fraud ?? {}) }, crypto: { ...DEFAULT_CONFIG.crypto, ...(c.crypto ?? {}) } });
  } catch { return null; }
}

export type { AmlTypology, CryptoTypology, FraudTypology };
