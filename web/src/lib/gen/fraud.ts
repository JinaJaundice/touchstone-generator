/* The fraud patterns, by the sub-types the UK reports them in
   (the register of sources; sizes in sources.json app2024, card2024,
   remoteBanking2024).

   Push-payment scams, UK Finance's eight types (S01). The victim pays from
   their own device, which is what separates a scam from a takeover (S21):
     purchase          one payment, sometimes a second, a few hundred pounds
     investment        payments rising over weeks, often through an exchange
     romance           about eleven smaller payments over weeks, some abroad
     advance fee       two or three fees to release a prize, a loan or goods
     invoice/mandate   a business pays a "supplier" whose details changed: the
                       name check does not match and the account is personal
     CEO fraud         a business pays an urgent large sum to a new payee
     police or bank    the victim, on a call with the "bank", moves savings to
       impersonation   a "safe account" in someone else's name
     other             a fake fine, tax bill or refund, on a call, sometimes
       impersonation   with remote access to "fix" the computer
   Account takeover, by route (S01 remote banking, S18, S25): stolen log-in
   details used from a new device; a SIM swap that moves the phone number and
   lets a new device in; remote access to the victim's own device during a
   call. The criminal adds a payee and drains the account.
   Card fraud, by type (S01, S17, S42): card-not-present (a test payment, often
   declined, then online spending at electronics, digital goods and jewellery
   merchants, mostly where 3-D Secure was not applied); lost or stolen
   (contactless in shops, then a cash machine with the PIN); counterfeit (a
   copied magnetic stripe used abroad).
   First-party fraud: the bust-out. The receiving side of every case is its
   own pattern, the mule accounts (family "mule"), joined to the case by
   caseId; mule networks under one controller are planted on their own.

   Victims are not suspicious and are not marked SAR. Mules and the
   first-party fraudster are: they launder the proceeds. */

import { dirichlet, lognormal, rint, sampleK, truncNormal, weightedK } from "../rng";
import { scheduleSteps } from "./scheduler";
import type { Scheduled, World } from "./world";
import type { FraudTypology, LegRole, PatternInstance, Typology } from "./types";
import { TYPOLOGY_LABEL } from "./types";
import sources from "./sources.json";

type Scam = "scam_purchase" | "scam_investment" | "scam_romance" | "scam_advance_fee" | "scam_invoice" | "scam_ceo" | "scam_impersonation_bank" | "scam_impersonation_other";
// sources.json holds each figure as a ratio: the mean value of a payment, the payments in a case and the mean value of a case
const APP = sources.app2024.byType as Record<Scam, { valuePerPaymentGbp: number; paymentsPerCase: number }>;
const perPayment = (t: Scam) => APP[t].valuePerPaymentGbp;
const perCase = (t: Scam) => APP[t].paymentsPerCase;
const CARD = sources.card2024.byType;
const cardPerCase = (t: "card_remote" | "card_lost_stolen" | "card_counterfeit") => CARD[t].valuePerCaseGbp;
const ATO_PER_CASE = sources.remoteBanking2024.valuePerCaseGbp;
const REMOTE_MCC = Object.entries(sources.mcc.cardFraudRemoteWeights).map(([k, v]) => [Number(k), v] as const);

const SOURCES: Partial<Record<Typology, string[]>> = {
  scam_purchase: ["S01", "S02", "S37"], scam_investment: ["S01", "S02", "S37"], scam_romance: ["S01", "S31"], scam_advance_fee: ["S01"],
  scam_invoice: ["S01", "S07", "S37"], scam_ceo: ["S01", "S37"], scam_impersonation_bank: ["S01", "S18", "S31"], scam_impersonation_other: ["S01", "S18", "S27"],
  ato_credentials: ["S01", "S21", "S25"], ato_sim_swap: ["S25", "S01"], ato_remote_access: ["S18", "S27", "S37"],
  card_remote: ["S01", "S15", "S17", "S42"], card_lost_stolen: ["S01", "S13"], card_counterfeit: ["S01", "S42"],
  bust_out: ["S25"], mule_herd: ["S24", "S30", "S40"], mule_account: ["S30", "S40", "S37"],
};

