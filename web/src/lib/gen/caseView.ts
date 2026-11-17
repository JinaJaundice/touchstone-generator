// The data of a drawn case: a planted case of the generator turned into parties and legs, so that a screen can
// draw who paid whom and when. A pure module with no React and no DOM. A case of a library pattern is read from the
// 2 further tables of the data set (parties and case legs), and the typical case of a library pattern from its files.

import { LEG_ROLE } from "./dictionary";
import { PARTS, patternOf } from "./patterns/index";
import { typicalCase } from "./patterns/expand";
import { partIdOf, usesOf } from "./patterns/types";
import labelsFile from "./patterns/labels.json";
import { patternLabel, type AccountRole, type Dataset, type LibraryCase, type Family, type PatternInstance, type Tx } from "./types";

/** One party of a case: an account of the bank, or someone outside it. */
export interface FlowParty {
  key: string;      // "a" and the account id for an account of the bank, "x:" and a reference for an outside party
  group: string;    // the parties that may share a column: "a:" and the role, or "x:" and the kind
  label: string;    // the customer id of an account, or the generic label of an outside party
  partLabel: string | null;   // the label of the party in its part file, or null for a party of a built-in case
  kind: string;     // "customer", "merchant", "account-elsewhere", "payer", "wallet", "cash-in", "cash-out" or "outside"
  role: AccountRole | null;
  family: Family | null;   // the family of the planted pattern that gives the account its role
  account: number | null;
  address: string | null;
  part: string | null;     // the id of the use of the part, or null for a case of a built-in pattern
  end: "source" | "hiding" | "cash-out" | null;   // null for a case of a built-in pattern
}
/** One payment of a case, from one party to another. */
export interface FlowLeg {
  seq: number; step: string; say: string; day: number; minute: number;
  from: string; to: string; how: string; rail: string; asset: string;
  amount: number; planned: number | null; seenBy: "bank" | "chain" | "none";
  tx: number | null; declined: boolean;
}
/** The line of a case in a list of cases. */
export interface CaseSummary { caseId: number; title: string; keys: string[]; families: Family[]; value: number; legs: number; startDay: number }
/** A whole case: its summary, its parties and its legs. */
export interface CaseView extends CaseSummary {
  parties: FlowParty[]; rows: FlowLeg[]; endDay: number;
  useLabels: Record<string, string>;   // the words of each use of a part that the pattern names more than once, by the id of the use; empty for any other case
}
/** One column of the drawing: a party, or a group of parties that share a column. */
export interface FlowColumn {
  key: string;       // the group, or the key of a party that has a column of its own
  label: string;     // what the column holds: a role or a generic label
  detail: string;    // who it is: a customer id, a reference, a short address or the number of parties
  count: number;     // the number of parties in the column
  parties: string[]; // the keys of those parties
  family: Family | null;   // the family that gives a customer column its dot, or null
}

/** The words that name the role of an account in a column. */
export const ROLE_WORD: Record<string, string> = {
  launderer: "Laundering account",
  victim: "Victim",
  mule: "Mule account",
  collector: "Collector account",
  "first-party": "First-party fraudster",
  exposed: "Exposed customer",
  other: "Other account",
};

const byValueThenCase = (a: CaseSummary, b: CaseSummary) => b.value - a.value || a.caseId - b.caseId;

/** The summary of a case from its planted patterns (in order of id) and its legs. */
function summarise(caseId: number, planted: PatternInstance[], legs: number, firstDay: number | null): CaseSummary {
  const keys: string[] = [];
  const families: Family[] = [];
  let value = 0;
  let lowest = Infinity;
  for (const p of planted) {
    if (!keys.includes(p.typology)) keys.push(p.typology);
    if (!families.includes(p.family)) families.push(p.family);
    value += p.total;
    if (p.startDay < lowest) lowest = p.startDay;
  }
  return { caseId, title: patternLabel(planted[0].typology), keys, families, value, legs, startDay: firstDay ?? lowest };
}

/** The planted patterns of each case, each list in ascending order of id. Cases below 0 are left out. */
function plantedByCase(ds: Dataset): Map<number, PatternInstance[]> {
  const planted = new Map<number, PatternInstance[]>();
  for (const p of ds.patterns) {
    if (p.caseId < 0) continue;
    const list = planted.get(p.caseId);
    if (list) list.push(p); else planted.set(p.caseId, [p]);
  }
  for (const list of planted.values()) list.sort((a, b) => a.id - b.id);
  return planted;
}

/** The case of a library pattern with this case number, from the record of the planter, or undefined for a built-in case. */
function libraryEntry(ds: Dataset, caseId: number): LibraryCase | undefined {
  return ds.library?.cases.find((c) => c.caseId === caseId);
}

