/* The types of the 2 file formats of the pattern library, of the plan and the priced case that the expander makes from
   them, and the lists of allowed values that the validator and the expander share. A part file holds one piece of a
   method (a source, a way of hiding the funds or a cash-out) and a pattern file joins a source part, hiding parts and
   a cash-out part. The form of a file follows the paper of register S58: parties and typed links, required and
   supporting steps, what varies, what can be seen and a source for each link. docs/PATTERN_FORMAT.md is the
   specification of both formats. This file imports the generator's label tables and nothing else. */

import { FAMILY_LABEL, type AccountRole, type Family, type LegRole, type Method, type PayeeFacts, type Segment } from "../types";
import { ACCOUNT_ROLE, LEG_ROLE } from "../dictionary";

export type { AccountRole, Family, LegRole, Method, Segment };

/** The type of a list that holds every member of a union and nothing else: a new member of the union stops the build. */
type Every<U extends string, L extends readonly U[]> = [Exclude<U, L[number]>] extends [never] ? L : never;

// ---------- the lists of allowed values ----------

/** The 5 families, from the keys of FAMILY_LABEL. */
export const FAMILIES = Object.keys(FAMILY_LABEL) as Family[];
/** The roles of a customer in a planted pattern, from the keys of ACCOUNT_ROLE. */
export const ROLES = Object.keys(ACCOUNT_ROLE) as AccountRole[];
/** The roles of a leg, from the keys of LEG_ROLE. */
export const LEG_ROLES = Object.keys(LEG_ROLE) as LegRole[];

const METHOD_LIST = ["fps", "standing-order", "forward-dated", "direct-debit", "bacs-credit", "chaps", "swift", "card-chip",
  "card-contactless", "card-online", "card-magstripe", "atm", "counter", "partner-counter", "crypto", "internal"] as const satisfies readonly Method[];
/** Every method of a payment (the union Method of ../types). */
export const METHODS: Every<Method, typeof METHOD_LIST> = METHOD_LIST;

type Reason = NonNullable<PayeeFacts["reason"]>;
const REASON_LIST = ["friends-family", "goods-services", "bill", "own-account", "investment", "invoice", "tax-or-fine", "other"] as const satisfies readonly Reason[];
/** Every reason that a payer gives for a payment (PayeeFacts.reason of ../types). */
export const REASONS: Every<Reason, typeof REASON_LIST> = REASON_LIST;

const SEGMENT_LIST = ["retail", "sme", "corporate", "private"] as const satisfies readonly Segment[];
/** Every segment of a customer (the union Segment of ../types). */
export const SEGMENTS: Every<Segment, typeof SEGMENT_LIST> = SEGMENT_LIST;

/** The 5 assets on a chain, written as symbol, at sign and chain. */
export const PAIRS = ["BTC@bitcoin", "ETH@ethereum", "USDT@ethereum", "USDT@tron", "USDC@ethereum"] as const;
/** The assets that a step may name. */
export const ASSETS = ["GBP", "cash", "BTC", "ETH", "USDT", "USDC", "XMR"] as const;
/** The chains of a party. */
export const CHAINS = ["bitcoin", "ethereum", "tron"] as const;
/** The status of a file. */
export const STATUSES = ["draft", "tested", "stable", "retired"] as const;
/** The kinds of a party. */
export const PARTY_KINDS = ["customer", "wallet", "exchange", "otc-desk", "payment-platform", "mixer", "bridge", "dex", "pool",
  "gambling-site", "market", "crypto-atm", "broker", "merchant", "swap-service", "cash", "outside-account"] as const;
/** The ways in which a step moves money. */
export const VIAS = ["fps", "chaps", "swift", "cash-in", "cash-out", "card", "bank-crypto", "chain", "off-record"] as const;
/** The rails of the bank, which are the ways that a bank records. */
export const RAILS = ["fps", "chaps", "swift", "cash-in", "cash-out", "card", "bank-crypto"] as const;
/** The 10 behaviour classes that a screening tool reports. They are the 10 texts that classOf in generate.ts maps to a wallet class. */
export const CLASSES = ["centralized exchange", "tumbler", "money laundering", "darknet market", "blackmail",
  "cyber-security service", "gambling", "individual wallet", "P2P financial service", "P2P financial infrastructure"] as const;
/** The kinds of part. */
export const PART_KINDS = ["source", "hiding", "cash-out"] as const;
/** The ends of a pattern that a bank can see. */
export const BANK_SEES = ["source", "cash-out", "both"] as const;
/** The countries that an outside account can have. */
export const COUNTRIES = ["GB", "ordinary", "corridor", "high-risk"] as const;