function pickVictim(w: World, minBalance: number, opts: { business?: boolean; older?: boolean; card?: boolean } = {}): number | null {
  const weights = w.accounts.map((a, i) => {
    const kind = opts.business ? a.segment === "sme" || a.segment === "corporate" : a.segment === "retail" || a.segment === "private";
    if (!kind || a.isFraud || a.patterns.length > 0 || a.openedDay >= -30 || a.quietDaysBefore > 0 || w.bal[i] < minBalance) return 0;
    if (opts.card && !a.hasCard) return 0;
    return opts.older ? (a.age >= 60 ? 6 : 1) : 1;
  });
  const [v] = weightedK(w.r, weights, 1);
  return v === undefined ? null : v;
}

/** Mules: mostly young personal accounts, one in five a business account (S40), an account already in a laundering pattern now and then. */
function pickMules(w: World, n: number): number[] {
  const weights = w.accounts.map((a) => {
    if (a.isFraud || a.quietDaysBefore > 0 || a.segment === "corporate" || a.segment === "private") return 0;
    const young = a.openedDay > -240 ? 3 : 1;
    const seg = a.segment === "sme" ? 0.9 : 1;
    const inPattern = a.patterns.length ? w.cfg.multiPatternShare : 1;
    return young * seg * inPattern;
  });
  return weightedK(w.r, weights, n);
}

function markMule(w: World, a: number) { const acc = w.accounts[a]; acc.isFraud = true; acc.fraudRole = acc.fraudRole ?? "mule"; acc.isSar = true; }
function markVictim(w: World, a: number) { const acc = w.accounts[a]; acc.isFraud = true; acc.fraudRole = "victim"; }
function markFirstParty(w: World, a: number) { const acc = w.accounts[a]; acc.isFraud = true; acc.fraudRole = "first-party"; acc.isSar = true; }

/** Logins from several places on a mule's account, some through a VPN: the account is used by someone who is not its holder (S18, S37). */
function muleLogins(w: World, mule: number, from: number, to: number, p: PatternInstance) {
  const n = rint(w.r, 1, 4);
  for (let k = 0; k < n; k++) w.event(mule, rint(w.r, Math.max(0, from), Math.max(from, to)), w.minute("evening"), "login-new-location", { deviceId: w.device[mule], ipCountry: w.r() < 0.5 ? w.country("any-foreign") : "GB", patternId: p.id, typology: "mule_account" });
}

/** The mule side of a case: the mules receive, then pass the money on within hours, abroad, into crypto, to another mule or out in cash. */
function muleSide(w: World, casePattern: PatternInstance, mules: number[], start: number, end: number): PatternInstance | null {
  if (!mules.length) return null;
  const p = w.newPattern("mule_account", "mule", mules, mules[0], start, Math.min(w.cfg.days - 1, end + 3), TYPOLOGY_LABEL.mule_account, { caseId: casePattern.caseId, sources: SOURCES.mule_account });
  mules.forEach((m) => { markMule(w, m); p.roles[m] = "mule"; muleLogins(w, m, start - 20, start, p); });
  return p;
}

/** Where a mule sends it: on to another account at another bank, abroad, into crypto, or out in cash. */
function forward(w: World, day: number, mule: number, amount: number, mp: PatternInstance) {
  const nOut = rint(w.r, 1, 2), sh = dirichlet(w.r, nOut);
  for (let j = 0; j < nOut; j++) {
    const u = w.r();
    const a = amount * sh[j];
    const base = { patternId: mp.id, typology: mp.typology, family: mp.family, caseId: mp.caseId };
    const minute = w.minute("day");
    if (u < 0.25) {
      const ex = w.ordinaryExchange();
      if (ex) { w.schedule({ day, minute, from: mule, to: w.slotOf(ex.id), amount: a, type: "CRYPTO_OUT", wallet: ex.id, walletClass: "exchange", role: "mule-forward", ...base }); continue; }
    }
    if (u < 0.45 && w.cfg.products.international) {
      const country = w.r() < 0.5 ? w.country("medium") : w.country("any-foreign");
      w.schedule({ day, minute, from: mule, to: -1, amount: a, type: "TRANSFER", country, method: "swift", cpRef: `MX-abroad-${mp.id}-${j}`, payeeType: "personal", role: "mule-forward", ...base });
    } else if (u < 0.6 && w.cfg.products.cashServices !== "none") {
      // an ATM pays out at most GBP 500 a day (register S13), so the mule goes back each day until the share is out; past five days the rest leaves by transfer
      let left = a, d = day;
      for (let k = 0; k < 5 && left >= 10 && d < w.cfg.days; k++, d++) {
        const take = Math.min(500, Math.floor(left / 10) * 10);
        w.schedule({ day: d, minute: k === 0 ? w.minute("evening") : w.minute("day"), from: mule, to: -1, amount: take, type: "CASH_OUT", method: "atm", role: "cash-out", ...base });
        left -= take;
      }
      if (left >= 10) w.schedule({ day: Math.min(w.cfg.days - 1, d), minute, from: mule, to: -1, amount: left, type: "TRANSFER", cpRef: `MX-${rint(w.r, 0, 60)}`, payeeType: "personal", payeeAgeDays: rint(w.r, 5, 200), role: "mule-forward", ...base });
    } else {
      w.schedule({ day, minute, from: mule, to: -1, amount: a, type: "TRANSFER", cpRef: `MX-${rint(w.r, 0, 60)}`, payeeType: "personal", payeeAgeDays: rint(w.r, 5, 200), role: "mule-forward", ...base });
    }
  }
}