/** The summary of a library case: the title of the pattern, the keys and families of its planted patterns, and its value, first day and number of payments. */
function summariseLibrary(entry: LibraryCase, planted: PatternInstance[], legs: number): CaseSummary {
  const keys: string[] = [];
  const families: Family[] = [];
  for (const p of planted) {
    if (!keys.includes(p.typology)) keys.push(p.typology);
    if (!families.includes(p.family)) families.push(p.family);
  }
  return { caseId: entry.caseId, title: patternOf(entry.pattern)?.title ?? patternLabel(keys[0]), keys, families, value: entry.value, legs, startDay: entry.startDay };
}

/**
 * Every planted case of a data set, largest value first, and lowest case number first where values are equal. A library case
 * takes its title from its pattern, its value and first day from the record of the planter, and its number of payments from
 * the rows of the case legs, which include the payments that the bank does not record.
 */
export function listCases(ds: Dataset): CaseSummary[] {
  const planted = plantedByCase(ds);
  const lib = new Map<number, LibraryCase>();
  for (const c of ds.library?.cases ?? []) lib.set(c.caseId, c);
  const rowsOf = new Map<number, number>();
  for (const l of ds.caseLegs) if (lib.has(l.caseId)) rowsOf.set(l.caseId, (rowsOf.get(l.caseId) ?? 0) + 1);
  const legs = new Map<number, number>();
  const first = new Map<number, number>();
  for (const t of ds.txs) {
    if (!planted.has(t.caseId) || lib.has(t.caseId)) continue;
    legs.set(t.caseId, (legs.get(t.caseId) ?? 0) + 1);
    if (!first.has(t.caseId)) first.set(t.caseId, t.day);
  }
  const out: CaseSummary[] = [];
  for (const [caseId, list] of planted) {
    const entry = lib.get(caseId);
    out.push(entry ? summariseLibrary(entry, list, rowsOf.get(caseId) ?? 0) : summarise(caseId, list, legs.get(caseId) ?? 0, first.get(caseId) ?? null));
  }
  return out.sort(byValueThenCase);
}

/** The label and the kind of an outside party that has a reference, from the first leg that names it. */
function outsideWithRef(t: Tx): { label: string; kind: string } {
  if (t.rail === "CRYPTO") return { label: "a wallet", kind: "wallet" };
  if (t.type === "SPEND") return { label: "a merchant", kind: "merchant" };
  if (t.type === "TRANSFER") return { label: "an account at another bank", kind: "account-elsewhere" };
  if (t.type === "INCOME") return { label: "a payer outside the bank", kind: "payer" };
  return { label: "outside the bank", kind: "outside" };
}

/** A case of the data set as parties and legs, or null where no planted pattern carries that case number. */
export function caseView(ds: Dataset, caseId: number): CaseView | null {
  if (caseId < 0) return null;
  const planted: PatternInstance[] = [];
  for (const p of ds.patterns) if (p.caseId === caseId) planted.push(p);
  if (!planted.length) return null;
  planted.sort((a, b) => a.id - b.id);
  const entry = libraryEntry(ds, caseId);
  if (entry) return libraryView(ds, entry, planted);

  const txs: Tx[] = [];
  for (const t of ds.txs) if (t.caseId === caseId) txs.push(t);

  const parties = new Map<string, FlowParty>();
  const partyOf = (t: Tx, n: number): string => {
    if (n >= 0) {
      const key = "a" + n;
      if (!parties.has(key)) {
        let role: AccountRole | null = null;
        let family: Family | null = null;
        for (const p of planted) {
          if (p.accounts.includes(n)) { role = p.roles[n] ?? null; family = p.family; break; }
        }
        parties.set(key, {
          key, group: "a:" + (role ?? "other"), label: ds.accounts[n]?.customerId ?? String(n), kind: "customer",
          role, family, account: n, address: null, part: null, end: null, partLabel: null,
        });
      }
      return key;
    }
    let key: string, label: string, kind: string;
    if (t.cpRef) {
      ({ label, kind } = outsideWithRef(t));
      key = "x:" + t.cpRef;
    } else if (t.type === "CASH_IN") { key = "x:cash-in"; label = "cash paid in"; kind = "cash-in"; }
    else if (t.type === "CASH_OUT") { key = "x:cash-out"; label = "cash taken out"; kind = "cash-out"; }
    else { key = "x:outside"; label = "outside the bank"; kind = "outside"; }
    if (!parties.has(key)) {
      parties.set(key, {
        key, group: "x:" + kind, label, kind, role: null, family: null, account: null,
        address: kind === "wallet" ? t.wallet : null, part: null, end: null, partLabel: null,
      });
    }
    return key;
  };

  const rows: FlowLeg[] = [];
  for (const t of txs) {
    const from = partyOf(t, t.orig);
    const to = partyOf(t, t.dest);
    const step = t.role ?? "other";
    rows.push({
      seq: rows.length, step, say: t.role ? LEG_ROLE[t.role] : "a planted transaction without a named step", day: t.day, minute: t.minute,
      from, to, how: t.method, rail: t.rail, asset: t.rail === "CRYPTO" ? "BTC" : "GBP",
      amount: t.amount, planned: null, seenBy: "bank", tx: t.id, declined: t.status === "declined",
    });
  }

  const summary = summarise(caseId, planted, rows.length, txs.length ? txs[0].day : null);
  return { ...summary, parties: [...parties.values()], rows, endDay: rows.length ? rows[rows.length - 1].day : summary.startDay, useLabels: {} };
}

