/* The shared state a run writes into: balances, the growing transaction
   log, the payee memory that decides whether a payment is a first payment,
   each customer's devices and security events, and the day-indexed schedule
   that every pattern writes into before the day loop executes it. Pattern
   modules never touch the log directly; they schedule, and the world emits,
   so every transaction gets the same bookkeeping: the rail and how it was
   paid, the calendar the rail runs on, the session, the payee and its name
   check, the card and its merchant, the crypto counterparty, the balances.

   The rails follow the register of sources (S06 to S16):
   Faster Payments at any hour up to the bank's per-payment limit, CHAPS on
   working days from 6am to 5.40pm above it, Bacs on working days only, cash
   machines up to GBP 500 a day, contactless up to GBP 100, cards with a
   merchant category code, payments abroad through SWIFT in the payee's
   currency, crypto on the Bitcoin chain its wallets come from. */

import { lognormal, normal, rint, truncNormal, weightedPick, type Rng } from "../rng";
import type {
  Account, AccountEvent, Adjustment, AccountRole, CardFacts, CaseLeg, CryptoFacts, Family, GenConfig, LegRole, LibraryRecord, Method, Party, PatternInstance,
  PatternKey, PayeeFacts, Rail, SessionFacts, Tx, TxType, WalletClass, WalletRef,
} from "./types";
import { CURRENCY_OF, HIGH_RISK_COUNTRIES, MEDIUM_RISK_COUNTRIES, ORDINARY_COUNTRIES } from "./types";
import { pickCountry } from "./population";
import type { Calendar } from "./calendar";
import sources from "./sources.json";
import ofacList from "../lists/ofac.json";

export interface Scheduled {
  day: number;
  minute: number;
  from: number;          // account id, or -2 for outside the data set
  to: number;            // account id, -1 for outside, or a wallet slot (-1000 - index)
  amount: number;
  type: TxType;
  country?: string;      // counterparty jurisdiction where it is not the account's own
  wallet?: string | null;
  walletClass?: WalletClass | null;
  patternId: number;
  typology: PatternKey | null;
  family: Family | null;
  role?: LegRole | null;
  caseId?: number;
  /** top the sender up first so the leg succeeds (laundering funds arriving) */
  fund?: boolean;
  /** the leg settles from money that arrived without a transaction, whatever the placement setting */
  hidden?: boolean;
  /** force the rail's method */
  method?: Method;
  /** force the rail (kept for older callers; the method decides it otherwise) */
  rail?: Rail;
  /** the leg may take the sender into its arranged overdraft instead of being funded */
  useOverdraft?: boolean;
  /** size the leg at emit time as a share of what the sender can still take (balance plus overdraft) */
  shareOfHeadroom?: number;
  /** a declined card authorisation */
  declined?: CardFacts["declineReason"];
  /** a stable id for the counterparty outside the data set */
  cpRef?: string;
  /** what the external payee's account is and how old, where the pattern knows */
  payeeType?: "personal" | "business";
  payeeAgeDays?: number | null;
  session?: Partial<SessionFacts>;
  payee?: Partial<PayeeFacts>;
  mcc?: number;
  merchant?: string;
  threeDS?: CardFacts["threeDS"];
  crypto?: Partial<CryptoFacts>;
  /** a leg of a library case: the case number and the leg's number in it. World.emit tells the planter (onLibraryLeg) when the leg is written or refused */
  leg?: { caseId: number; seq: number };
}

export const TYPICAL_TRANSFER: Record<Account["segment"], number> = {
  retail: 180, sme: 1400, corporate: 11000, private: 2400,
};

const METHOD_RAIL: Record<Method, Rail> = {
  fps: "FPS", "standing-order": "FPS", "forward-dated": "FPS", "direct-debit": "BACS", "bacs-credit": "BACS", chaps: "CHAPS",
  swift: "INTL", "card-chip": "CARD", "card-contactless": "CARD", "card-online": "CARD", "card-magstripe": "CARD",
  atm: "CASH", counter: "CASH", "partner-counter": "CASH", crypto: "CRYPTO", internal: "INTERNAL",
};
export const railOf = (m: Method): Rail => METHOD_RAIL[m];