export function scheduleFraud(w: World) {
  const n = w.accounts.length;
  for (const key of Object.keys(w.cfg.fraud) as FraudTypology[]) {
    const tc = w.cfg.fraud[key];
    if (!tc?.enabled) continue;
    const count = Math.round(tc.per1k * n / 1000);
    for (let c = 0; c < count; c++) inject(w, key, rint(w.r, tc.minAccounts, tc.maxAccounts));
  }
}

/* ---------------------------------------------------------- push-payment scams */

interface ScamShape {
  business: number;           // share of victims that are businesses
  older: boolean;             // victims skew over 60
  payments: [number, number]; // how many payments
  spreadDays: number;         // over how many days
  rising: boolean;            // payments grow
  reason: () => NonNullable<Scheduled["payee"]>["reason"];
  cop: () => NonNullable<Scheduled["payee"]>["cop"];
  payeeType: () => "personal" | "business";
  session: () => Scheduled["session"];
  abroad: number;             // share of payments sent abroad
  viaExchange: number;        // share of cases paid through a crypto exchange
  minute: "day" | "business" | "evening";
}

function scamShape(w: World, t: Scam): ScamShape {
  const r = w.r;
  const call = (p: number) => r() < p;
  const cop = (m: number, c: number, nm: number) => () => { const u = r(); return u < m ? "match" : u < m + c ? "close-match" : u < m + c + nm ? "no-match" : "unavailable"; };
  const avgPayments = perCase(t);
  const around = (x: number): [number, number] => [Math.max(1, Math.floor(x * 0.6)), Math.max(1, Math.ceil(x * 1.4))];
  switch (t) {
    case "scam_purchase": return { business: 0.03, older: false, payments: [1, 2], spreadDays: 2, rising: false, reason: () => "goods-services", cop: cop(0.85, 0.08, 0.05), payeeType: () => "personal", session: () => ({}), abroad: 0.03, viaExchange: 0, minute: "evening" };
    case "scam_investment": return { business: 0.03, older: true, payments: around(avgPayments), spreadDays: 45, rising: true, reason: () => (r() < 0.6 ? "investment" : "other"), cop: cop(0.8, 0.1, 0.07), payeeType: () => (r() < 0.6 ? "business" : "personal"), session: () => ({ remoteAccess: call(0.25), callActive: call(0.35), seconds: Math.round(lognormal(r, 240, 0.6)) }), abroad: 0.15, viaExchange: 0.5, minute: "day" };
    case "scam_romance": return { business: 0.01, older: true, payments: around(avgPayments), spreadDays: 70, rising: false, reason: () => (r() < 0.8 ? "friends-family" : "other"), cop: cop(0.85, 0.08, 0.05), payeeType: () => "personal", session: () => ({}), abroad: 0.3, viaExchange: 0.1, minute: "evening" };
    case "scam_advance_fee": return { business: 0.02, older: false, payments: around(avgPayments), spreadDays: 12, rising: true, reason: () => (r() < 0.5 ? "other" : "goods-services"), cop: cop(0.8, 0.1, 0.07), payeeType: () => "personal", session: () => ({}), abroad: 0.1, viaExchange: 0, minute: "day" };
    case "scam_invoice": return { business: 0.76, older: false, payments: [1, 2], spreadDays: 6, rising: false, reason: () => "invoice", cop: cop(0.2, 0.3, 0.4), payeeType: () => (r() < 0.6 ? "personal" : "business"), session: () => ({}), abroad: 0.1, viaExchange: 0, minute: "business" };
    case "scam_ceo": return { business: 0.94, older: false, payments: [1, 2], spreadDays: 2, rising: false, reason: () => "invoice", cop: cop(0.4, 0.25, 0.3), payeeType: () => "business", session: () => ({ seconds: Math.round(lognormal(r, 150, 0.5)) }), abroad: 0.3, viaExchange: 0, minute: "business" };
    case "scam_impersonation_bank": return { business: 0.04, older: true, payments: around(avgPayments), spreadDays: 2, rising: false, reason: () => (r() < 0.8 ? "own-account" : "other"), cop: cop(0.35, 0.2, 0.4), payeeType: () => "personal", session: () => ({ callActive: call(0.9), seconds: Math.round(lognormal(r, 420, 0.5)) }), abroad: 0, viaExchange: 0.1, minute: "day" };
    case "scam_impersonation_other": return { business: 0.07, older: true, payments: around(avgPayments), spreadDays: 2, rising: false, reason: () => (r() < 0.7 ? "tax-or-fine" : "bill"), cop: cop(0.55, 0.2, 0.2), payeeType: () => (r() < 0.5 ? "business" : "personal"), session: () => ({ callActive: call(0.75), remoteAccess: call(0.3), seconds: Math.round(lognormal(r, 360, 0.5)) }), abroad: 0.05, viaExchange: 0, minute: "day" };
  }
}

