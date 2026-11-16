import type { GenConfig, AmlTypology, FraudTypology, CryptoTypology, LibrarySetting, TypologyConfig, CountryMix } from "./types";
import labelsFile from "./patterns/labels.json";

/* The defaults are a UK retail and small-business book. Counts are per
   1,000 accounts so a 500-account rehearsal and a 10,000-account run carry
   the same mix. The AML rates sit near AMLGentex's template (seven pattern
   types, ten instances each, on 10,000 accounts) scaled up so a 3,000
   account run still holds enough instances per typology to measure recall. */

const t = (per1k: number, min: number, max: number, enabled = true): TypologyConfig =>
  ({ enabled, per1k, minAccounts: min, maxAccounts: max });

export const AML_DEFAULTS: Record<AmlTypology, TypologyConfig> = {
  fan_in: t(1.8, 4, 12),
  fan_out: t(1.8, 4, 12),
  cycle: t(1.5, 3, 8),
  bipartite: t(1.2, 4, 10),
  stack: t(1.2, 5, 12),
  random: t(0.8, 4, 9),
  scatter_gather: t(1.2, 5, 12),
  gather_scatter: t(1.2, 5, 12),
  structuring: t(2.2, 1, 1),
  smurfing: t(1.2, 5, 14),
  deposit_send: t(1.8, 1, 2),
  behaviour_change: t(1.8, 1, 1),
  single_large: t(1.5, 1, 1),
  passthrough: t(2.2, 2, 3),
  cash_out: t(1.0, 1, 3),
  over_invoicing: t(0.6, 1, 1),
  dormant_reactivation: t(0.6, 1, 1),
};

/* The fraud mix. UK Finance's case counts (register S01) are dominated by
   purchase scams and card-not-present fraud; planting at those shares would
   leave most types with no case at all on a 4,000-account bank, so the rarer
   types are planted more often than they occur, enough to be measured, and
   the method says so. Sizes, payments per case and timing follow the UK
   figures type by type (sources.json app2024, card2024, remoteBanking2024). */
export const FRAUD_DEFAULTS: Record<FraudTypology, TypologyConfig> = {
  scam_purchase: t(1.2, 1, 2),
  scam_investment: t(0.5, 1, 2),
  scam_romance: t(0.3, 1, 2),
  scam_advance_fee: t(0.35, 1, 2),
  scam_invoice: t(0.4, 1, 2),
  scam_ceo: t(0.2, 1, 2),
  scam_impersonation_bank: t(0.4, 1, 2),
  scam_impersonation_other: t(0.4, 1, 2),
  ato_credentials: t(0.6, 1, 2),
  ato_sim_swap: t(0.35, 1, 2),
  ato_remote_access: t(0.35, 1, 2),
  card_remote: t(1.5, 1, 1),
  card_lost_stolen: t(0.7, 1, 1),
  card_counterfeit: t(0.3, 1, 1),
  bust_out: t(0.8, 1, 1),
  mule_herd: t(0.8, 5, 12),
};

/** A fraud dial from the older five-shape settings (push-payment scams, takeovers, mule networks, card fraud, bust-outs, invoice fraud), split into the sub-types at the default mix. Saved banks and links written before 23 September 2026 open through it. */
export function fraudFromLegacy(o: { app_scam?: number; account_takeover?: number; mule_herd?: number; card_fraud?: number; bust_out?: number; invoice_fraud?: number }): Record<FraudTypology, TypologyConfig> {
  const D = FRAUD_DEFAULTS;
  const scams = ["scam_purchase", "scam_investment", "scam_romance", "scam_advance_fee", "scam_impersonation_bank", "scam_impersonation_other"] as const;
  const scamSum = scams.reduce((a, k) => a + D[k].per1k, 0);
  const atos = ["ato_credentials", "ato_sim_swap", "ato_remote_access"] as const;
  const atoSum = atos.reduce((a, k) => a + D[k].per1k, 0);
  const cards = ["card_remote", "card_lost_stolen", "card_counterfeit"] as const;
  const cardSum = cards.reduce((a, k) => a + D[k].per1k, 0);
  const out = { ...D } as Record<FraudTypology, TypologyConfig>;
  const r1 = (x: number) => Math.round(x * 100) / 100;
  if (o.app_scam !== undefined) for (const k of scams) out[k] = { ...D[k], per1k: r1(o.app_scam * D[k].per1k / scamSum * 1.1) };
  if (o.account_takeover !== undefined) for (const k of atos) out[k] = { ...D[k], per1k: r1(o.account_takeover * D[k].per1k / atoSum) };
  if (o.card_fraud !== undefined) for (const k of cards) out[k] = { ...D[k], per1k: r1(o.card_fraud * D[k].per1k / cardSum) };
  if (o.invoice_fraud !== undefined) { out.scam_invoice = { ...D.scam_invoice, per1k: r1(o.invoice_fraud * 0.7) }; out.scam_ceo = { ...D.scam_ceo, per1k: r1(o.invoice_fraud * 0.3) }; }
  if (o.mule_herd !== undefined) out.mule_herd = { ...D.mule_herd, per1k: o.mule_herd };
  if (o.bust_out !== undefined) out.bust_out = { ...D.bust_out, per1k: o.bust_out };
  return out;
}