export type Pair = (typeof PAIRS)[number];
export type Asset = (typeof ASSETS)[number];
export type Chain = (typeof CHAINS)[number];
export type Status = (typeof STATUSES)[number];
export type PartyKind = (typeof PARTY_KINDS)[number];
export type Via = (typeof VIAS)[number];
export type Rail = (typeof RAILS)[number];
export type TraceClass = (typeof CLASSES)[number];
export type PartKind = (typeof PART_KINDS)[number];
export type BankSees = (typeof BANK_SEES)[number];
export type Country = (typeof COUNTRIES)[number];

/** True where the way is a rail of the bank. */
export const isRail = (v: string): v is Rail => (RAILS as readonly string[]).includes(v);

// ---------- the shared shapes of a file ----------

/** A range [low, high] with low at most high. */
export type Range = [number, number];
/** A wait: exactly one of minutes, hours or days. */
export interface Wait { minutes?: Range; hours?: Range; days?: Range }
/** The basis of a figure: a source and its pages, or an assumption. */
export type Basis =
  | { kind: "reported"; ref: string; note: string; pages?: string }
  | { kind: "assumed"; note: string };
/** One source that a file cites. */
export interface Reference { id: string; pages?: string; note?: string }

/** How a customer party is filled from the accounts of the bank. */
export interface CustomerPick {
  segments?: Segment[]; minAge?: number; maxAge?: number; openedWithinDays?: number;
  hasWallet?: boolean; hasCard?: boolean; cashBusiness?: boolean; balance?: "top-quarter";
}
/** A wallet that a screening tool may already label. */
export interface KnownWallet { chance: number; class: TraceClass; basis: Basis }
/** A party of a part: a customer of the bank or an outside party. */
export interface Party {
  id: string; kind: PartyKind; label: string;
  role?: AccountRole; count?: Range; pick?: CustomerPick;
  chain?: Chain; reuse?: "leg" | "case"; country?: Country; known?: KnownWallet;
}

/** The facts of a payment in the bank's records. The field payeeType maps to PayeeFacts.accountType when a leg is written. */
export interface StepFacts {
  method?: Method; mcc?: number; reason?: Reason; payeeType?: "personal" | "business";
  callActive?: boolean; remoteAccess?: boolean; newDevice?: boolean;
}

/** The amount of a leg. */
export type Amount =
  | { of: "value" | "held" | "leg"; share: Range }
  | { gbp: Range }
  | { under: "cashThreshold" | "travelRuleThreshold"; share: Range };

/** When a step starts: after the case, the entry or an earlier step, with one wait. */
export interface Start extends Wait { after: string; per?: "leg" }

/** The fields that every step has. */
interface StepBase {
  id: string; say: string; from: string; to: string; via: Via | Via[]; asset: Asset | "in" | "out";
  amount: Amount; start: Start; need: "required" | "supporting"; chance?: number;
  varies: "stable" | "rotating" | "ephemeral"; legRole?: LegRole; facts?: StepFacts; basis: Basis;
}
/** A move: a number of legs from one party to another. */
export interface MoveStep extends StepBase {
  kind: "move"; times?: Range; between?: Wait; split?: "even" | "uneven" | "rising"; pays?: "case" | "own"; each?: string;
}
/** What a chain peels off at each hop. */
export interface Peel { to: string; share: Range; say: string; via?: Via | Via[]; fromHop?: number }
/** A chain: the funds pass through a run of parties. */
export interface ChainStep extends StepBase {
  kind: "chain"; through: { party: string } | { new: PartyKind; count: Range }; between?: Wait; peel?: Peel;
}
/** A split: the funds go to a number of new wallets and may be gathered again. */
export interface SplitStep extends StepBase {
  kind: "split"; ways: Range; over: Wait; gather?: boolean;
}
export type Step = MoveStep | ChainStep | SplitStep;

/** The value of a source part. */
export type SourceValue =
  | { log: Range; capByBalance?: number; basis: Basis }
  | { from: "steps"; basis: Basis };

/** The fields that every part has. */
interface PartBase {
  schema: "touchstone-part/1"; id: string; title: string; short: string; summary: string; status: Status;
  references: Reference[]; parties: Party[]; steps: Step[]; family?: Family;
}
/** A part that starts a case. */
export interface SourcePart extends PartBase {
  kind: "source"; value: SourceValue; traceClass: TraceClass; gives: Pair[]; exit: string;
}
/** A route of a hiding part: the asset that it takes and the asset that it gives. */
export interface Route { from: Pair | "any"; to: Pair | "same" }
/** A part that hides the trail. */
export interface HidingPart extends PartBase {
  kind: "hiding"; routes: Route[]; entry: string; exit: string; hides: { chance: number; basis: Basis };
}
/** A part that takes the funds out. */
export interface CashOutPart extends PartBase {
  kind: "cash-out"; takes: "any" | Pair[]; entry: string;
}
export type Part = SourcePart | HidingPart | CashOutPart;