/** The rail that the transaction log names for a way of paying in a library file. A payment on a chain takes the name of the chain. */
const VIA_RAIL: Record<string, string> = { fps: "FPS", chaps: "CHAPS", swift: "INTL", "cash-in": "CASH", "cash-out": "CASH", card: "CARD", "bank-crypto": "CRYPTO" };

/** The rail of a payment of a library case, in the words that the ledger uses. */
function libraryRail(via: string, chain: string | null): string {
  if (via === "chain" && chain) return chain === "bitcoin" ? "CRYPTO" : chain.charAt(0).toUpperCase() + chain.slice(1);
  return VIA_RAIL[via] ?? via;
}

/**
 * A library case as parties and payments, from the rows of `ds.parties` and `ds.caseLegs` in the order of `seq`. The step of a
 * payment is the id of its use, a full stop and its step id. A payment that the bank did not write has the amount 0 and keeps its
 * planned amount. The role of the party that an account fills is its role in the planted pattern of its end.
 */
function libraryView(ds: Dataset, entry: LibraryCase, planted: PatternInstance[]): CaseView {
  const caseId = entry.caseId;
  const parties: FlowParty[] = [];
  for (const p of ds.parties) {
    if (p.caseId !== caseId) continue;
    let role: AccountRole | null = null;
    let family: Family | null = null;
    if (p.account !== null) {
      const owner = planted.find((q) => q.library?.end === p.end && q.accounts.includes(p.account as number)) ?? planted.find((q) => q.accounts.includes(p.account as number));
      if (owner) { role = owner.roles[p.account] ?? null; family = owner.family; }
    }
    parties.push({
      key: p.key, group: p.group, label: p.account !== null ? ds.accounts[p.account]?.customerId ?? String(p.account) : p.label, kind: p.kind,
      role, family, account: p.account, address: p.address, part: p.part, end: p.end, partLabel: p.label,
    });
  }
  const legs = ds.caseLegs.filter((l) => l.caseId === caseId).sort((a, b) => a.seq - b.seq);
  const rows: FlowLeg[] = legs.map((l, i) => ({
    seq: i, step: `${l.part}.${l.step}`, say: l.say, day: l.day, minute: l.minute, from: l.from, to: l.to, how: l.via, rail: libraryRail(l.via, l.chain), asset: l.asset,
    amount: l.amount, planned: l.planned, seenBy: l.seenBy, tx: l.tx, declined: false,
  }));
  return { ...summariseLibrary(entry, planted, rows.length), parties, rows, endDay: entry.endDay, useLabels: useLabelsOf(entry.pattern) };
}

/**
 * The words that tell the uses of a part apart, for each part that a pattern names more than once. The key of an entry is the
 * id of the use and its value is "use <n> of <m>", where m is the number of uses of that part in the pattern. The object is empty for a
 * pattern that names no part twice and for an id that the library does not hold.
 */
export function useLabelsOf(patternId: string): Record<string, string> {
  const pattern = patternOf(patternId);
  if (!pattern) return {};
  const uses = usesOf(pattern);
  const total = new Map<string, number>();
  for (const u of uses) total.set(partIdOf(u), (total.get(partIdOf(u)) ?? 0) + 1);
  const out: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (const u of uses) {
    const part = partIdOf(u);
    const n = (seen.get(part) ?? 0) + 1;
    seen.set(part, n);
    if (total.get(part)! > 1) out[u] = `use ${n} of ${total.get(part)}`;
  }
  return out;
}

/** The keys of the planted patterns of a library pattern, from labels.json. */
const KEYS_OF: ReadonlyMap<string, { keys: string[]; families: Family[] }> = new Map(
  labelsFile.patterns.map((p) => [p.id, { keys: p.keys.map((k) => k.key), families: [...new Set(p.keys.map((k) => k.family as Family))] }]));