function injectScam(w: World, t: Scam, size: number) {
  const days = w.cfg.days;
  const shape = scamShape(w, t);
  const avg = perPayment(t);
  const business = w.r() < shape.business;
  const victim = pickVictim(w, business ? 2000 : Math.min(avg * 0.5, 300), { business, older: shape.older });
  if (victim === null) return;
  const nPay = rint(w.r, shape.payments[0], shape.payments[1]);
  const spread = Math.min(shape.spreadDays, days - 3);
  const start = rint(w.r, 1, Math.max(1, days - 2 - spread));
  const end = Math.min(days - 1, start + spread);
  const p = w.newPattern(t, "fraud", [victim], victim, start, end, TYPOLOGY_LABEL[t], { roles: { [victim]: "victim" }, sources: SOURCES[t] });
  markVictim(w, victim);
  // a case paid through a crypto exchange pays the exchange; of the rest, half pay a mule at this bank (so the receiving side is in the data), half a mule at another bank
  const viaExchange = w.r() < shape.viaExchange;
  const inData = !viaExchange && w.r() < 0.5 ? pickMules(w, Math.max(1, size - 1)).filter((m) => w.accounts[m].openedDay < start) : [];
  const mp = muleSide(w, p, inData, start, end);
  const externalRef = viaExchange ? `VASP-${rint(w.r, 0, 7)}` : `MX-${rint(w.r, 0, 80)}`;
  const steps = nPay === 1 ? [start] : scheduleSteps(w.r, start, Math.max(start + 1, end), nPay, shape.rising ? 1 : 2).sort((a, b) => a - b);
  const rise = shape.rising ? steps.map((_, i) => 0.4 + 1.2 * (i / Math.max(1, steps.length - 1))) : steps.map(() => 1);
  const riseNorm = rise.reduce((a, b) => a + b, 0) / rise.length;
  steps.forEach((s, i) => {
    const want = lognormal(w.r, avg * rise[i] / riseNorm, 0.5);
    // a victim tops up from savings elsewhere to pay a large sum (the credit from their own account shows first)
    if (want > w.bal[victim] * 0.9 && (t === "scam_investment" || t === "scam_impersonation_bank" || t === "scam_romance")) {
      w.schedule({ day: s, minute: Math.max(0, w.minute(shape.minute) - 20), from: -2, to: victim, amount: want * 1.05 - w.bal[victim] * 0.5, type: "INCOME", method: "fps", cpRef: `SAV-${victim}`, patternId: -1, typology: null, family: null });
    }
    const amount = Math.max(20, want);
    const mule = mp && mp.accounts.length ? mp.accounts[i % mp.accounts.length] : -1;
    const abroad = mule === -1 && !viaExchange && w.r() < shape.abroad && w.cfg.products.international;
    const country = abroad ? (w.r() < 0.5 ? w.country("medium") : w.country("any-foreign")) : undefined;
    const minute = w.minute(shape.minute);
    const leg: Scheduled = {
      day: s, minute, from: victim, to: mule, amount, type: "TRANSFER", country, method: abroad ? "swift" : undefined,
      cpRef: mule === -1 ? (abroad ? `MX-abroad-${p.id}` : externalRef) : undefined,
      payeeType: viaExchange ? "business" : shape.payeeType(), payeeAgeDays: viaExchange ? rint(w.r, 800, 3000) : rint(w.r, 3, 240),
      payee: { reason: shape.reason(), cop: viaExchange ? "match" : shape.cop() },
      session: { ...shape.session(), deviceId: undefined },
      useOverdraft: false,
      patternId: p.id, typology: t, family: "fraud", role: "victim-payment", caseId: p.caseId,
    };
    w.schedule(leg);
    if (mule >= 0 && mp) {
      const fwdDay = Math.min(days - 1, s + (w.r() < 0.7 ? 0 : 1));
      forward(w, fwdDay, mule, amount * truncNormal(w.r, 0.9, 0.04, 0.75, 0.97), mp);
    }
  });
}