export const CRYPTO_DEFAULTS: Record<CryptoTypology, TypologyConfig> = {
  offramp_layering: t(1.2, 1, 3),
  travel_rule_structuring: t(1.2, 1, 1),
  mixer_exposure: t(0.9, 1, 1),
  sanctioned_counterparty: t(0.5, 1, 1),
};

export const DEFAULT_CONFIG: GenConfig = {
  seed: 20260904,
  name: "UK retail and small business bank",
  accounts: 4000,
  days: 90,
  banks: 4,
  segments: { retail: 0.82, sme: 0.13, corporate: 0.03, private: 0.02 },
  newAccountShare: 0.08,
  cryptoActiveShare: 0.06,
  // a UK high-street book: one customer in 500 is politically exposed, six in a hundred live abroad,
  // about one small firm in six takes its money in cash (shops, hospitality, taxis), just over half open online
  customers: { pepShare: 0.002, nonResidentShare: 0.06, cashBusinessShare: 0.18, digitalShare: 0.55 },
  // non-UK homes are mostly the EEA and the UK's remittance corridors; payments abroad go the same way, a few per cent to FATF-listed countries
  geography: { homeMix: { eea: 0.55, other: 0.15, corridor: 0.28, highRisk: 0.02 }, corridorMix: { eea: 0.5, other: 0.2, corridor: 0.27, highRisk: 0.03 } },
  products: { cards: 0.97, overdrafts: 0.3, cashServices: "branch", international: true },
  activity: 1,
  normalPer1k: { single: 260, fan_in: 90, fan_out: 110, forward: 80, mutual: 120, periodical: 160 },
  internationalShare: 0.05,
  cashShare: 0.08,
  amountOverlap: 0.55,
  burstinessBias: 1.5,
  durationMean: 20,
  durationSd: 8,
  marginRatio: 0.08,
  multiPatternShare: 0.25,
  centralityBias: 0.5,
  visiblePlacement: true,
  ridesExistingLinks: false,
  period: 1,
  cashThreshold: 10000,
  travelRuleThreshold: 800,
  aml: AML_DEFAULTS,
  fraud: FRAUD_DEFAULTS,
  crypto: CRYPTO_DEFAULTS,
};

export type PresetKey = "retail" | "challenger" | "crypto" | "difficult" | "rehearsal";