const A = sources.assumptions;
const FPS_LIMIT = sources.fasterPayments.perPaymentGbp as Record<Account["segment"], number>;
const CHAPS_OPEN = sources.chaps.openMinute, CHAPS_CUTOFF = sources.chaps.customerCutoffMinute;
const ATM_LIMIT = sources.cash.atmDailyLimitGbp;
const LOW_VALUE = sources.sca.lowValueGbp;
const MCC_ORD = Object.entries(sources.mcc.ordinaryWeights).map(([k, v]) => [Number(k), v] as const);
const MCC_ABROAD = Object.entries(sources.mcc.abroadWeights).map(([k, v]) => [Number(k), v] as const);
const pickW = (r: Rng, table: readonly (readonly [number, number])[]) => table[weightedPick(r, table.map((x) => x[1]))][0];
const pickKey = <K extends string>(r: Rng, table: Record<string, number | string>): K => {
  const keys = Object.keys(table).filter((k) => typeof table[k] === "number");
  return keys[weightedPick(r, keys.map((k) => table[k] as number))] as K;
};
const OFAC = new Map(ofacList.bitcoin.map((e) => [e.address, e]));
export const isListed = (address: string | null | undefined): boolean => !!address && OFAC.has(address);

interface ExternalPayee { ref: string; type: "personal" | "business"; ageDays: number; bank: string; country: string }

export class World {
  cfg: GenConfig;
  r: Rng;
  cal: Calendar;
  accounts: Account[];
  bal: number[];
  emaBal: number[];
  txs: Tx[] = [];
  events: AccountEvent[] = [];
  /** money that arrived without a transaction (laundering funds on the hidden setting, or with placement switched off), so a balance can still be followed from the records */
  adjustments: Adjustment[] = [];
  patterns: PatternInstance[] = [];
  wallets: WalletRef[];
  banks: string[];
  beneficiaries: number[][];
  originators: number[][];
  degree: number[];
  /** the minutes (day * 1440 + minute) of the customer's password, phone, email, device and SIM changes, in any order */
  credChanges: number[][];
  /** the day an account stops acting for itself (a bust-out walks away); ordinary legs after it are dropped */
  silentFrom: number[];
  /** the customer's own device now, and when each device was first seen on the account */
  device: string[];
  private deviceSeen: Map<string, number>[];
  /** customers who use a VPN as a habit */
  vpnUser: boolean[];
  /** where the customer is today (a trip abroad sets it) */
  abroadOn: (acc: number, day: number) => string | null = () => null;
  /** cash taken at machines per account per day, for the GBP 500 limit */
  private atmToday = new Map<string, number>();
  private seen: Map<number, Set<string>> = new Map();
  /** the payers each account has received from: a customer here, a wallet, or an outside payer's reference */
  private payers: Map<number, Set<string>> = new Map();
  private extPayees: ExternalPayee[][];
  private walletById: Map<string, WalletRef>;
  private byDay: Scheduled[][];
  private nextTx = 0;
  nextPattern = 0;
  nextCase = 0;
  /** the library planter (patterns/plant.ts): the parties and the legs of the answer key, the record of what it planted, and the function that hears of each leg of a library case */
  parties: Party[] = [];
  caseLegs: CaseLeg[] = [];
  library: LibraryRecord | null = null;
  onLibraryLeg?: (s: Scheduled, tx: Tx | null) => void;

  constructor(cfg: GenConfig, r: Rng, cal: Calendar, accounts: Account[], wallets: WalletRef[], banks: string[],
    beneficiaries: number[][]) {
    this.cfg = cfg; this.r = r; this.cal = cal; this.accounts = accounts; this.wallets = wallets; this.banks = banks;
    this.beneficiaries = beneficiaries;
    this.originators = accounts.map(() => []);
    beneficiaries.forEach((bs, i) => bs.forEach((b) => this.originators[b].push(i)));
    this.degree = beneficiaries.map((bs, i) => bs.length + this.originators[i].length);
    this.bal = accounts.map((a) => a.initialBalance);
    this.emaBal = accounts.map((a) => a.initialBalance);
    this.credChanges = accounts.map(() => []);
    this.silentFrom = accounts.map(() => Number.POSITIVE_INFINITY);
    this.device = accounts.map((a) => a.deviceId);
    this.deviceSeen = accounts.map((a) => new Map([[a.deviceId, -10_000]]));
    this.vpnUser = accounts.map(() => r() < A.vpnUserShare);
    this.extPayees = accounts.map(() => []);
    this.walletById = new Map(wallets.map((w) => [w.id, w]));
    this.byDay = Array.from({ length: cfg.days }, () => []);
  }

  isOpen(acc: number, day: number) { return this.accounts[acc].openedDay <= day; }