/** The minute of the day at which a typical case starts: 9 o'clock. */
const TYPICAL_START = 540;

/**
 * The typical case of a library pattern in the form that `caseView` gives, so that a page draws it with the ledger of a case
 * of the data set. The case is drawn from the files with a fixed seed number. No account fills a customer party, so each party
 * takes its label from the files. The case number is -1, because the case is not in any data set. Null where no pattern has the id.
 * The optional settings give the size, the speed and the end that the bank sees. A field that is absent takes the pattern's own value, which is 1 for the size and the speed.
 */
export function typicalCaseView(patternId: string, settings?: { size?: number; speed?: number; bankSees?: "source" | "cash-out" | "both" }): CaseView | null {
  const pattern = patternOf(patternId);
  if (!pattern) return null;
  const priced = typicalCase(pattern, PARTS, { size: settings?.size ?? 1, speed: settings?.speed ?? 1, bankSees: settings?.bankSees ?? pattern.bankSees });
  const parties: FlowParty[] = priced.parties.map((q) => ({
    key: q.key, group: q.group, label: q.label, kind: q.kind, role: null, family: null, account: null, address: null, part: q.part, end: q.end, partLabel: q.label,
  }));
  const rows: FlowLeg[] = priced.legs.map((l, i) => {
    const at = l.minute + TYPICAL_START;
    return {
      seq: i, step: `${l.part}.${l.step}`, say: l.say, day: Math.floor(at / 1440), minute: at % 1440, from: l.from, to: l.to, how: l.via, rail: libraryRail(l.via, l.chain), asset: l.asset,
      amount: l.amount, planned: l.amount, seenBy: l.seenBy, tx: null, declined: false,
    };
  });
  const names = KEYS_OF.get(patternId);
  return {
    caseId: -1, title: pattern.title, keys: names?.keys ?? [], families: names?.families ?? [], value: priced.value, legs: rows.length, startDay: 0,
    parties, rows, endDay: rows.reduce((m, r) => Math.max(m, r.day), 0), useLabels: useLabelsOf(patternId),
  };
}

/** The minutes between the first and the last payment of a view, and 0 for a view with fewer than 2 payments. */
export function caseMinutes(view: CaseView): number {
  if (view.rows.length < 2) return 0;
  let lo = Infinity, hi = -Infinity;
  for (const r of view.rows) { const at = r.day * 1440 + r.minute; if (at < lo) lo = at; if (at > hi) hi = at; }
  return hi - lo;
}

