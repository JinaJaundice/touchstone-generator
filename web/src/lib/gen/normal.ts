/* Ordinary life on the book, on the real calendar. Two layers, both from
   AMLGentex, with the UK rails under them:

   1. Each account's own daily behaviour (account.py): pay arrives on the
      account's pay day, bills go out, and discretionary spending fires with a
      probability that rises when the balance sits above its recent average and
      falls when it sits below. Here pay arrives by Bacs on the working day
      before a pay date that falls at a weekend or on a bank holiday; bills go
      by Direct Debit on working days; spending goes on the card (contactless up
      to GBP 100, chip above it, online a quarter of the time) with a merchant
      category code; cash comes from machines up to GBP 500 a day; people pay
      each other by Faster Payments and name-check a new payee; people with a
      home abroad send money there by SWIFT; crypto-active customers buy and
      sell bitcoin through the bank's crypto service. Security events happen to
      ordinary customers too: a new phone, a password reset, a new number.
   2. Normal transaction models between accounts (normal_models.py): single
      payments, legitimate fan-in (a club collecting subs) and fan-out (a firm
      paying wages), forward chains, mutual loans and repayments, and periodical
      standing orders. Each instance has a duration drawn from a lognormal and a
      burstiness level that shapes its timing.

   The rates behind each signal are in sources.json; where no source exists
   the rate is marked an assumption there and in the method. Nothing here
   knows about a rule. */

import { lognormal, lognormalLinear, poisson, rint, sampleK, truncNormal } from "../rng";
import { scheduleSteps, sampleBurstiness } from "./scheduler";
import type { World } from "./world";
import type { Method, NormalModel } from "./types";
import { abroadShare, cashFactor } from "./config";
import sources from "./sources.json";

const sigmoid = (x: number) => x < -40 ? 0 : x > 40 ? 1 : 1 / (1 + Math.exp(-x));
const A = sources.assumptions;
const CONTACTLESS = sources.contactless.limitGbp;

interface Bill { dom: number; amount: number; ref: string; method: Method }
interface AccountState {
  /** a monthly pay date (1..31, or 0 for the last working day), or a weekday for weekly and four-weekly pay */
  pay: { kind: "monthly"; dom: number } | { kind: "weekly" | "four-weekly"; phase: number } | null;
  employer: string;
  pension: boolean;
  bills: Bill[];
  trip: { start: number; end: number; country: string } | null;
  /** a dormant account stays quiet except on its one waking day, if it has one */
  wakeDay: number | null;
  /** the day of the monthly remittance home, for a customer whose home is abroad */
  remitDom: number | null;
}

/* A household's regular bills, each collected once a month: rent or mortgage (by Direct Debit or a standing order), council tax, the
   energy supplier (with water and broadband folded in), and the phone and insurance. Four collections a month keeps Direct Debits near
   one payment in ten, their share of UK payments (computed from the register of sources, S10 and S11). */
const BILL_KINDS = [
  { kind: "housing", share: 0.3, dd: 0.7 }, { kind: "council-tax", share: 0.06, dd: 1 }, { kind: "energy", share: 0.1, dd: 1 },
  { kind: "phone-insurance", share: 0.05, dd: 1 },
];