  /** The method a leg is paid by, from its type, size and parties, where the caller did not say. */
  private methodFor(s: Scheduled): Method {
    if (s.method) return s.method;
    if (s.rail === "CARD") return "card-chip";
    switch (s.type) {
      case "INITIAL": return "internal";
      case "CRYPTO_IN": case "CRYPTO_OUT": return "crypto";
      case "CASH_IN": return this.cfg.products.cashServices === "partner" ? "partner-counter" : "counter";
      case "CASH_OUT": return s.amount <= ATM_LIMIT ? "atm" : "counter";
      case "SPEND": return s.from >= 0 && this.accounts[s.from].hasCard ? "card-chip" : "fps";
      case "INCOME": return s.country && s.country !== "GB" ? "swift" : "fps";
      default: {
        const abroad = s.to < 0 && s.country !== undefined && s.country !== "GB";
        if (abroad) return "swift";
        const seg = s.from >= 0 ? this.accounts[s.from].segment : "retail";
        return s.shareOfHeadroom !== undefined || s.amount <= FPS_LIMIT[seg] ? "fps" : "chaps";
      }
    }
  }

  /** Put a leg on the day it can run: Bacs and CHAPS only on working days, CHAPS inside its hours, a counter in branch hours. Returns true where it queued the leg and false at each of 3 early returns: a day outside the period, a payment of an account to itself and a slot of the rail after the period. */
  schedule(s: Scheduled): boolean {
    if (s.day < 0 || s.day >= this.cfg.days) return false;
    // an account never pays itself
    if (s.from >= 0 && s.from === s.to) return false;
    this.homeIfNoAbroad(s);
    const m = this.methodFor(s);
    s.method = m;
    if (m === "direct-debit" || m === "bacs-credit") {
      s.day = this.cal.nextWorking(s.day);
      s.minute = Math.min(s.minute, 360);
    } else if (m === "chaps") {
      if (!this.cal.working(s.day) || s.minute > CHAPS_CUTOFF) s.day = this.cal.nextWorking(s.minute > CHAPS_CUTOFF ? s.day + 1 : s.day);
      s.minute = Math.max(CHAPS_OPEN, Math.min(CHAPS_CUTOFF, s.minute));
    } else if (m === "counter" || m === "partner-counter") {
      // branch and Post Office counters: Monday to Saturday, 9am to 5pm, closed on bank holidays
      let d = s.day;
      while (this.cal.weekday(d) === 0 || this.cal.holiday(d)) d++;
      s.day = d;
      s.minute = Math.max(540, Math.min(1020, s.minute));
    }
    if (s.day >= this.cfg.days) return false;
    this.byDay[s.day].push(s);
    return true;
  }
  scheduledOn(day: number): Scheduled[] {
    return this.byDay[day].sort((a, b) => a.minute - b.minute);
  }

  /** A minute of the day drawn from a daytime, business-hours or night curve. */
  minute(kind: "day" | "business" | "night" | "evening" = "day"): number {
    let m: number;
    if (kind === "night") m = normal(this.r, 3 * 60, 70);
    else if (kind === "business") m = normal(this.r, 12.5 * 60, 130);
    else if (kind === "evening") m = normal(this.r, 20.5 * 60, 75);
    else m = this.r() < 0.85 ? normal(this.r, 14 * 60, 210) : normal(this.r, 21 * 60, 60);
    return Math.max(0, Math.min(1439, Math.round(m)));
  }

  /** A counterparty country. Domestic most of the time, and the patterns tilt it towards medium and high-risk places on purpose. */
  country(kind: "ordinary" | "medium" | "high" | "any-foreign" | "destination"): string {
    if (kind === "destination") return pickCountry(this.r, this.cfg.geography.corridorMix);
    if (kind === "high") return HIGH_RISK_COUNTRIES[rint(this.r, 0, HIGH_RISK_COUNTRIES.length - 1)];
    if (kind === "medium") return MEDIUM_RISK_COUNTRIES[rint(this.r, 0, MEDIUM_RISK_COUNTRIES.length - 1)];
    if (kind === "any-foreign") {
      const pool = ORDINARY_COUNTRIES.filter((c) => c !== "GB");
      return pool[rint(this.r, 0, pool.length - 1)];
    }
    return ORDINARY_COUNTRIES[rint(this.r, 0, ORDINARY_COUNTRIES.length - 1)];
  }

  /* ---------------------------------------------------------- payees */