export const PRESETS: Record<PresetKey, { label: string; note: string; patch: (c: GenConfig) => GenConfig }> = {
  retail: {
    label: "UK retail bank",
    note: "4,000 accounts, 90 days, the standard mix. Laundering amounts half overlap ordinary amounts.",
    patch: (c) => ({ ...c, ...DEFAULT_CONFIG, seed: c.seed, aml: { ...AML_DEFAULTS }, fraud: { ...FRAUD_DEFAULTS }, crypto: { ...CRYPTO_DEFAULTS } }),
  },
  challenger: {
    label: "Challenger bank",
    note: "Younger customers: 20% of accounts open during the run, more fraud, more crypto, one bank.",
    patch: (c) => ({
      ...c, name: "Challenger bank", banks: 1, newAccountShare: 0.2, cryptoActiveShare: 0.14,
      segments: { retail: 0.93, sme: 0.07, corporate: 0, private: 0 },
      fraud: fraudFromLegacy({ app_scam: 3.5, account_takeover: 2.0, mule_herd: 1.2, card_fraud: 3.0, bust_out: 1.5, invoice_fraud: 0.5 }),
    }),
  },
  crypto: {
    label: "Crypto-heavy bank",
    note: "A third of customers hold a linked wallet; every crypto pattern is on and doubled.",
    patch: (c) => ({
      ...c, name: "Crypto-heavy bank", cryptoActiveShare: 0.34,
      crypto: { offramp_layering: t(2.0, 1, 3), travel_rule_structuring: t(2.0, 1, 1), mixer_exposure: t(1.5, 1, 1), sanctioned_counterparty: t(0.8, 1, 1) },
    }),
  },
  difficult: {
    label: "Difficult (AMLGentex hard setting)",
    note: "Laundering amounts match ordinary amounts, patterns run longer and spread out, fees skimmed at each layer.",
    patch: (c) => ({
      ...c, name: "Difficult setting", amountOverlap: 1, burstinessBias: -1, durationMean: 45, durationSd: 12,
      marginRatio: 0.1, multiPatternShare: 0.4, centralityBias: 0.2,
    }),
  },
  rehearsal: {
    label: "Rehearsal (small and fast)",
    note: "800 accounts, 60 days, for a quick pass before a full run.",
    patch: (c) => ({ ...c, name: "Rehearsal set", accounts: 800, days: 60 }),
  },
};

const share = (x: unknown, fallback: number) => (typeof x === "number" && isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback);
export function normaliseMix(m: Partial<CountryMix> | undefined, fallback: CountryMix): CountryMix {
  const v = { eea: share(m?.eea, fallback.eea), other: share(m?.other, fallback.other), corridor: share(m?.corridor, fallback.corridor), highRisk: share(m?.highRisk, fallback.highRisk) };
  const s = v.eea + v.other + v.corridor + v.highRisk || 1;
  return { eea: v.eea / s, other: v.other / s, corridor: v.corridor / s, highRisk: v.highRisk / s };
}

/** The library patterns of labels.json by id, each with the ends of it that a bank can see, its own end and its rate. */
const LIBRARY_PATTERNS: ReadonlyMap<string, { allowed: readonly string[]; bankSees: LibrarySetting["bankSees"]; per1k: number }> =
  new Map(labelsFile.patterns.map((p) => [p.id, { allowed: p.allowed, bankSees: p.bankSees as LibrarySetting["bankSees"], per1k: p.per1k }]));

/** A number held to a range, or the fallback where the value is no finite number. */
const clampTo = (x: unknown, lo: number, hi: number, fallback: number): number => (typeof x === "number" && isFinite(x) ? Math.max(lo, Math.min(hi, x)) : fallback);