/** A pattern: a source part, hiding parts and a cash-out part. */
export interface Pattern {
  schema: "touchstone-pattern/1"; id: string; title: string; short: string; summary: string; status: Status;
  parts: { source: string; hiding: string[]; cashOut: string };
  bankSees: BankSees; per1k: number; value?: { log: Range; basis: Basis }; references: Reference[];
}

/** The parts of a library, by id, as a Map or as a plain object. */
export type PartLookup = ReadonlyMap<string, Part> | Readonly<Record<string, Part>>;

/** The result of a check of a file. */
export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// ---------- the plan and the priced case ----------

/** The settings of one case. size and speed run from 0.25 to 4. atMax takes the upper end of every range and draws nothing. */
export interface PlanSettings {
  size?: number; speed?: number; bankSees?: BankSees; atMax?: boolean; cashThreshold?: number; travelRuleThreshold?: number;
}
/** How the amount of a leg is found when the case is priced. */
export interface LegSpec {
  form: "value" | "held" | "leg" | "all" | "gbp" | "under";
  frac?: number; parent?: number; live?: boolean; pounds?: number;
}
/** Whether the bank, a chain or no one records a leg. */
export type SeenBy = "bank" | "chain" | "none";
/** A leg of a plan, before it is priced. */
export interface PlanLeg {
  seq: number; part: string; step: string; minute: number; from: string; to: string; via: Via; asset: string;
  chain: Chain | null; seenBy: SeenBy; say: string; legRole: LegRole | null; need: "required" | "supporting";
  pays: "case" | "own"; run: number; first: boolean; spec: LegSpec;
}
/** A party of a plan. */
export interface PlanParty {
  key: string; group: string; part: string; end: PartKind; kind: PartyKind; label: string; chain: Chain | null; cust: boolean;
}
/** One run of a step: how many legs it drew. */
export interface PlanRun { id: number; part: string; step: string; kind: "move" | "chain" | "split"; n: number }
/** The plan of one case: every draw is made, and no amount is priced. */
export interface Plan {
  pattern: string;
  settings: { size: number; speed: number; bankSees: BankSees };
  assets: { part: string; in: Pair; out: Pair }[];
  thresholds: { cashThreshold: number | null; travelRuleThreshold: number | null };
  counts: Record<string, number>;
  runs: PlanRun[];
  value: { u: number; part: string; log: Range | null; steps: boolean; cap: number | null };
  parties: PlanParty[];
  legs: PlanLeg[];
}
/** A party of a priced case. */
export interface CaseParty { key: string; group: string; part: string; end: PartKind; kind: PartyKind; label: string; chain: Chain | null }
/** A leg of a priced case, with its amount in pounds. */
export interface CaseLeg {
  seq: number; part: string; step: string; minute: number; from: string; to: string; via: Via; asset: string; chain: Chain | null;
  amount: number; seenBy: SeenBy; say: string; legRole: LegRole | null; need: "required" | "supporting"; pays: "case" | "own";
}
/** A priced case. */
export interface PricedCase { value: number; parties: CaseParty[]; legs: CaseLeg[] }

// ---------- the join of the assets ----------

const lookup = (m: PartLookup, id: string): Part | undefined => (m instanceof Map ? m.get(id) : (m as Readonly<Record<string, Part>>)[id]);

/** Check 8: the asset in and out of each part, in order [source, ...hiding, cashOut], or null when they do not join. */
export function resolveAssets(pattern: Pattern, partsById: PartLookup): { in: Pair; out: Pair }[] | null {
  const src = lookup(partsById, pattern.parts.source), co = lookup(partsById, pattern.parts.cashOut);
  if (!src || src.kind !== "source" || !co || co.kind !== "cash-out") return null;
  const hid: HidingPart[] = [];
  for (const id of pattern.parts.hiding) {
    const h = lookup(partsById, id);
    if (!h || h.kind !== "hiding") return null;
    hid.push(h);
  }
  const go = (i: number, cur: Pair, acc: { in: Pair; out: Pair }[]): { in: Pair; out: Pair }[] | null => {
    if (i === hid.length) return co.takes === "any" || (Array.isArray(co.takes) && co.takes.includes(cur)) ? [...acc, { in: cur, out: cur }] : null;
    for (const r of hid[i].routes) { // the first route that fits, tried in file order
      if (r.from !== "any" && r.from !== cur) continue;
      const to: Pair = r.to === "same" ? cur : r.to, res = go(i + 1, to, [...acc, { in: cur, out: to }]);
      if (res) return res;
    }
    return null;
  };
  for (const g of src.gives) { const res = go(0, g, [{ in: g, out: g }]); if (res) return res; }
  return null;
}