/* ---------------------------------------------------------- account takeover */

function injectTakeover(w: World, t: "ato_credentials" | "ato_sim_swap" | "ato_remote_access", size: number) {
  const days = w.cfg.days;
  const victim = pickVictim(w, 400, { older: t === "ato_remote_access" });
  if (victim === null) return;
  const day = rint(w.r, 1, days - 3);
  const p = w.newPattern(t, "fraud", [victim], victim, day - 1, Math.min(days - 1, day + 2), TYPOLOGY_LABEL[t], { roles: { [victim]: "victim" }, sources: SOURCES[t] });
  markVictim(w, victim);
  const mules = w.r() < 0.5 ? pickMules(w, Math.max(1, size - 1)).filter((m) => w.accounts[m].openedDay < day) : [];
  const mp = muleSide(w, p, mules, day, day + 2);
  const attacker = `dev-atk-${p.id}`;
  const night = w.r() < 0.6;
  const at = night ? w.minute("night") : w.minute("day");
  const ev = (kind: Parameters<World["event"]>[3], minute: number, extra: { deviceId?: string; ipCountry?: string } = {}) =>
    w.event(victim, day, Math.max(0, minute), kind, { ...extra, patternId: p.id, typology: t });
  let session: Scheduled["session"];
  if (t === "ato_credentials") {
    // phished log-in details: a new device, often a new location or a VPN, then the alerts switched off and sometimes the email changed (S25)
    const ip = w.r() < 0.3 ? w.country("any-foreign") : "GB";
    ev("device-added", at - rint(w.r, 5, 90), { deviceId: attacker, ipCountry: ip });
    if (w.r() < 0.4) ev("notifications-off", at - rint(w.r, 2, 20), { deviceId: attacker, ipCountry: ip });
    if (w.r() < 0.3) ev("email-changed", at - rint(w.r, 2, 20), { deviceId: attacker, ipCountry: ip });
    session = { deviceId: attacker, newDevice: true, ipCountry: ip, vpn: w.r() < 0.5, channel: w.r() < 0.6 ? "online" : "mobile", seconds: Math.round(lognormal(w.r, 60, 0.5)) };
  } else if (t === "ato_sim_swap") {
    // the number moves to the criminal's SIM; the one-time passcodes follow it and a new device is let in
    ev("sim-swap", at - rint(w.r, 60, 600), { ipCountry: "GB" });
    ev("device-added", at - rint(w.r, 5, 50), { deviceId: attacker, ipCountry: "GB" });
    session = { deviceId: attacker, newDevice: true, ipCountry: "GB", channel: "mobile", seconds: Math.round(lognormal(w.r, 50, 0.5)) };
  } else {
    // remote access: the criminal drives the victim's own device during a "support" call; nothing about the device looks new (S18)
    session = { remoteAccess: true, callActive: w.r() < 0.7, newDevice: false, seconds: Math.round(lognormal(w.r, 1000, 0.4)) };
  }
  const drains = rint(w.r, 1, 4), sh = dirichlet(w.r, drains);
  const total = Math.min(w.bal[victim] * truncNormal(w.r, 0.85, 0.08, 0.6, 0.97), lognormal(w.r, ATO_PER_CASE, 0.8));
  for (let i = 0; i < drains; i++) {
    const d = Math.min(days - 1, day + (i > 0 && w.r() < 0.3 ? 1 : 0));
    const mule = mules.length ? mules[i % mules.length] : -1;
    w.schedule({ day: d, minute: Math.min(1439, at + i * rint(w.r, 2, 25)), from: victim, to: mule, amount: Math.max(20, total * sh[i]), type: "TRANSFER",
      cpRef: mule === -1 ? `MX-${rint(w.r, 0, 80)}` : undefined, payeeType: "personal", payeeAgeDays: rint(w.r, 3, 200),
      payee: { reason: w.r() < 0.5 ? "friends-family" : "own-account", cop: w.r() < 0.8 ? "match" : "close-match" },
      session, patternId: p.id, typology: t, family: "fraud", role: "account-drain", caseId: p.caseId });
    if (mule >= 0 && mp) forward(w, Math.min(days - 1, d + (w.r() < 0.6 ? 0 : 1)), mule, total * sh[i] * 0.93, mp);
  }
}