  private firstPayment(from: number, key: string): boolean {
    let s = this.seen.get(from);
    if (!s) { s = new Set(); this.seen.set(from, s); }
    if (s.has(key)) return false;
    s.add(key);
    return true;
  }

  private firstReceipt(to: number, key: string): boolean {
    let s = this.payers.get(to);
    if (!s) { s = new Set(); this.payers.set(to, s); }
    if (s.has(key)) return false;
    s.add(key);
    return true;
  }

  /** Pre-load payee memory so an established account's regular payees are not all "first payments" on day one. The payee has received from the payer before, too. */
  knownPayee(from: number, to: number) {
    let s = this.seen.get(from);
    if (!s) { s = new Set(); this.seen.set(from, s); }
    s.add(`a${to}`);
    this.knownPayer(to, `a${from}`);
  }
  /** A payer the account received from before the period: a customer here (a + index), a wallet (w + address) or an outside payer's reference. */
  knownPayer(to: number, key: string) {
    let s = this.payers.get(to);
    if (!s) { s = new Set(); this.payers.set(to, s); }
    s.add(key);
  }
  knownRef(from: number, ref: string) {
    let s = this.seen.get(from);
    if (!s) { s = new Set(); this.seen.set(from, s); }
    s.add(ref);
  }

  /** Give an established customer the payees at other banks they already paid before the period, so paying them is not a first payment. */
  seedExternalPayees(acc: number, n: number) {
    for (let k = 0; k < n; k++) { const p = this.externalPayee(acc, { fresh: true }); this.knownRef(acc, p.ref); }
  }

  /** One of the customer's payees at other banks: a known one most of the time, a new one sometimes. */
  externalPayee(acc: number, opts: { fresh?: boolean; type?: "personal" | "business"; country?: string } = {}): ExternalPayee {
    const book = this.extPayees[acc];
    const fit = book.filter((p) => (!opts.type || p.type === opts.type) && (!opts.country || p.country === opts.country));
    if (!opts.fresh && fit.length && this.r() < 0.85) return fit[rint(this.r, 0, fit.length - 1)];
    const type = opts.type ?? (this.accounts[acc].segment === "retail" || this.accounts[acc].segment === "private" ? (this.r() < 0.75 ? "personal" : "business") : (this.r() < 0.8 ? "business" : "personal"));
    const p: ExternalPayee = { ref: `X${acc}-${book.length}`, type, ageDays: Math.round(lognormal(this.r, 2400, 0.8)), bank: `UK bank ${rint(this.r, 1, 30)}`, country: opts.country ?? "GB" };
    book.push(p);
    // payees the account had before the period are known; new ones are first payments
    return p;
  }

  headroom(acc: number) { return this.bal[acc] + this.accounts[acc].overdraftLimit; }

  /* ---------------------------------------------------------- wallets */

  private interned = new Map<string, string>();
  /** One string object per id, so a million card payments at sixty merchants hold sixty strings. */
  intern(sv: string): string { const x = this.interned.get(sv); if (x !== undefined) return x; this.interned.set(sv, sv); return sv; }

  private slots = new Map<string, number>();
  /** The slot a wallet address is written under when it is the payee: one slot per address, never shared (fault F4). */
  slotOf(address: string): number {
    let s = this.slots.get(address);
    if (s === undefined) { s = -1000 - this.slots.size; this.slots.set(address, s); }
    return s;
  }
  /** A wallet from the pool: its behaviour class and, where asked, its label. */
  poolWallet(classes: WalletClass[], label?: WalletRef["label"]): WalletRef | null {
    const pool = this.wallets.filter((x) => classes.includes(x.cls) && (!label || x.label === label));
    return pool.length ? pool[rint(this.r, 0, pool.length - 1)] : null;
  }
  /** An exchange wallet an ordinary customer uses: classed an exchange and labelled licit. */
  ordinaryExchange(): WalletRef | null { return this.poolWallet(["exchange"], "licit"); }
  typicalTransfer(acc: number) { return TYPICAL_TRANSFER[this.accounts[acc].segment]; }

  /* ---------------------------------------------------------- devices and security events */