export function initDaily(w: World): AccountState[] {
  const st = w.accounts.map((a, i) => {
    const personal = a.segment === "retail" || a.segment === "private";
    // travel: a few days of card payments abroad, several a day. Card fraud has to be told from a holiday, so the holiday is in the data.
    let trip: AccountState["trip"] = null;
    if (personal && w.r() < (a.segment === "private" ? 0.12 : 0.06) * (w.cfg.days / 90) * (0.5 + abroadShare(w.cfg) * 10)) {
      const start = rint(w.r, 0, Math.max(0, w.cfg.days - 4));
      trip = { start, end: Math.min(w.cfg.days - 1, start + rint(w.r, 2, 6)), country: w.country("any-foreign") };
    }
    let pay: AccountState["pay"] = null;
    if (personal) {
      const u = w.r();
      pay = u < 0.85 ? { kind: "monthly", dom: [25, 25, 28, 0, 0, 1, 15, 20][rint(w.r, 0, 7)] } : u < 0.95 ? { kind: "four-weekly", phase: rint(w.r, 0, 27) } : { kind: "weekly", phase: rint(w.r, 0, 6) };
    }
    const bills: Bill[] = [];
    if (personal) {
      for (const b of BILL_KINDS) {
        if (b.kind === "housing" && a.age < 22 && w.r() < 0.5) continue;
        const amount = a.income * b.share * truncNormal(w.r, 1, 0.25, 0.4, 1.8);
        bills.push({ dom: rint(w.r, 1, 28), amount, ref: `DD-${b.kind}-${rint(w.r, 0, 39)}`, method: w.r() < b.dd ? "direct-debit" : "standing-order" });
      }
    } else {
      // a firm's rent and utilities by Direct Debit; its suppliers and wages are the normal models and the daily payments below
      bills.push({ dom: rint(w.r, 1, 28), amount: a.income * 0.12, ref: `DD-premises-${rint(w.r, 0, 99)}`, method: "direct-debit" });
      bills.push({ dom: rint(w.r, 1, 28), amount: a.income * 0.03, ref: `DD-utilities-${rint(w.r, 0, 39)}`, method: "direct-debit" });
    }
    // an established customer already pays some people at other banks
    if (a.openedDay < -30) w.seedExternalPayees(i, rint(w.r, 1, personal ? 4 : 8));
    return {
      pay, employer: `EMP-${rint(w.r, 0, Math.max(10, Math.round(w.accounts.length / 25)))}`,
      pension: personal && a.age >= 66, bills, trip,
      wakeDay: a.quietDaysBefore > 0 ? (w.r() < A.dormantWakeShare ? rint(w.r, 0, w.cfg.days - 1) : null) : null,
      remitDom: a.country !== "GB" && personal && w.cfg.products.international && w.r() < 0.6 ? rint(w.r, 1, 28) : null,
    };
  });
  w.abroadOn = (acc, day) => { const t = st[acc].trip; return t && day >= t.start && day <= t.end ? t.country : null; };
  seedKnownPayers(w, st);
  return st;
}

/** The daily rates of the credits an ordinary customer receives, shared by the day's schedule below and the history before the period. */
const OCCASIONAL_CREDIT = { private: 0.06, other: 0.025, refs: 6 };
const FIRM_INVOICES = { smePerMonth: 6, corporatePerMonth: 22, smeRefs: 26, corporateRefs: 81 };
const CRYPTO_LEGS = { perDay: 0.11, buyShare: 0.68, ownShare: 0.6 };

/**
 * A draw in [0, 1) fixed by the bank's seed number, the account and a name. The
 * history before the period is decided with it, away from the day's random
 * stream, so adding the history changed no record the generator makes.
 */