/** The first letter of a text as a capital. */
const capital =(s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A long reference or address as its first 6 characters, an ellipsis and its last 4. */
const shortRef = (s: string) => (s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

/** The short name that a row shows for a party inside a shared column. */
export function memberName(party: FlowParty): string {
  if (party.account !== null) return party.label;
  if (party.part === null && party.key.startsWith("x:")) return party.key.slice(2);
  const i = party.key.indexOf("#");
  if (i >= 0) return party.key.slice(i + 1);
  return party.part !== null ? party.key.slice(party.key.indexOf(".") + 1) : party.key;
}

/**
 * What a drawn cell shows for one member of a shared column at the end of a line: the customer id of an account, the short
 * reference of an address, or the name of an outside party of a built-in case. A party of a library part with no address gives an empty text.
 */
export function memberRef(party: FlowParty): string {
  if (party.account !== null) return party.label;
  if (party.address) return shortRef(party.address);
  return party.part === null ? memberName(party) : "";
}

/**
 * What a drawn cell shows for a payment whose 2 parties are in one column: the 2 references joined by " pays ", with an address
 * in its tail form ("…" and its last 4 characters). It is empty for a payment of a party to itself and where either party has neither an account nor an address.
 */
export function withinLabel(from: FlowParty, to: FlowParty): string {
  if (from.key === to.key) return "";
  const ref = (p: FlowParty) => (p.account !== null ? p.label : p.address ? `…${p.address.slice(-4)}` : "");
  const a = ref(from), b = ref(to);
  return a && b ? `${a} pays ${b}` : "";
}

/**
 * The name that a row gives a party in full. An account of a built-in case is its role and its customer id, such as "Mule account CUST-001077".
 * An account of a library case is the label of its party in the part file with a capital first letter and its customer id, such as "The first mule account CUST-001077".
 * An outside party is its label with a capital first letter, followed by its own name where it has one that differs from the
 * label (a long address is cut to its first 6 and last 4 characters).
 */
export function partyName(party: FlowParty): string {
  if (party.account !== null) return `${party.partLabel !== null ? capital(party.partLabel) : ROLE_WORD[party.role ?? "other"]} ${party.label}`;
  const label = capital(party.label);
  if (party.address === null && party.key === "x:" + party.kind) return label;
  if (party.part !== null && party.address === null && (!party.key.includes("#") || (party.key.endsWith("#1") && (party.kind === "customer" || party.kind === "outside-account")))) return label;
  const name = party.address ? shortRef(party.address) : memberName(party);
  return name && name !== party.label ? `${label} ${name}` : label;
}

/** The most columns that the ledger can draw, because the frame of the ledger is at most 1,084 pixels wide and the drawn form needs 330 pixels and 88 pixels for each column. */
export const DRAWN_COLUMNS = 8;

/**
 * The columns of the drawing of a case, from left to right, in 8 steps.
 * Step 1: a party whose group has at most 3 parties has a column of its own. The parties of a larger group of a library
 * case share one column. In a larger group of a built-in case the parties share one column where no leg runs between
 * two of them. Where legs do run between them, each party gets a level (a payee is one level above its payer) and the
 * parties of one level that number more than 3 share a column, while the others keep a column of their own. The level
 * is a first estimate from one pass over the legs in the order of time, which step 2 repairs.
 * Step 2: a shared column of a built-in case that still holds a leg between two of its parties is split into columns of
 * one party each, until no such leg remains.
 * Step 3: the columns are put in the order in which the legs first reach them, and then each column that only pays is
 * moved to the place directly left of the column that its first leg pays, so that money runs from left to right.
 * Step 4: a case with more than one party and fewer than 2 columns gives every party a column of its own.
 * Step 5: where a case has more than DRAWN_COLUMNS columns, only the parties of the hiding parts of a library case are moved, and they share one
 * column for each use of a part. That column is labelled with the title of the part from its file.
 * Steps 6 to 8 run in turn, each only where the case still has more than DRAWN_COLUMNS columns, and they move only the parties of the
 * source part and the cash-out part of a library case. An account of the bank is a party of the kind customer.
 * Step 6: the parties of a group of 2 or more share one column, which has the key of the group. A party that is alone in its group keeps its column.
 * Step 7: where no party of a part is an account of the bank and the part has 2 parties or more, its parties share one column with the key "part:" and the id of the use.
 * Step 8: in a part that holds an account of the bank, the parties that are no account and pay no account share one column, where there are 2 or more.
 * Its key is "next:" and the id of the use, and its label is "Where the money goes next".
 */
export function flowColumns(view: CaseView): FlowColumn[] {
  const byKey = new Map<string, FlowParty>();
  for (const p of view.parties) byKey.set(p.key, p);

  // step 1: the column of each party
  const colOf = new Map<string, string>();
  const groups = new Map<string, FlowParty[]>();
  for (const p of view.parties) {
    const list = groups.get(p.group);
    if (list) list.push(p); else groups.set(p.group, [p]);
  }
  for (const [group, list] of groups) {
    if (list.length <= 3) { for (const p of list) colOf.set(p.key, p.key); continue; }
    if (list.some((p) => p.part !== null)) { for (const p of list) colOf.set(p.key, group); continue; }
    const inGroup = new Set(list.map((p) => p.key));
    const level = new Map<string, number>();
    for (const p of list) level.set(p.key, 0);
    let linked = false;
    for (const r of view.rows) {
      if (r.from === r.to || !inGroup.has(r.from) || !inGroup.has(r.to)) continue;
      linked = true;
      if (level.get(r.to)! <= level.get(r.from)!) level.set(r.to, level.get(r.from)! + 1);
    }
    if (!linked) { for (const p of list) colOf.set(p.key, group); continue; }
    const perLevel = new Map<number, FlowParty[]>();
    for (const p of list) {
      const n = level.get(p.key)!;
      const at = perLevel.get(n);
      if (at) at.push(p); else perLevel.set(n, [p]);
    }
    for (const [n, at] of perLevel) for (const p of at) colOf.set(p.key, at.length > 3 ? `${group}/${n}` : p.key);
  }

  // step 2: no leg inside a shared column of a built-in case
  for (let again = true; again;) {
    again = false;
    for (const r of view.rows) {
      const c = colOf.get(r.from);
      if (r.from === r.to || c === undefined || c !== colOf.get(r.to)) continue;
      const members = view.parties.filter((p) => colOf.get(p.key) === c);
      if (members.some((p) => p.part !== null)) continue;
      for (const p of members) colOf.set(p.key, p.key);
      again = true;
      break;
    }
  }

  // step 3: the order of the columns
  const order = (): string[] => {
    const seen: string[] = [];
    const has = new Set<string>();
    for (const r of view.rows) {
      for (const k of [r.from, r.to]) {
        const c = colOf.get(k);
        if (c !== undefined && !has.has(c)) { has.add(c); seen.push(c); }
      }
    }
    const paid = new Set<string>();
    for (const r of view.rows) { const c = colOf.get(r.to); if (c !== undefined) paid.add(c); }
    const list = seen.slice();
    for (const c of seen) {
      if (paid.has(c)) continue;
      const first = view.rows.find((r) => colOf.get(r.from) === c);
      const target = first ? colOf.get(first.to) : undefined;
      if (target === undefined) continue;
      const at = list.indexOf(c);
      const goal = list.indexOf(target);
      if (at > goal) { list.splice(at, 1); list.splice(list.indexOf(target), 0, c); }
    }
    return list;
  };
  let keys = order();

  // step 4: a case that still has one column
  if (keys.length < 2 && view.parties.length > 1) {
    for (const p of view.parties) colOf.set(p.key, p.key);
    keys = order();
  }

  // step 5: more columns than the ledger can draw, so the parties that hide the money share one column for each use of a part
  if (keys.length > DRAWN_COLUMNS) {
    for (const p of view.parties) if (p.end === "hiding" && p.part !== null) colOf.set(p.key, "part:" + p.part);
    keys = order();
  }

  // The parties of a source part or a cash-out part of a library case, which steps 6 to 8 move
  const ends = view.parties.filter((p) => p.part !== null && p.end !== "hiding");
  const isAccount = (p: FlowParty) => p.kind === "customer";
  const endsOf = new Map<string, FlowParty[]>();
  for (const p of ends) { const l = endsOf.get(p.part as string); if (l) l.push(p); else endsOf.set(p.part as string, [p]); }

  // step 6: still too many columns, so the parties of a group of 2 or more share one column
  if (keys.length > DRAWN_COLUMNS) {
    const byGroup = new Map<string, FlowParty[]>();
    for (const p of ends) { const l = byGroup.get(p.group); if (l) l.push(p); else byGroup.set(p.group, [p]); }
    for (const [group, list] of byGroup) if (list.length >= 2) for (const p of list) colOf.set(p.key, group);
    keys = order();
  }

  // step 7: still too many columns, so the parties of a part with no account of the bank share one column
  if (keys.length > DRAWN_COLUMNS) {
    for (const [part, list] of endsOf) if (list.length >= 2 && !list.some(isAccount)) for (const p of list) colOf.set(p.key, "part:" + part);
    keys = order();
  }

  // step 8: still too many columns, so the parties that the accounts of a part pay share one column
  if (keys.length > DRAWN_COLUMNS) {
    const paysAccount = new Set<string>();
    for (const r of view.rows) { const to = byKey.get(r.to); if (to && isAccount(to) && r.from !== r.to) paysAccount.add(r.from); }
    for (const [part, list] of endsOf) {
      if (!list.some(isAccount)) continue;
      const next = list.filter((p) => !isAccount(p) && !paysAccount.has(p.key));
      if (next.length >= 2) for (const p of next) colOf.set(p.key, "next:" + part);
    }
    keys = order();
  }

  const cols = new Map<string, FlowParty[]>();
  for (const k of keys) cols.set(k, []);
  for (const p of view.parties) cols.get(colOf.get(p.key)!)?.push(p);

  const out: FlowColumn[] = [];
  for (const [key, members] of cols) {
    const first = members[0];
    const n = members.length;
    let label: string, detail: string;
    if (key.startsWith("part:")) {
      label = PARTS.get(partIdOf(key.slice(5)))?.title ?? "A way of hiding the money";
      detail = `${n} parties`;
    } else if (key.startsWith("next:")) {
      label = "Where the money goes next";
      detail = `${n} parties`;
    } else if (first.account !== null) {
      label = first.partLabel !== null ? capital(first.partLabel) : ROLE_WORD[first.role ?? "other"];
      detail = key !== first.key ? `${n} ${n === 1 ? "account" : "accounts"}` : first.label;
    } else {
      label = capital(first.label);
      if (key !== first.key) detail = `${n} ${n === 1 ? "party" : "parties"}`;
      else if (first.kind === "merchant" || first.kind === "account-elsewhere" || first.kind === "payer") detail = first.part !== null ? "" : first.key.slice(2);
      else if (first.kind === "wallet") detail = first.part !== null && first.address === null ? "" : shortRef(first.address ?? first.key.slice(2));
      else detail = "";
    }
    const words = first.part !== null ? view.useLabels[first.part] : undefined;
    if (words) detail = detail ? `${detail}, ${words}` : words;
    out.push({ key, label, detail, count: n, parties: members.map((p) => p.key), family: first.family });
  }
  return out;
}

/** The steps of a case in the order of their first legs, each with the sentence of its first leg and its legs in the order of the view. */
export function caseSteps(view: CaseView): { step: string; say: string; rows: FlowLeg[] }[] {
  const out: { step: string; say: string; rows: FlowLeg[] }[] = [];
  const at = new Map<string, number>();
  for (const r of view.rows) {
    const i = at.get(r.step);
    if (i === undefined) { at.set(r.step, out.length); out.push({ step: r.step, say: r.say, rows: [r] }); }
    else out[i].rows.push(r);
  }
  return out;
}

/** The 3 steps whose title is not the role as words. */
const STEP_TITLE: Record<string, string> = {
  "offramp-forward": "Off-ramp forward",
  "first-party-build": "First-party build",
  "first-party-take": "First-party take",
};

/** The title of a step: the role as words with a capital first letter, or "Other planted transactions". A step of a library pattern is "<use id>.<step id>" and gives the step id in the same form. */
export function stepTitle(step: string): string {
  if (step === "other") return "Other planted transactions";
  const named = STEP_TITLE[step];
  if (named) return named;
  const dot = step.lastIndexOf(".");
  if (step.slice(dot + 1) === "handoff") return "Hand-off";
  return capital((dot >= 0 ? step.slice(dot + 1) : step).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/-/g, " ").toLowerCase());
}

/** The title of a step followed, in brackets, by the words of its use where the case names that use twice, such as "Deposit (use 2 of 2)". The use of a step is the text of its key before the last full stop. */
export function stepHeading(view: CaseView, step: string): string {
  const dot = step.lastIndexOf(".");
  const words = dot >= 0 ? view.useLabels[step.slice(0, dot)] : undefined;
  return words ? `${stepTitle(step)} (${words})` : stepTitle(step);
}

/** The case to show first: the largest value among those with 4 to 14 legs, or else the case with the fewest legs. Null for an empty list. */
export function pickCase(cases: CaseSummary[]): CaseSummary | null {
  let best: CaseSummary | null = null;
  const better = (a: CaseSummary, b: CaseSummary) => a.value > b.value || (a.value === b.value && a.caseId < b.caseId);
  for (const c of cases) if (c.legs >= 4 && c.legs <= 14 && (!best || better(c, best))) best = c;
  if (best) return best;
  for (const c of cases) if (!best || c.legs < best.legs || (c.legs === best.legs && c.caseId < best.caseId)) best = c;
  return best;
}

/** The id of the library pattern that a key names, where the key is the id itself or a key of one of its planted patterns such as "lib.<id>.source". Null for any other key. */
export function libraryIdOf(key: string): string | null {
  if (patternOf(key)) return key;
  if (!key.startsWith("lib.")) return null;
  const id = key.slice(4, key.lastIndexOf("."));
  return patternOf(id) ? id : null;
}

/** The entries of a list of cases that hold a planted pattern with this key, in the order of the list. For a library pattern, either key of it and its id give the cases of both ends. */
export function patternCases(cases: CaseSummary[], key: string): CaseSummary[] {
  const id = libraryIdOf(key);
  if (id !== null) { const own = KEYS_OF.get(id)?.keys ?? []; return cases.filter((c) => c.keys.some((k) => own.includes(k))); }
  return cases.filter((c) => c.keys.includes(key));
}

/**
 * The steps of a library pattern as its files give them, in the order of its uses of parts (the source, the hiding parts and the
 * cash-out) and of their steps. A step is "<use id>.<step id>" and carries the sentence of the step.
 */
export function librarySteps(id: string): { step: string; say: string; required: boolean }[] {
  const pattern = patternOf(id);
  if (!pattern) return [];
  const out: { step: string; say: string; required: boolean }[] = [];
  for (const use of usesOf(pattern)) {
    for (const s of PARTS.get(partIdOf(use))?.steps ?? []) out.push({ step: `${use}.${s.id}`, say: s.say, required: s.need === "required" });
  }
  return out;
}

/**
 * The distinct steps of the cases that hold a planted pattern with this key, each with the sentence of its first leg and the
 * number of cases that have it. The cases are taken in the order of `listCases`. The list starts with the steps of the first
 * case, in the order of their first legs. Each step of a later case that the list does not hold yet goes directly after the
 * nearest earlier step of the same case that the list holds, or to the start of the list where the case has none.
 * A page that holds the cases of the pattern already (`patternCases` of `listCases`) passes them as `own`, so that the data
 * set is not read again.
 * For a library pattern (its id or either of its keys) the steps come from its files, in the order of the parts and of their
 * steps, each with the sentence of the step and the number of its cases that hold a payment of the step.
 */
export function patternSteps(ds: Dataset, key: string, own?: CaseSummary[]): { step: string; say: string; cases: number }[] {
  const lib = libraryIdOf(key);
  if (lib !== null) {
    const ids = new Set((own ?? patternCases(listCases(ds), lib)).map((c) => c.caseId));
    const seen = new Map<string, Set<number>>();
    for (const l of ds.caseLegs) if (ids.has(l.caseId)) { const k = `${l.part}.${l.step}`; (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(l.caseId); }
    return librarySteps(lib).map((s) => ({ step: s.step, say: s.say, cases: seen.get(s.step)?.size ?? 0 }));
  }
  const wanted = new Set<number>();
  for (const p of ds.patterns) if (p.typology === key && p.caseId >= 0) wanted.add(p.caseId);
  const seen = new Map<number, Map<string, { say: string }>>();
  for (const t of ds.txs) {
    if (!wanted.has(t.caseId)) continue;
    let steps = seen.get(t.caseId);
    if (!steps) { steps = new Map(); seen.set(t.caseId, steps); }
    const step = t.role ?? "other";
    if (!steps.has(step)) steps.set(step, { say: t.role ? LEG_ROLE[t.role] : "a planted transaction without a named step" });
  }
  const tally = new Map<string, { say: string; cases: number }>();
  const list: string[] = [];
  for (const c of own ?? patternCases(listCases(ds), key)) {
    const steps = seen.get(c.caseId);
    if (!steps) continue;
    const own = [...steps.keys()];
    own.forEach((step, i) => {
      const e = tally.get(step);
      if (e) { e.cases++; return; }
      tally.set(step, { say: steps.get(step)!.say, cases: 1 });
      let after = -1;
      for (let j = i - 1; j >= 0 && after < 0; j--) after = list.indexOf(own[j]);
      list.splice(after + 1, 0, step);
    });
  }
  return list.map((step) => ({ step, say: tally.get(step)!.say, cases: tally.get(step)!.cases }));
}

/**
 * The references of a pattern first and then those that only its parts cite. Each source appears once, in the order of its first
 * citation. Its pages are the pages of every citation in ascending order, each page once, with each run of 3 or more pages written as a range such as 15 to 20.
 * A page text that is no number and no range of 2 numbers joined by " to " keeps its place after the numbers.
 * Its note is each different note of its citations, in that order, joined with a space.
 */
export function mergeReferences(lists: { id: string; pages?: string; note?: string }[][]): { id: string; pages?: string; note?: string }[] {
  const order: string[] = [];
  const pages = new Map<string, string[]>();
  const nums = new Map<string, Set<number>>();
  const notes = new Map<string, string[]>();
  for (const r of lists.flat()) {
    if (!pages.has(r.id)) { order.push(r.id); pages.set(r.id, []); nums.set(r.id, new Set()); notes.set(r.id, []); }
    const p = pages.get(r.id)!, n = notes.get(r.id)!, set = nums.get(r.id)!;
    for (const x of (r.pages ?? "").split(", ")) {
      const m = /^(\d+)(?: to (\d+))?$/.exec(x);
      if (!m) { if (x && !p.includes(x)) p.push(x); continue; }
      const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
      if (b >= a && b - a < 10000) for (let k = a; k <= b; k++) set.add(k);
      else if (!p.includes(x)) p.push(x);
    }
    if (r.note && !n.includes(r.note)) n.push(r.note);
  }
  return order.map((id) => {
    const list = [...nums.get(id)!].sort((x, y) => x - y), p: string[] = [];
    for (let i = 0; i < list.length;) {
      let j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      if (j - i >= 2) p.push(`${list[i]} to ${list[j]}`);
      else for (let k = i; k <= j; k++) p.push(String(list[k]));
      i = j + 1;
    }
    p.push(...pages.get(id)!);
    const n = notes.get(id)!;
    return { id, ...(p.length ? { pages: p.join(", ") } : {}), ...(n.length ? { note: n.join(" ") } : {}) };
  });
}

/** The height of the dot of a ledger row: lower where the payer and the payee share a column, so that a label of 2 lines does not meet it. */
export function ledgerDotY(from: number | undefined, to: number | undefined, line: string, shared: string): string {
  return from !== undefined && from === to ? shared : line;
}

/** A name split into its words and its short address, such as "bc1q09…64dk", so that the address can be kept from wrapping. */
export function splitShortAddress(name: string): { head: string; address: string | null } {
  const m = name.match(/^(.*\s)?(\S*…\S*)$/);
  return m ? { head: m[1] ?? "", address: m[2] } : { head: name, address: null };
}