  /** Record a security event on an account. A password, phone or email change, a new device and a SIM swap all count as a change of credentials. */
  event(acc: number, day: number, minute: number, kind: AccountEvent["kind"], opts: { deviceId?: string; ipCountry?: string; patternId?: number; typology?: PatternKey | null } = {}) {
    if (day < 0 || day >= this.cfg.days) return;
    const ev: AccountEvent = { account: acc, day, minute, kind, deviceId: opts.deviceId ?? null, ipCountry: opts.ipCountry ?? this.accounts[acc].country, patternId: opts.patternId ?? -1, typology: opts.typology ?? null };
    this.events.push(ev);
    if (kind === "password-reset" || kind === "phone-changed" || kind === "email-changed" || kind === "device-added" || kind === "sim-swap") {
      this.credChanges[acc].push(day * 1440 + minute);
    }
    if (kind === "device-added" && opts.deviceId && !this.deviceSeen[acc].has(opts.deviceId)) this.deviceSeen[acc].set(opts.deviceId, day);
    this.accounts[acc].phoneChanges += kind === "phone-changed" || kind === "sim-swap" ? 1 : 0;
  }

  /** The customer moves to a new phone: the device is registered and becomes theirs. */
  newOwnDevice(acc: number, day: number, minute: number) {
    const id = `dev-${acc.toString(36)}-${day}-${rint(this.r, 0, 9999).toString(36)}`;
    this.event(acc, day, minute, "device-added", { deviceId: id });
    this.device[acc] = id;
  }

  /** The session for a payment the customer started, with the ordinary rates of every signal; a pattern overrides what its criminal changes. */
  private sessionFor(acc: number, day: number, _minute: number, over: Partial<SessionFacts> = {}): SessionFacts {
    const a = this.accounts[acc];
    const table = a.segment === "retail" || a.segment === "private" ? A.sessionChannelRetail : A.sessionChannelBusiness;
    const channel = over.channel ?? pickKey<SessionFacts["channel"]>(this.r, table as unknown as Record<string, number>);
    const deviceId = over.deviceId ?? (channel === "branch" || channel === "telephone" ? `${channel}-${a.bank}` : this.device[acc]);
    const seen = this.deviceSeen[acc].get(deviceId);
    let newDevice: boolean;
    if (channel === "branch" || channel === "telephone") newDevice = false;
    else if (seen === undefined) { this.deviceSeen[acc].set(deviceId, day); newDevice = true; }
    else newDevice = day - seen <= A.newDeviceWindowDays;
    const trip = this.abroadOn(acc, day);
    return {
      channel, deviceId,
      newDevice: over.newDevice ?? newDevice,
      ipCountry: over.ipCountry ?? (trip ?? a.country),
      vpn: over.vpn ?? (this.vpnUser[acc] && this.r() < A.vpnSessionShareForUsers),
      remoteAccess: over.remoteAccess ?? (this.r() < A.remoteAccessShare),
      callActive: over.callActive ?? (this.r() < A.callActiveShare),
      seconds: over.seconds ?? Math.round(lognormal(this.r, A.sessionSecondsMedian, 0.6)),
    };
  }

  /* ---------------------------------------------------------- money */

  /** Laundering funds arriving, so a scheduled leg can settle. Visible as a cash deposit or an unexplained credit when the run says so. */
  fund(acc: number, needed: number, day: number, minute: number, how: "cash" | "credit",
    patternId: number, typology: PatternKey | null, family: Family | null, silent = false, caseId = -1) {
    const shortfall = needed - this.bal[acc];
    if (shortfall <= 0) return;
    // money arriving for a laundering pattern is placement; for a sanctions or fraud pattern it is the customer's own funding, no crime step
    const role: LegRole = family === "sanctions" || family === "fraud" ? "funding" : "placement";
    const amount = shortfall * 1.15;
    if (!this.cfg.visiblePlacement || silent) {
      this.bal[acc] += amount;
      this.adjustments.push({ account: acc, day, minute, amount: Math.round(amount * 100) / 100, patternId });
      return;
    }
    // the money arrives at the leg's own minute, just before it, so every balance follows in time order; cash only where a counter is open then
    const counterOpen = this.cfg.products.cashServices !== "none" && minute >= 540 && minute <= 1020 && this.cal.weekday(day) !== 0 && !this.cal.holiday(day);
    if (how === "cash" && counterOpen) {
      let left = amount;
      while (left > 0) {
        const slice = Math.min(left, truncNormal(this.r, this.cfg.cashThreshold * 0.7, this.cfg.cashThreshold * 0.2, 200, this.cfg.cashThreshold * 0.98));
        this.emit({ day, minute, from: -2, to: acc, amount: slice, type: "CASH_IN", method: this.cfg.products.cashServices === "partner" ? "partner-counter" : "counter", patternId, typology, family, role, caseId });
        left -= slice;
      }
    } else {
      const country = this.cfg.products.international && this.r() < 0.4 ? this.country("any-foreign") : "GB";
      this.emit({ day, minute, from: -2, to: acc, amount, type: "INCOME", country, method: country === "GB" ? "fps" : "swift", cpRef: `F${patternId}-${rint(this.r, 0, 3)}`, patternId, typology, family, role, caseId });
    }
  }