function historyDraw(seed: number, acc: number, key: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  const s = `${acc}|${key}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The chance that a payer arriving at `rate` a day paid in at least once over `days` days. */
const paidBefore = (rate: number, days: number) => 1 - Math.pow(1 - Math.min(1, rate), Math.max(0, days));

/**
 * The payers an established customer received from before the period, so a
 * regular payer is not a new payer on day one. Each regular payer of the day's
 * schedule counts as seen with the chance its own rate gives over the days the
 * account was active before day 0 (opened, less any quiet spell). A payer that
 * only exists in the period (an estate, a dormant account's returning money, a
 * planted pattern's payers) is new the first time.
 */
function seedKnownPayers(w: World, st: AccountState[]) {
  const act = w.cfg.activity;
  w.accounts.forEach((a, i) => {
    const days = -a.openedDay - a.quietDaysBefore;
    if (days <= 0) return;
    const s = st[i];
    const personal = a.segment === "retail" || a.segment === "private";
    const maybe = (key: string, rate: number) => { if (historyDraw(w.cfg.seed, i, key) < paidBefore(rate, days)) w.knownPayer(i, key); };
    if (personal) {
      if (s.pay) maybe(s.employer, s.pay.kind === "weekly" ? 1 / 7 : s.pay.kind === "four-weekly" ? 1 / 28 : 12 / 365);
      if (s.pension) maybe("DWP-state-pension", 1 / 28);
      const occasional = (a.segment === "private" ? OCCASIONAL_CREDIT.private : OCCASIONAL_CREDIT.other) * act / OCCASIONAL_CREDIT.refs;
      for (let k = 0; k < OCCASIONAL_CREDIT.refs; k++) maybe(`IN-${i}-${k}`, occasional);
      const L = sources.lumpSums;
      maybe(`FAM-${i}`, (a.age >= 25 && a.age <= 34 ? L.giftTwoYearShareAge25to34 : L.giftTwoYearShare) / 730);
    } else {
      if (a.segment === "sme" && (i % 2 === 0 || a.cashBusiness)) maybe(`ACQ-${a.bank}`, 0.8 * 5 / 7);
      const sme = a.segment === "sme";
      const refs = sme ? FIRM_INVOICES.smeRefs : FIRM_INVOICES.corporateRefs;
      const perRef = (sme ? FIRM_INVOICES.smePerMonth : FIRM_INVOICES.corporatePerMonth) / 28 * act * 0.5 / refs;
      for (let k = 0; k < refs; k++) maybe(`CP-${i}-${k}`, perRef);
    }
    if (a.wallet) maybe(`w${a.wallet}`, CRYPTO_LEGS.perDay * act * (1 - CRYPTO_LEGS.buyShare) * CRYPTO_LEGS.ownShare);
  });
}

/** Whether today is this account's pay day. */
function payDay(w: World, s: AccountState, day: number): boolean {
  const p = s.pay;
  if (!p) return false;
  if (p.kind === "weekly" || p.kind === "four-weekly") {
    // paid on Fridays, or on the working day before when the Friday is a bank holiday
    const friday = day + ((5 - w.cal.weekday(day) + 7) % 7);
    if (w.cal.prevWorking(friday) !== day) return false;
    return p.kind === "weekly" || Math.floor((friday + p.phase) / 7) % 4 === 0;
  }
  // monthly: the pay date, or the working day before it when it falls at a weekend or on a bank holiday
  const dom = (p as { kind: "monthly"; dom: number }).dom;
  const target = (d: number) => {
    const len = w.cal.monthLength(d);
    if (dom === 0) return w.cal.prevWorking(d - w.cal.dom(d) + len);
    const dayOfDate = d - w.cal.dom(d) + Math.min(dom, len);
    return w.cal.prevWorking(dayOfDate);
  };
  return target(day) === day || target(day + 7) === day;
}

export function dailyBehaviour(w: World, day: number, st: AccountState[]) {
  const act = w.cfg.activity;
  const abroad = abroadShare(w.cfg);
  const cash = cashFactor(w.cfg);
  const working = w.cal.working(day);
  for (let i = 0; i < w.accounts.length; i++) {
    const a = w.accounts[i];
    if (a.openedDay > day) continue;
    if (day >= w.silentFrom[i]) continue;
    const s = st[i];
    // opening balance lands on the day a new account opens
    if (a.openedDay === day) {
      w.schedule({ day, minute: w.minute("business"), from: -2, to: i, amount: 0, type: "INITIAL", method: "internal", patternId: -1, typology: null, family: null });
    }
    // a dormant account does nothing, unless today is the day it wakes: a returning customer moves some money
    if (a.quietDaysBefore > 0) {
      if (s.wakeDay === day) {
        w.schedule({ day, minute: w.minute("day"), from: -2, to: i, amount: lognormal(w.r, a.income * 0.6, 0.6), type: "INCOME", method: "fps", cpRef: `X${i}-back`, patternId: -1, typology: null, family: null });
        w.schedule({ day: Math.min(w.cfg.days - 1, day + rint(w.r, 0, 3)), minute: w.minute("day"), from: i, to: -1, amount: lognormal(w.r, a.income * 0.4, 0.5), type: "TRANSFER", patternId: -1, typology: null, family: null });
      }
      continue;
    }
    const away = s.trip && day >= s.trip.start && day <= s.trip.end ? s.trip : null;
    const personal = a.segment === "retail" || a.segment === "private";

    // ---- security events an ordinary customer makes: a new phone, a reset password, a new number
    if (w.r() < A.newDevicePerYear / 365) w.newOwnDevice(i, day, w.minute("evening"));
    if (w.r() < A.passwordResetPerYear / 365) w.event(i, day, w.minute("day"), "password-reset", { deviceId: w.device[i] });
    if (w.r() < A.phoneChangedPerYear / 365) w.event(i, day, w.minute("day"), "phone-changed", { deviceId: w.device[i] });
    // a genuine replacement or ported SIM, a new email address, and alerts switched off: the same events a takeover makes (rates are assumptions, sources.json)
    if (w.r() < A.simSwapPerYear / 365) w.event(i, day, w.minute("day"), "sim-swap", { deviceId: w.device[i] });
    if (w.r() < A.emailChangedPerYear / 365) w.event(i, day, w.minute("day"), "email-changed", { deviceId: w.device[i] });
    if (w.r() < A.notificationsOffPerYear / 365) w.event(i, day, w.minute("evening"), "notifications-off", { deviceId: w.device[i] });

    // ---- income
    if (personal) {
      if (payDay(w, s, day)) {
        const perPay = s.pay?.kind === "weekly" ? a.income * 12 / 52 : s.pay?.kind === "four-weekly" ? a.income * 12 / 13 : a.income;
        w.schedule({ day, minute: rint(w.r, 0, 300), from: -2, to: i, amount: perPay * truncNormal(w.r, 1, 0.04, 0.85, 1.15), type: "INCOME", method: "bacs-credit", cpRef: s.employer, patternId: -1, typology: null, family: null });
      }
      if (s.pension && working && day % 28 === i % 28) {
        w.schedule({ day, minute: rint(w.r, 0, 300), from: -2, to: i, amount: 900 * truncNormal(w.r, 1, 0.1, 0.8, 1.3), type: "INCOME", method: "bacs-credit", cpRef: "DWP-state-pension", patternId: -1, typology: null, family: null });
      }
      // occasional credits: a refund, a gift, and for a private client dividends and drawings, some from abroad
      if (w.r() < (a.segment === "private" ? OCCASIONAL_CREDIT.private : OCCASIONAL_CREDIT.other) * act) {
        const country = w.r() < (a.segment === "private" ? 0.2 : 0.06) * (abroad > 0 ? 1 : 0) ? w.country("destination") : "GB";
        w.schedule({ day, minute: w.minute("day"), from: -2, to: i, amount: lognormal(w.r, a.income * (a.segment === "private" ? 0.15 : 0.08), 0.9),
          type: "INCOME", country, method: country === "GB" ? "fps" : "swift", cpRef: `IN-${i}-${rint(w.r, 0, OCCASIONAL_CREDIT.refs - 1)}`, patternId: -1, typology: null, family: null });
      }
    } else {
      // a firm's takings: its card acquirer settles yesterday's card sales by Bacs on working days, and customers pay invoices by Faster Payments
      const perDay = (a.segment === "sme" ? FIRM_INVOICES.smePerMonth : FIRM_INVOICES.corporatePerMonth) / 28 * act;
      // only firms that take cards get a daily settlement from their acquirer (half the small firms here; a corporate is paid on invoice)
      if (working && a.segment === "sme" && (i % 2 === 0 || a.cashBusiness) && w.r() < 0.8) {
        w.schedule({ day, minute: rint(w.r, 0, 300), from: -2, to: i, amount: lognormal(w.r, a.income / 30 * 0.5, 0.5), type: "INCOME", method: "bacs-credit", cpRef: `ACQ-${a.bank}`, patternId: -1, typology: null, family: null });
      }
      const n = poisson(w.r, perDay * 0.5);
      for (let k = 0; k < n; k++) {
        const country = w.r() < abroad * 1.5 ? w.country("destination") : "GB";
        w.schedule({ day, minute: w.minute("business"), from: -2, to: i,
          amount: lognormal(w.r, a.income / (a.segment === "sme" ? 6 : 22), 0.8), type: "INCOME", country, method: country === "GB" ? "fps" : "swift",
          cpRef: `CP-${i}-${rint(w.r, 0, (a.segment === "sme" ? FIRM_INVOICES.smeRefs : FIRM_INVOICES.corporateRefs) - 1)}`, patternId: -1, typology: null, family: null });
      }
    }

    // ---- bills: Direct Debits collected on working days, standing orders on the date
    for (const b of s.bills) {
      const dueToday = w.cal.dom(day) === Math.min(b.dom, w.cal.monthLength(day));
      if (!dueToday) continue;
      const amt = Math.min(w.headroom(i) * 0.9, b.amount);
      if (amt > 1) w.schedule({ day, minute: b.method === "direct-debit" ? rint(w.r, 0, 300) : rint(w.r, 360, 480), from: i, to: -1, amount: amt, type: b.method === "direct-debit" ? "SPEND" : "TRANSFER", method: b.method, cpRef: b.ref, payeeType: "business", patternId: -1, typology: null, family: null });
    }

    // ---- discretionary spending against the recent average balance
    w.emaBal[i] = 0.93 * w.emaBal[i] + 0.07 * w.bal[i];
    const meanBal = Math.max(w.emaBal[i], 100);
    const pSpend = 0.5 * act * sigmoid((w.bal[i] - meanBal) / meanBal) * (personal ? 1.1 : 1.6);
    const nSpend = away ? rint(w.r, 2, 5) : w.r() < pSpend ? 1 + (w.r() < 0.35 ? 1 : 0) : 0;
    for (let k = 0; k < nSpend; k++) {
      const maxAmt = 0.9 * w.headroom(i);
      if (maxAmt < 5) break;
      // a card payment's size: a UK card payment is typically a few tens of pounds (median here GBP 24 for a personal customer, GBP 45 for a private client); a firm's card spend is larger
      const mean = a.segment === "retail" ? 24 * Math.sqrt(a.income / 2500) : a.segment === "private" ? 45 : a.income / 60;
      const amt = Math.min(maxAmt, lognormal(w.r, away ? mean * 1.2 : mean, 0.9));
      // cash from a machine needs somewhere to take it: none without cash services, a third as often through a partner counter
      const inCash = !away && w.r() < w.cfg.cashShare * cash;
      if (inCash) {
        w.schedule({ day, minute: w.minute("day"), from: i, to: -1, amount: Math.max(10, Math.min(500, amt)), type: "CASH_OUT", method: "atm", patternId: -1, typology: null, family: null });
        continue;
      }
      if (!a.hasCard) {
        // a customer without a card pays a shop or a bill by bank transfer
        w.schedule({ day, minute: w.minute("day"), from: i, to: -1, amount: amt, type: "SPEND", method: "fps", payeeType: "business", patternId: -1, typology: null, family: null });
        continue;
      }
      const online = !away && w.r() < (personal ? A.cardOnlineShare : 0.6);
      const country = away ? away.country : online && w.r() < abroad * 1.2 ? w.country("ordinary") : "GB";
      const method: Method = online ? "card-online" : amt <= CONTACTLESS && w.r() < 0.92 ? "card-contactless" : "card-chip";
      // an ordinary decline: not enough money, a mistyped expiry date
      const declined = w.r() < A.cardDeclineShare ? (w.bal[i] < amt * 1.2 ? "insufficient-funds" as const : "invalid-details" as const) : undefined;
      w.schedule({ day, minute: w.minute(away ? "day" : "day"), from: i, to: -1, amount: amt, type: "SPEND", method, country, declined, patternId: -1, typology: null, family: null });
    }

    // ---- a lump sum now and then: an inheritance, or a gift or loan from family (ONS rates over two years, register S54)
    if (personal) {
      const L = sources.lumpSums;
      if (w.r() < L.inheritanceTwoYearShare / 730) {
        const amt = Math.max(1000, lognormal(w.r, L.inheritanceMedianGbp, L.spread));
        w.schedule({ day, minute: w.minute("business"), from: -2, to: i, amount: amt, type: "INCOME", method: amt >= 25000 && w.cal.working(day) ? "chaps" : "fps", cpRef: `EST-${i}-${day}`, patternId: -1, typology: null, family: null });
      }
      if (w.r() < (a.age >= 25 && a.age <= 34 ? L.giftTwoYearShareAge25to34 : L.giftTwoYearShare) / 730) {
        w.schedule({ day, minute: w.minute("day"), from: -2, to: i, amount: Math.max(500, lognormal(w.r, L.giftMedianGbp, L.spread)), type: "INCOME", method: "fps", cpRef: `FAM-${i}`, patternId: -1, typology: null, family: null });
      }
    }

    // ---- everyday payments to people the account already pays: rent to a landlord, a split bill, a supplier. Mostly known payees, sometimes new.
    const pP2p = (personal ? 0.07 : 0.16) * act;
    if (w.r() < pP2p && w.bal[i] > 20) {
      const known = w.beneficiaries[i];
      // a payment to another customer here is sized for the smaller of the two (qa-gen A10)
      const sized = (to: number) => Math.min(0.9 * w.bal[i], lognormal(w.r, (to >= 0 ? pairMean(w, i, to) : w.typicalTransfer(i)) * 0.8, 0.9));
      if (known.length && w.r() < 0.6) {
        const to = known[rint(w.r, 0, known.length - 1)];
        const amt = sized(to);
        // a dormant account receives nothing until it wakes
        if (to !== i && awake(w, to) && amt >= 1) w.schedule({ day, minute: w.minute("day"), from: i, to, amount: amt, type: "TRANSFER", patternId: -1, typology: null, family: null });
      } else if (w.r() < 0.9) {
        // a payee at another bank: most are known, some are new and get a name check
        const amt = sized(-1);
        if (amt >= 1) w.schedule({ day, minute: w.minute("day"), from: i, to: -1, amount: amt, type: "TRANSFER", patternId: -1, typology: null, family: null });
      } else {
        const to = rint(w.r, 0, w.accounts.length - 1);
        const amt = sized(to);
        if (to !== i && awake(w, to) && amt >= 1) w.schedule({ day, minute: w.minute("day"), from: i, to, amount: amt, type: "TRANSFER", patternId: -1, typology: null, family: null });
      }
    }
    // payments abroad: a share of transfers crosses a border
    if (abroad > 0 && w.r() < abroad * 0.4 * pP2p && w.bal[i] > 50) {
      const country = w.country("destination");
      w.schedule({ day, minute: w.minute("day"), from: i, to: -1, amount: Math.min(0.9 * w.bal[i], lognormal(w.r, w.typicalTransfer(i), 0.8)), type: "TRANSFER", country, method: "swift", patternId: -1, typology: null, family: null });
    }
    // a customer whose home is abroad sends money home once a month
    if (s.remitDom !== null && w.cal.dom(day) === s.remitDom && w.bal[i] > 100) {
      w.schedule({ day, minute: w.minute("evening"), from: i, to: -1, amount: Math.min(0.5 * w.bal[i], a.income * truncNormal(w.r, 0.12, 0.05, 0.03, 0.3)), type: "TRANSFER", country: a.country, method: "swift", cpRef: `HOME-${i}`, payeeType: "personal", patternId: -1, typology: null, family: null });
    }

    // ---- cash deposits. A cash-based business banks its takings most working days; anyone else pays in cash now and then. None without cash services.
    if (a.cashBusiness) {
      if (cash > 0 && w.cal.weekday(day) !== 0 && w.r() < 0.6 * act * cash) {
        w.schedule({ day, minute: rint(w.r, 540, 1000), from: -2, to: i, amount: Math.min(w.cfg.cashThreshold * 0.8, lognormal(w.r, a.income / 22 * 0.6, 0.5)),
          type: "CASH_IN", patternId: -1, typology: null, family: null });
      }
    } else if (cash > 0 && w.r() < (a.segment === "sme" ? 0.05 : a.segment === "private" ? 0.002 : 0.006) * act * cash) {
      w.schedule({ day, minute: rint(w.r, 540, 1000), from: -2, to: i, amount: Math.min(w.cfg.cashThreshold * 0.45, lognormal(w.r, a.segment === "sme" ? 900 : 180, 0.7)),
        type: "CASH_IN", patternId: -1, typology: null, family: null });
    }

    // ---- crypto through the bank's crypto service: bitcoin bought and sent to the customer's own wallet or an exchange, or received and sold
    if (a.wallet) {
      const n = poisson(w.r, CRYPTO_LEGS.perDay * act);
      for (let k = 0; k < n; k++) {
        const buy = w.r() < CRYPTO_LEGS.buyShare;
        const own = w.r() < CRYPTO_LEGS.ownShare;
        const ex = w.ordinaryExchange();
        const wallet = own ? a.wallet : ex?.id ?? a.wallet;
        const amt = Math.min(w.bal[i] * 0.8, lognormal(w.r, 140, 0.9));
        if (buy && amt < 5) continue;
        // half the buys at an exchange are paid by Faster Payment to the exchange's own account, as a customer tops up an exchange account (an assumption, sources.json)
        if (buy && !own && w.r() < sources.assumptions.cryptoBuyByTransferShare) {
          w.schedule({ day, minute: w.minute("day"), from: i, to: -1, amount: amt, type: "TRANSFER", method: "fps", cpRef: `VASP-${rint(w.r, 0, 7)}`, payeeType: "business",
            payeeAgeDays: rint(w.r, 800, 3000), payee: { reason: "investment" }, patternId: -1, typology: null, family: null });
          continue;
        }
        w.schedule({ day, minute: w.minute("day"), from: buy ? i : -2, to: buy ? w.slotOf(wallet) : i, amount: buy ? amt : lognormal(w.r, 160, 0.9),
          type: buy ? "CRYPTO_OUT" : "CRYPTO_IN", wallet, walletClass: own ? "personal" : "exchange", patternId: -1, typology: null, family: null });
      }
    }
  }
}

/* ---- the normal transaction models ---- */

/** A payment between two customers here is sized for the smaller party: a person neither sends nor receives a corporate's sums in ordinary life. */
const pairMean = (w: World, a: number, b: number) => Math.min(w.typicalTransfer(a), w.typicalTransfer(b));

/** A dormant account takes no part in ordinary payments between customers. */
const awake = (w: World, i: number) => w.accounts[i].quietDaysBefore === 0;

function members(w: World, main: number, n: number, dir: "out" | "in" | "any"): number[] {
  // an account can be both a payee and a payer of main, so the pool is made unique before drawing (two draws of one account made a payment to itself)
  const pool = [...new Set(dir === "out" ? w.beneficiaries[main] : dir === "in" ? w.originators[main]
    : [...w.beneficiaries[main], ...w.originators[main]])].filter((i) => awake(w, i));
  const chosen = sampleK(w.r, pool, n);
  let tries = 0;
  while (chosen.length < n && tries++ < n * 50) {
    const c = rint(w.r, 0, w.accounts.length - 1);
    if (c !== main && awake(w, c) && !chosen.includes(c)) chosen.push(c);
  }
  return chosen;
}

export function scheduleNormalModels(w: World) {
  const cfg = w.cfg;
  const n = w.accounts.length;
  const kinds = Object.keys(cfg.normalPer1k) as NormalModel[];
  for (const kind of kinds) {
    const count = Math.round(cfg.normalPer1k[kind] * n / 1000 * (cfg.days / 90));
    for (let c = 0; c < count; c++) {
      const main = rint(w.r, 0, n - 1);
      if (!awake(w, main)) continue;
      const dur = Math.max(2, Math.min(cfg.days - 1, Math.round(lognormalLinear(w.r, 20, 10))));
      const start = rint(w.r, 0, Math.max(0, cfg.days - dur - 1));
      const end = start + dur;
      const level = sampleBurstiness(w.r, 0);
      // each leg is sized for the smaller of its two parties
      const amount = (a: number, b: number) => { const mean = pairMean(w, a, b); return truncNormal(w.r, mean, mean * 0.45, 5, mean * 12); };
      const base = { patternId: -1 as number, typology: null, family: null };
      const emitT = (day: number, from: number, to: number, amt: number, method?: Method) =>
        w.schedule({ day, minute: w.minute("day"), from, to, amount: amt, type: "TRANSFER", method, ...base });
      if (kind === "single") {
        const [to] = members(w, main, 1, "out");
        emitT(scheduleSteps(w.r, start, end, 1, level)[0], main, to, amount(main, to));
      } else if (kind === "fan_out") {
        // a firm's wage run goes by Bacs; a person paying several people pays by Faster Payments
        const ms = members(w, main, rint(w.r, 4, 12), "out");
        const bulk = w.accounts[main].segment !== "retail" && w.accounts[main].segment !== "private";
        const steps = bulk ? ms.map(() => start) : scheduleSteps(w.r, start, end, ms.length, level);
        ms.forEach((m, i) => emitT(steps[i], main, m, amount(main, m), bulk ? "bacs-credit" : undefined));
        ms.forEach((m) => w.knownPayee(main, m));
      } else if (kind === "fan_in") {
        const ms = members(w, main, rint(w.r, 4, 12), "in");
        const steps = scheduleSteps(w.r, start, end, ms.length, level);
        ms.forEach((m, i) => emitT(steps[i], m, main, amount(m, main)));
      } else if (kind === "forward") {
        const [b, cc] = members(w, main, 2, "any");
        const steps = scheduleSteps(w.r, start, end, 2, level);
        const amt = amount(main, b);
        emitT(steps[0], main, b, amt);
        emitT(Math.max(steps[1], steps[0] + 1), b, cc, Math.min(amt * truncNormal(w.r, 0.6, 0.2, 0.2, 0.95), 12 * pairMean(w, b, cc)));
      } else if (kind === "mutual") {
        // a loan between people is usually a round sum, and so is the repayment
        const [d] = members(w, main, 1, "any");
        const steps = scheduleSteps(w.r, start, end, 2, level);
        const amt = Math.max(50, Math.round(amount(main, d) / 50) * 50);
        emitT(steps[0], main, d, amt);
        emitT(Math.max(steps[1], steps[0] + 1), d, main, amt * (w.r() < 0.7 ? 1 : truncNormal(w.r, 1, 0.05, 0.5, 1.05)));
      } else if (kind === "periodical") {
        const [to] = members(w, main, 1, "out");
        const every = [7, 14, 28][rint(w.r, 0, 2)];
        const amt = Math.round(amount(main, to) / 5) * 5;
        w.knownPayee(main, to);
        for (let d = start; d < cfg.days; d += every) emitT(d, main, to, amt, "standing-order");
      }
    }
  }
}