/* ---------------------------------------------------------- card fraud */

function pickMcc(w: World, table: readonly (readonly [number, number])[]) { let u = w.r() * table.reduce((a, x) => a + x[1], 0); for (const [k, v] of table) { u -= v; if (u <= 0) return k; } return table[0][0]; }

function injectCard(w: World, t: "card_remote" | "card_lost_stolen" | "card_counterfeit") {
  const days = w.cfg.days;
  const victim = pickVictim(w, 150, { card: true });
  if (victim === null) return;
  const day = rint(w.r, 1, days - 2);
  const p = w.newPattern(t, "fraud", [victim], victim, day, Math.min(days - 1, day + 1), TYPOLOGY_LABEL[t], { roles: { [victim]: "victim" }, sources: SOURCES[t] });
  markVictim(w, victim);
  const base = { from: victim, to: -1, type: "SPEND" as const, useOverdraft: true, patternId: p.id, typology: t as Typology, family: "fraud" as const, caseId: p.caseId };
  const total = lognormal(w.r, cardPerCase(t) * 0.8, 0.8);
  if (t === "card_remote") {
    // stolen details: one to three test payments at a digital merchant, some declined, then online spending, mostly where 3-D Secure did not run
    const abroad = w.r() < 0.4;
    const country = abroad ? (w.r() < 0.6 ? w.country("any-foreign") : w.country("medium")) : "GB";
    let m = w.r() < 0.4 ? rint(w.r, 0, 300) : rint(w.r, 600, 1320);
    let d = day;
    const tests = rint(w.r, 1, 3);
    const testMerchant = `M5816-${country}-${rint(w.r, 0, 59)}`;
    for (let k = 0; k < tests; k++) {
      w.schedule({ ...base, day: d, minute: m, amount: truncNormal(w.r, 1.2, 0.8, 0.3, 4.99), method: "card-online", country, mcc: 5816, merchant: testMerchant,
        threeDS: "exempt-low-value", declined: w.r() < 0.35 ? "invalid-details" : undefined, role: "card-test" });
      m += rint(w.r, 1, 6);
    }
    const n = rint(w.r, 1, 4), shares = dirichlet(w.r, n).sort((a, b) => a - b);
    for (let j = 0; j < n; j++) {
      m += rint(w.r, 3, 40);
      if (m > 1439) { m -= 1440; d = Math.min(days - 1, day + 1); }
      const mcc = pickMcc(w, REMOTE_MCC);
      w.schedule({ ...base, day: d, minute: m, amount: Math.max(15, total * shares[j]), method: "card-online", country: w.r() < 0.85 ? country : w.country("any-foreign"), mcc,
        threeDS: abroad ? (w.r() < 0.8 ? "not-attempted" : "authenticated") : (w.r() < 0.5 ? "not-attempted" : w.r() < 0.5 ? "exempt-recurring" : "authenticated"), role: "card-spend" });
    }
    return;
  }
  if (t === "card_lost_stolen") {
    // taken in a bar or a shop in the evening: contactless under GBP 100 in quick succession, then a cash machine with the PIN
    let m = rint(w.r, 1080, 1380);
    const n = rint(w.r, 3, 8);
    const shares = dirichlet(w.r, n);
    for (let j = 0; j < n; j++) {
      const mcc = [5812, 5814, 5541, 5411, 5311, 5999][rint(w.r, 0, 5)];
      w.schedule({ ...base, day, minute: Math.min(1439, m), amount: Math.min(99.5, Math.max(5, total * shares[j] * 1.2)), method: "card-contactless", country: "GB", mcc, role: "card-spend" });
      m += rint(w.r, 4, 30);
    }
    if (w.r() < 0.45 && w.cfg.products.cashServices !== "none") {
      w.schedule({ ...base, day, minute: Math.min(1439, m + rint(w.r, 5, 40)), amount: rint(w.r, 10, 50) * 10, type: "CASH_OUT", method: "atm", country: "GB", role: "card-spend" });
    }
    return;
  }
  // counterfeit: a copied stripe used abroad, at cash machines and shops that still read the stripe
  const country = w.r() < 0.5 ? w.country("medium") : w.country("any-foreign");
  let m = w.minute("day");
  const n = rint(w.r, 2, 5);
  const shares = dirichlet(w.r, n);
  for (let j = 0; j < n; j++) {
    const cash = w.cfg.products.cashServices !== "none" && w.r() < 0.5;
    w.schedule({ ...base, day, minute: Math.min(1439, m), amount: Math.max(10, total * shares[j]), type: cash ? "CASH_OUT" : "SPEND", method: cash ? "atm" : "card-magstripe", country, mcc: cash ? 6011 : [5732, 5944, 5311, 5999][rint(w.r, 0, 3)], role: "card-spend" });
    m += rint(w.r, 10, 90);
  }
}