  /** A bank that does not send payments abroad sends the leg at home instead (the country pool it would have drawn from is closed). */
  private homeIfNoAbroad(s: Scheduled) {
    if (this.cfg.products.international) return;
    if (s.country && s.country !== "GB" && s.type !== "SPEND" && s.type !== "CASH_OUT" && s.method !== "card-online" && s.method !== "card-magstripe" && s.method !== "card-chip" && s.method !== "card-contactless") {
      s.country = "GB";
      if (s.method === "swift") s.method = undefined;
    }
  }

  /** Write a leg. A leg of a library case also tells the planter what happened to it, with the transaction or null. This wrapper draws no random number. */
  emit(s: Scheduled): Tx | null {
    const tx = this.emitLeg(s);
    if (s.leg && this.onLibraryLeg) this.onLibraryLeg(s, tx);
    return tx;
  }

  private emitLeg(s: Scheduled): Tx | null {
    this.homeIfNoAbroad(s);
    const from = s.from, to = s.to;
    if (from >= 0 && !this.isOpen(from, s.day)) return null;
    if (to >= 0 && !this.isOpen(to, s.day)) return null;
    // an account that walked away does nothing ordinary after that day
    if (from >= 0 && s.patternId < 0 && s.day >= this.silentFrom[from]) return null;
    const method = this.methodFor(s);
    const rail = railOf(method);
    const declined = rail === "CARD" && s.declined ? s.declined : null;
    let amount = s.shareOfHeadroom !== undefined && from >= 0 ? Math.max(0, this.headroom(from)) * s.shareOfHeadroom : s.amount;
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) return null;
    // a Faster Payment above the bank's per-payment limit is refused, so a leg sized at run time is kept to it (register S06)
    if ((method === "fps" || method === "standing-order" || method === "forward-dated") && from >= 0) amount = Math.min(amount, FPS_LIMIT[this.accounts[from].segment]);
    if (method === "atm" && from >= 0) {
      // machines pay notes: round down to GBP 10, and at most the day's limit
      const key = `${from}:${s.day}`, used = this.atmToday.get(key) ?? 0;
      amount = Math.min(Math.floor(amount / 10) * 10, ATM_LIMIT - used);
      if (amount < 10) return null;
      this.atmToday.set(key, used + amount);
    }
    if (from >= 0 && !declined) {
      if (s.fund) this.fund(from, amount, s.day, s.minute, s.type === "CASH_OUT" ? "cash" : "credit", s.patternId, s.typology, s.family, !!s.hidden, s.caseId ?? -1);
      // a victim pays with their own money: never topped up, and never beyond what they hold (a card keeps working into the overdraft)
      const victimLeg = s.role === "victim-payment" || s.role === "account-drain" || s.role === "card-spend" || s.role === "card-test";
      const canTake = s.useOverdraft || s.patternId < 0 || victimLeg ? this.headroom(from) : this.bal[from];
      if (canTake < amount) {
        if (s.patternId >= 0 && !s.useOverdraft && !victimLeg) this.fund(from, amount, s.day, s.minute, "credit", s.patternId, s.typology, s.family, !!s.hidden, s.caseId ?? -1);
        else if (method === "atm") return null;
        else amount = Math.floor(Math.max(0, canTake) * 0.9 * 100) / 100;
        if (amount < 1) return null;
      }
      this.bal[from] -= amount;
    }
    if (to >= 0 && !declined) this.bal[to] += amount;
    // an account here is a UK account: a transfer between two of them is domestic whatever the holder's home
    const country = s.country ?? "GB";
    const facts = this.factsFor(s, method, amount, country);
    // a credit's payer, keyed as the payee memory keys a payee; cash paid in has no payer
    const credit = to >= 0 && !declined && (s.type === "TRANSFER" || s.type === "INCOME" || s.type === "CRYPTO_IN");
    const newPayer = credit && this.firstReceipt(to, from >= 0 ? `a${from}` : rail === "CRYPTO" ? `w${s.wallet}` : facts.cpRef ?? "external");
    const now = s.day * 1440 + s.minute;
    const recentCredentialChange = from >= 0 && this.credChanges[from].some((c) => c <= now && now - c <= 2880);
    const tx: Tx = {
      id: this.nextTx++,
      day: s.day, minute: s.minute, type: s.type, rail, method,
      status: declined ? "declined" : "settled",
      amount,
      currency: rail === "INTL" ? (CURRENCY_OF[country] ?? "USD") : "GBP",
      orig: from, dest: to,
      cpRef: facts.cpRef,
      wallet: s.wallet ?? null, walletClass: s.walletClass ?? null,
      bankOrig: from >= 0 ? this.accounts[from].bank : rail === "CRYPTO" ? "wallet" : "external",
      bankDest: to >= 0 ? this.accounts[to].bank : rail === "CRYPTO" ? "wallet" : "external",
      country,
      newPayee: facts.newPayee,
      newPayer,
      recentCredentialChange,
      destSegment: to >= 0 ? this.accounts[to].segment : null,
      balOrigAfter: from >= 0 ? Math.round(this.bal[from] * 100) / 100 : 0,
      balDestAfter: to >= 0 ? Math.round(this.bal[to] * 100) / 100 : 0,
      session: facts.session, payee: facts.payee, card: facts.card, crypto: facts.crypto,
      patternId: s.patternId, typology: s.typology, family: s.family, role: s.role ?? null, caseId: s.caseId ?? -1,
    };
    this.txs.push(tx);
    return tx;
  }

  /** The facts a rule may read, filled from the leg and the parties. */
  private factsFor(s: Scheduled, method: Method, amount: number, country: string): { cpRef: string | null; newPayee: boolean; session: SessionFacts | null; payee: PayeeFacts | null; card: CardFacts | null; crypto: CryptoFacts | null } {
    const from = s.from, to = s.to;
    const rail = railOf(method);
    let cpRef: string | null = s.cpRef ?? null;
    let newPayee = false, session: SessionFacts | null = null, payee: PayeeFacts | null = null, card: CardFacts | null = null, crypto: CryptoFacts | null = null;
    if (rail === "CRYPTO") {
      cpRef = s.wallet ?? cpRef;
      const ref = s.wallet ? this.walletById.get(s.wallet) : undefined;
      const listed = isListed(s.wallet);
      const kind: CryptoFacts["counterparty"] = s.crypto?.counterparty ?? (listed ? "service" : s.walletClass === "exchange" ? "exchange" : s.walletClass === "personal" ? "self-hosted" : "service");
      const own = kind === "self-hosted" && from >= 0 && this.accounts[from].wallet === s.wallet || kind === "self-hosted" && to >= 0 && this.accounts[to].wallet === s.wallet;
      const line = this.cfg.travelRuleThreshold;
      const travelRule: CryptoFacts["travelRule"] = s.crypto?.travelRule ?? (kind === "exchange" ? (this.r() < 0.97 ? "complete" : "requested-not-received")
        : own || amount < line ? "not-required" : this.r() < 0.9 ? "requested-received" : "requested-not-received");
      crypto = {
        chain: "bitcoin",
        label: s.crypto?.label !== undefined ? s.crypto.label : listed ? "listed" : ref?.label ?? "unknown",
        predicted: s.crypto?.predicted !== undefined ? s.crypto.predicted : listed ? null : ref?.predicted ?? null,
        confidence: s.crypto?.confidence !== undefined ? s.crypto.confidence : listed ? null : ref?.conf ?? null,
        counterparty: kind,
        travelRule,
        ownershipProven: s.crypto?.ownershipProven ?? (kind === "self-hosted" ? own : null),
      };
      if (s.type === "CRYPTO_OUT" && from >= 0) {
        newPayee = this.firstPayment(from, `w${s.wallet}`);
        session = this.sessionFor(from, s.day, s.minute, s.session);
      }
      return { cpRef, newPayee, session, payee, card, crypto };
    }
    if (rail === "CARD") {
      const trip = from >= 0 ? this.abroadOn(from, s.day) : null;
      const mcc = s.mcc ?? pickW(this.r, country !== "GB" || trip ? MCC_ABROAD : MCC_ORD);
      const merchant = s.merchant ?? this.intern(`M${mcc}-${country}-${rint(this.r, 0, 59)}`);
      cpRef = merchant;
      let threeDS: CardFacts["threeDS"] = "not-applicable";
      if (method === "card-online") {
        const outside = country !== "GB" && !["IE", "FR", "DE", "ES", "NL", "IT", "PT", "PL", "RO", "LT"].includes(country);
        threeDS = s.threeDS ?? (outside ? pickKey(this.r, A.threeDSOutsideUkEea as unknown as Record<string, number>)
          : amount <= LOW_VALUE && this.r() < 0.7 ? "exempt-low-value" : pickKey(this.r, { authenticated: A.threeDSUk.authenticated, "exempt-recurring": A.threeDSUk["exempt-recurring"], "not-attempted": A.threeDSUk["not-attempted"] }));
      }
      card = { mcc, merchant, threeDS, declineReason: s.declined ?? null, settledDay: this.cal.nextWorking(s.day + 1) };
      return { cpRef, newPayee, session, payee, card, crypto };
    }
    if (rail === "CASH" || rail === "INTERNAL") return { cpRef: null, newPayee, session, payee, card, crypto };
    // bank payments: Faster Payments, Bacs, CHAPS, SWIFT
    if (from >= 0 && (s.type === "TRANSFER" || s.type === "SPEND" && method === "fps")) {
      let accountType: PayeeFacts["accountType"], ageDays: number | null;
      if (to >= 0) {
        const d = this.accounts[to];
        accountType = d.segment === "retail" || d.segment === "private" ? "personal" : "business";
        ageDays = s.day - d.openedDay;
        cpRef = null;
        newPayee = this.firstPayment(from, `a${to}`);
      } else {
        if (!cpRef) {
          const p = this.externalPayee(from, { type: s.payeeType, country: country === "GB" ? undefined : country });
          cpRef = p.ref; accountType = p.type; ageDays = s.payeeAgeDays !== undefined ? s.payeeAgeDays : null;
        } else { accountType = s.payeeType ?? "business"; ageDays = s.payeeAgeDays ?? null; }
        newPayee = this.firstPayment(from, cpRef);
      }
      const automatic = method === "standing-order" || method === "forward-dated" || method === "direct-debit" || method === "bacs-credit";
      payee = {
        cop: newPayee && country === "GB" && method !== "direct-debit" ? (s.payee?.cop ?? pickKey<NonNullable<PayeeFacts["cop"]>>(this.r, A.copOrdinaryNewPayee as unknown as Record<string, number>)) : null,
        accountType: s.payee?.accountType ?? accountType,
        accountAgeDays: s.payee?.accountAgeDays !== undefined ? s.payee.accountAgeDays : ageDays,
        reason: newPayee ? (s.payee?.reason ?? pickKey<NonNullable<PayeeFacts["reason"]>>(this.r, A.reasonOrdinaryNewPayee as unknown as Record<string, number>)) : (s.payee?.reason ?? null),
        // an exchange's collection account: the generator names its exchange payees VASP-n, and the bank's list recognises them
        cryptoExchange: cpRef !== null && cpRef.startsWith("VASP-"),
      };
      if (!automatic) session = this.sessionFor(from, s.day, s.minute, s.session);
    }
    return { cpRef, newPayee, session, payee, card, crypto };
  }

  newPattern(typology: PatternKey, family: Family, accounts: number[], main: number,
    startDay: number, endDay: number, story: string, opts: { caseId?: number; roles?: Record<number, AccountRole>; sources?: string[] } = {}): PatternInstance {
    const p: PatternInstance = {
      id: this.nextPattern++, typology, family, caseId: opts.caseId ?? this.nextCase++, accounts: [...new Set(accounts)], main,
      roles: opts.roles ?? {},
      startDay, endDay: Math.min(this.cfg.days - 1, endDay), txCount: 0, total: 0, story, sources: opts.sources ?? [],
    };
    this.patterns.push(p);
    for (const a of p.accounts) {
      const acc = this.accounts[a];
      acc.patterns.push(p.id);
      if (!p.roles[a]) p.roles[a] = family === "fraud" ? "victim" : family === "sanctions" ? "exposed" : family === "mule" ? "mule" : "launderer";
      if (family === "aml" || family === "crypto" || family === "mule") acc.isSar = true;
    }
    return p;
  }

  /** Add an account to a pattern after it was made (a victim a mule network draws in). */
  join(p: PatternInstance, acc: number, role: AccountRole) {
    if (!p.accounts.includes(acc)) { p.accounts.push(acc); this.accounts[acc].patterns.push(p.id); }
    p.roles[acc] = role;
  }
}