// ---------- the uses of a part and the chains of a party ----------

/** The id of a part from the id of one of its uses: the text before the character ~, or the whole text where it holds none. */
export function partIdOf(use: string): string {
  const i = use.indexOf("~");
  return i < 0 ? use : use.slice(0, i);
}

/** The ids of the uses of a pattern in the order source part, hiding parts and cash-out part. The first use of a part has the id of the part, and a later use has that id, the character ~ and its number, such as mixer~2. */
export function usesOf(pattern: Pattern): string[] {
  const seen: Record<string, number> = {};
  return [pattern.parts.source, ...pattern.parts.hiding, pattern.parts.cashOut].map((id) => {
    seen[id] = (seen[id] ?? 0) + 1;
    return seen[id] === 1 ? id : `${id}~${seen[id]}`;
  });
}

/** The symbol and the chain of a payment. Only a payment by the way chain or bank-crypto has a chain, and a payment in XMR has none. The assets are those that the use takes in and gives out. */
export function legChain(via: Via, asset: Step["asset"], assets: { in: Pair; out: Pair }): { sym: string; chain: Chain | null } {
  const pair: Pair | null = asset === "in" ? assets.in : asset === "out" ? assets.out : null;
  const sym = pair ? pair.split("@")[0] : asset;
  const hit: string | undefined = pair ?? [assets.in, assets.out, ...PAIRS].find((x) => x.startsWith(sym + "@"));
  const chain = (via === "chain" || via === "bank-crypto") && sym !== "XMR" && hit ? (hit.split("@")[1] as Chain) : null;
  return { sym, chain };
}

/** A payment that can carry a chain: the use and the step that make it (the step is handoff for a hand-off), its chain, whether its way is bank-crypto, and each party that it names with the id of the use of that party. */
export interface ChainPayment { use: string; step: string; chain: Chain; bankCrypto: boolean; parties: { use: string; party: Party }[] }

/** Walks a pattern as the expander does and lists each payment that can carry a chain, in the order of the walk. The list is empty where the assets of the pattern do not join. */
export function chainPayments(pattern: Pattern, parts: PartLookup): ChainPayment[] {
  const assets = resolveAssets(pattern, parts);
  if (!assets) return [];
  const uses = usesOf(pattern), out: ChainPayment[] = [];
  const named = (use: string, id: string): { use: string; party: Party }[] => {
    const party = lookup(parts, partIdOf(use))?.parties.find((x) => x.id === id);
    return party ? [{ use, party }] : [];
  };
  const record = (use: string, step: string, via: Via, asset: Step["asset"], pair: { in: Pair; out: Pair }, parties: { use: string; party: Party }[]): void => {
    const { chain } = legChain(via, asset, pair);
    if (chain) out.push({ use, step, chain, bankCrypto: via === "bank-crypto", parties });
  };
  uses.forEach((use, i) => {
    const part = lookup(parts, partIdOf(use));
    if (!part) return;
    if (i > 0) { // the hand-off: the exit party of the earlier use to the entry party of this use
      const before = lookup(parts, partIdOf(uses[i - 1]));
      const exit = before && before.kind !== "cash-out" ? before.exit : "", entry = part.kind !== "source" ? part.entry : "";
      record(use, "handoff", "chain", "in", assets[i], [...named(uses[i - 1], exit), ...named(use, entry)]);
    }
    for (const step of part.steps) {
      const ends = [...named(use, step.from), ...named(use, step.to)];
      if (step.kind === "chain" && "party" in step.through) ends.push(...named(use, step.through.party));
      for (const via of ([] as Via[]).concat(step.via)) record(use, step.id, via, step.asset, assets[i], ends);
      if (step.kind === "chain" && step.peel) {
        const peel = step.peel, ways = ([] as Via[]).concat(peel.via ?? step.via);
        for (const via of ways) record(use, step.id, via, step.asset, assets[i], named(use, peel.to));
      }
    }
  });
  return out;
}

/** The chains on which a payment can name each party, by the key use id, a full stop and party id (the group of the party in a plan). A party that is new for each payment has no entry, and nor has a party that no payment with a chain names. A set lists its chains in the order in which the walk first met them. */
export function partyChains(pattern: Pattern, parts: PartLookup): Map<string, Set<Chain>> {
  const map = new Map<string, Set<Chain>>();
  for (const pay of chainPayments(pattern, parts))
    for (const { use, party } of pay.parties) {
      if (party.reuse === "leg") continue;
      const key = `${use}.${party.id}`;
      (map.get(key) ?? map.set(key, new Set<Chain>()).get(key)!).add(pay.chain);
    }
  return map;
}