/* ---------------------------------------------------------- first-party and mule networks */

function injectBustOut(w: World) {
  const days = w.cfg.days;
  const weights = w.accounts.map((a) => !a.isFraud && a.patterns.length === 0 && a.quietDaysBefore === 0 && (a.segment === "retail" || a.segment === "sme")
    && a.openedDay > -120 && a.openedDay < days - 25 ? (a.openedDay >= 0 ? 3 : 1) : 0);
  const [acc] = weightedK(w.r, weights, 1);
  if (acc === undefined) return;
  const a = w.accounts[acc];
  if (a.overdraftLimit <= 0) a.overdraftLimit = Math.round(a.income * truncNormal(w.r, 1.2, 0.4, 0.5, 2.5) / 50) * 50;
  const start = Math.max(0, a.openedDay + 1);
  const bust = rint(w.r, Math.min(start + 20, days - 3), days - 3);
  const p = w.newPattern("bust_out", "fraud", [acc], acc, bust - 1, Math.min(days - 1, bust + 2), TYPOLOGY_LABEL.bust_out, { roles: { [acc]: "first-party" }, sources: SOURCES.bust_out });
  markFirstParty(w, acc);
  const base = { patternId: p.id, typology: "bust_out" as Typology, family: "fraud" as const, caseId: p.caseId };
  const nBuild = rint(w.r, 2, 5);
  for (const d of scheduleSteps(w.r, start, Math.max(start, bust - 3), nBuild, 1)) {
    w.schedule({ day: d, minute: w.minute("business"), from: -2, to: acc, amount: lognormal(w.r, a.income * 0.5, 0.5), type: "INCOME", method: "fps", cpRef: `BO-${p.id}`, role: "first-party-build", ...base });
  }
  const take = (d: number, minute: number, share: number, type: "TRANSFER" | "CASH_OUT" | "SPEND", country?: string) =>
    w.schedule({ day: d, minute, from: acc, to: -1, amount: 0, shareOfHeadroom: share, useOverdraft: true, type, method: type === "SPEND" ? "card-chip" : type === "CASH_OUT" ? "counter" : country && country !== "GB" ? "swift" : "fps", country, role: "first-party-take", ...base });
  const d2 = Math.min(days - 1, bust + (w.r() < 0.5 ? 0 : 1)), d3 = Math.min(days - 1, d2 + (w.r() < 0.5 ? 0 : 1));
  take(bust, w.minute("day"), truncNormal(w.r, 0.45, 0.1, 0.25, 0.65), "TRANSFER", w.r() < 0.3 && w.cfg.products.international ? w.country("any-foreign") : undefined);
  take(d2, w.minute("day"), truncNormal(w.r, 0.5, 0.1, 0.3, 0.7), w.r() < 0.6 && w.cfg.products.cashServices !== "none" ? "CASH_OUT" : "SPEND");
  take(d3, w.minute("day"), truncNormal(w.r, 0.99, 0.01, 0.96, 0.999), w.r() < 0.5 ? "TRANSFER" : "SPEND");
  w.silentFrom[acc] = d3 + 1;
}