/** The settings of the library patterns. An entry is kept where its key is the id of a pattern of labels.json, takes the pattern's value for each field it does not hold, and is held to its range. It gives undefined where no entry remains, so that the settings of a user who set nothing are unchanged. */
export function normaliseLibrary(lib: unknown): Record<string, LibrarySetting> | undefined {
  if (!lib || typeof lib !== "object") return undefined;
  const out: Record<string, LibrarySetting> = {};
  for (const [id, raw] of Object.entries(lib as Record<string, Partial<LibrarySetting> | null>)) {
    const p = LIBRARY_PATTERNS.get(id);
    if (!p) continue;
    const v = raw ?? {};
    out[id] = {
      on: !!v.on,
      per1k: clampTo(v.per1k, 0, 5, p.per1k),
      size: clampTo(v.size, 0.25, 4, 1),
      speed: clampTo(v.speed, 0.25, 4, 1),
      bankSees: typeof v.bankSees === "string" && p.allowed.includes(v.bankSees) ? v.bankSees : p.bankSees,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Bring any configuration up to date and into range. A saved bank or a link written before a
    setting existed gets the standard value for it, so old links still open. */
export function normaliseConfig(c: GenConfig): GenConfig {
  const D = DEFAULT_CONFIG;
  const seg = { retail: share(c.segments?.retail, D.segments.retail), sme: share(c.segments?.sme, D.segments.sme), corporate: share(c.segments?.corporate, D.segments.corporate), private: share(c.segments?.private, 0) };
  const s = seg.retail + seg.sme + seg.corporate + seg.private || 1;
  const cu = c.customers ?? D.customers, pr = c.products ?? D.products;
  // the crime settings: any key a saved bank or a link from before 23 September 2026 carries is converted; any key it lacks takes the default
  const legacy = (c.fraud ?? {}) as Record<string, TypologyConfig | undefined>;
  const hadLegacy = ["app_scam", "account_takeover", "card_fraud", "invoice_fraud"].some((k) => legacy[k] !== undefined);
  const fraud = hadLegacy
    ? fraudFromLegacy({ app_scam: legacy.app_scam?.enabled === false ? 0 : legacy.app_scam?.per1k, account_takeover: legacy.account_takeover?.enabled === false ? 0 : legacy.account_takeover?.per1k, mule_herd: legacy.mule_herd?.enabled === false ? 0 : legacy.mule_herd?.per1k, card_fraud: legacy.card_fraud?.enabled === false ? 0 : legacy.card_fraud?.per1k, bust_out: legacy.bust_out?.enabled === false ? 0 : legacy.bust_out?.per1k, invoice_fraud: legacy.invoice_fraud?.enabled === false ? 0 : legacy.invoice_fraud?.per1k })
    : Object.fromEntries(Object.keys(FRAUD_DEFAULTS).map((k) => [k, (legacy[k] as TypologyConfig | undefined) ?? FRAUD_DEFAULTS[k as FraudTypology]])) as Record<FraudTypology, TypologyConfig>;
  const aml = Object.fromEntries(Object.keys(AML_DEFAULTS).map((k) => [k, (c.aml as Record<string, TypologyConfig> | undefined)?.[k] ?? AML_DEFAULTS[k as AmlTypology]])) as Record<AmlTypology, TypologyConfig>;
  const crypto = Object.fromEntries(Object.keys(CRYPTO_DEFAULTS).map((k) => [k, (c.crypto as Record<string, TypologyConfig> | undefined)?.[k] ?? CRYPTO_DEFAULTS[k as CryptoTypology]])) as Record<CryptoTypology, TypologyConfig>;
  const { library: libraryIn, ...rest } = c;
  const library = normaliseLibrary(libraryIn);
  return {
    ...rest,
    aml, fraud, crypto,
    ...(library ? { library } : {}),
    // the two regulatory lines are sourced (register S45, S46); a link that carries the old EUR 1,000-derived figure takes today's GBP 800
    travelRuleThreshold: c.travelRuleThreshold === 1000 || !c.travelRuleThreshold ? 800 : c.travelRuleThreshold,
    cashThreshold: c.cashThreshold || 10000,
    accounts: Math.max(200, Math.min(12000, Math.round(c.accounts))),
    days: Math.max(28, Math.min(180, Math.round(c.days))),
    banks: Math.max(1, Math.min(6, Math.round(c.banks))),
    period: Math.max(1, Math.min(9999, Math.round(Number(c.period) || 1))),
    segments: { retail: seg.retail / s, sme: seg.sme / s, corporate: seg.corporate / s, private: seg.private / s },
    customers: { pepShare: share(cu.pepShare, D.customers.pepShare), nonResidentShare: share(cu.nonResidentShare, D.customers.nonResidentShare), cashBusinessShare: share(cu.cashBusinessShare, D.customers.cashBusinessShare), digitalShare: share(cu.digitalShare, D.customers.digitalShare) },
    geography: { homeMix: normaliseMix(c.geography?.homeMix, D.geography.homeMix), corridorMix: normaliseMix(c.geography?.corridorMix, D.geography.corridorMix) },
    products: { cards: share(pr.cards, D.products.cards), overdrafts: share(pr.overdrafts, D.products.overdrafts), cashServices: pr.cashServices === "none" || pr.cashServices === "partner" ? pr.cashServices : "branch", international: pr.international !== false },
  };
}

/** How much cash the bank handles against a branch network: none, a partner counter such as the Post Office, or its own branches and ATMs. */
export const cashFactor = (c: GenConfig): number => c.products.cashServices === "none" ? 0 : c.products.cashServices === "partner" ? 0.35 : 1;
/** The share of ordinary payments that cross a border, or none when the bank does not send money abroad. */
export const abroadShare = (c: GenConfig): number => c.products.international ? c.internationalShare : 0;