function injectMuleHerd(w: World, size: number) {
  const days = w.cfg.days;
  const mules = pickMules(w, Math.max(4, size));
  if (mules.length < 3) return;
  const collector = mules[0];
  const runners = mules.slice(1);
  const earliest = Math.max(0, ...mules.map((m) => w.accounts[m].openedDay + 1));
  const start = rint(w.r, Math.min(earliest, Math.max(0, days - 30)), Math.max(0, days - 30));
  const end = Math.min(days - 1, start + rint(w.r, 14, 40));
  const p = w.newPattern("mule_herd", "mule", mules, collector, start, end, TYPOLOGY_LABEL.mule_herd, { roles: Object.fromEntries(mules.map((m) => [m, m === collector ? "collector" : "mule"])), sources: SOURCES.mule_herd });
  mules.forEach((m) => { markMule(w, m); muleLogins(w, m, start - 20, end, p); });
  // the controller runs several of them from one phone, and gives one address for some (S30)
  const shared = `dev-herd-${p.id}`;
  sampleK(w.r, mules, Math.max(2, Math.round(mules.length * 0.6))).forEach((m) => { w.accounts[m].deviceId = shared; w.device[m] = shared; });
  if (w.r() < 0.5) { const addr = w.accounts[collector].addressId; sampleK(w.r, runners, Math.max(1, Math.round(runners.length * 0.4))).forEach((m) => { w.accounts[m].addressId = addr; }); }
  const base = { patternId: p.id, typology: "mule_herd" as Typology, family: "mule" as const, caseId: p.caseId };
  for (const m of runners) {
    const nIn = rint(w.r, 2, 5);
    const steps = scheduleSteps(w.r, start, end, nIn, 2);
    let got = 0;
    steps.forEach((s) => {
      const a = lognormal(w.r, perPayment("scam_purchase") * 2, 0.7);
      got += a;
      // most of the money comes from victims at other banks; now and then a victim here pays, and that payment is its own scam case
      if (w.r() < 0.3) {
        const v = pickVictim(w, a * 1.2);
        if (v !== null) {
          const vp = w.newPattern("scam_purchase", "fraud", [v], v, s, Math.min(days - 1, s + 1), TYPOLOGY_LABEL.scam_purchase, { caseId: p.caseId, roles: { [v]: "victim" }, sources: SOURCES.scam_purchase });
          markVictim(w, v);
          w.schedule({ day: s, minute: w.minute("evening"), from: v, to: m, amount: a, type: "TRANSFER", payeeType: "personal", payee: { reason: "goods-services", cop: "match" },
            patternId: vp.id, typology: "scam_purchase", family: "fraud", role: "victim-payment", caseId: p.caseId });
          return;
        }
      }
      w.schedule({ day: s, minute: w.minute("day"), from: -2, to: m, amount: a, type: "INCOME", method: "fps", cpRef: `MV-${p.id}-${rint(w.r, 0, 999)}`, role: "mule-receipt", ...base });
    });
    const last = steps[steps.length - 1];
    w.schedule({ day: Math.min(days - 1, last + rint(w.r, 0, 2)), minute: w.minute("day"), from: m, to: collector,
      amount: got * truncNormal(w.r, 0.92, 0.04, 0.7, 0.98), type: "TRANSFER", role: "mule-forward", ...base });
  }
  // the collector sends it on and takes some out in cash
  forward(w, Math.min(days - 1, end + 1), collector, runners.length * perPayment("scam_purchase") * 2 * 2.5 * 0.9, p);
  if (w.cfg.products.cashServices !== "none") {
    for (let k = 0; k < rint(w.r, 1, 3); k++) w.schedule({ day: Math.min(days - 1, end + 1 + k), minute: w.minute("evening"), from: collector, to: -1, amount: 500, type: "CASH_OUT", method: "atm", role: "cash-out", ...base });
  }
}

function inject(w: World, key: FraudTypology, size: number) {
  if (key.startsWith("scam_")) return injectScam(w, key as Scam, size);
  if (key === "ato_credentials" || key === "ato_sim_swap" || key === "ato_remote_access") return injectTakeover(w, key, size);
  if (key === "card_remote" || key === "card_lost_stolen" || key === "card_counterfeit") return injectCard(w, key);
  if (key === "bust_out") return injectBustOut(w);
  if (key === "mule_herd") return injectMuleHerd(w, size);
}

export type { LegRole };
