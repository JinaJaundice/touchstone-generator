// The data of a drawn case: a planted case of the generator turned into parties and legs, so that a screen can
// draw who paid whom and when. A pure module with no React and no DOM. A later phase reads a case of a library
// pattern from 2 further tables of the data set, in the same view.

import { LEG_ROLE } from "./dictionary";
import { patternLabel, type AccountRole, type Dataset, type Family, type PatternInstance, type Tx } from "./types";

/** One party of a case: an account of the bank, or someone outside it. */
export interface FlowParty {
  key: string;      // "a" and the account id for an account of the bank, "x:" and a reference for an outside party
  group: string;    // the parties that may share a column: "a:" and the role, or "x:" and the kind
  label: string;    // the customer id of an account, or the generic label of an outside party
  kind: string;     // "customer", "merchant", "account-elsewhere", "payer", "wallet", "cash-in", "cash-out" or "outside"
  role: AccountRole | null;
  family: Family | null;   // the family of the planted pattern that gives the account its role
  account: number | null;
  address: string | null;
  part: string | null;     // null for a case of a built-in pattern
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
export interface CaseView extends CaseSummary { parties: FlowParty[]; rows: FlowLeg[]; endDay: number }
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

/** Every planted case of a data set, largest value first, and lowest case number first where values are equal. */
export function listCases(ds: Dataset): CaseSummary[] {
  const planted = plantedByCase(ds);
  const legs = new Map<number, number>();
  const first = new Map<number, number>();
  for (const t of ds.txs) {
    if (!planted.has(t.caseId)) continue;
    legs.set(t.caseId, (legs.get(t.caseId) ?? 0) + 1);
    if (!first.has(t.caseId)) first.set(t.caseId, t.day);
  }
  const out: CaseSummary[] = [];
  for (const [caseId, list] of planted) out.push(summarise(caseId, list, legs.get(caseId) ?? 0, first.get(caseId) ?? null));
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
          role, family, account: n, address: null, part: null, end: null,
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
        address: kind === "wallet" ? t.wallet : null, part: null, end: null,
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
  return { ...summary, parties: [...parties.values()], rows, endDay: rows.length ? rows[rows.length - 1].day : summary.startDay };
}

/** The first letter of a text as a capital. */
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A long reference or address as its first 6 characters, an ellipsis and its last 4. */
const shortRef = (s: string) => (s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

/** The short name that a row shows for a party inside a shared column. */
export function memberName(party: FlowParty): string {
  if (party.account !== null) return party.label;
  if (party.part === null && party.key.startsWith("x:")) return party.key.slice(2);
  const i = party.key.indexOf("#");
  return i >= 0 ? party.key.slice(i + 1) : party.key;
}

/**
 * The name that a row gives a party in full. An account is its role and its customer id, such as "Mule account CUST-001077".
 * An outside party is its label with a capital first letter, followed by its own name where it has one that differs from the
 * label (a long address is cut to its first 6 and last 4 characters).
 */
export function partyName(party: FlowParty): string {
  if (party.account !== null) return `${ROLE_WORD[party.role ?? "other"]} ${party.label}`;
  const label = capital(party.label);
  if (party.address === null && party.key === "x:" + party.kind) return label;
  const name = party.address ? shortRef(party.address) : memberName(party);
  return name && name !== party.label ? `${label} ${name}` : label;
}

/**
 * The columns of the drawing of a case, from left to right, in 5 steps.
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
 * Step 5: with more than 12 columns, the parties of a library case that hide the money share one column for each part.
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

  // step 5: too many columns, so the parties that hide the money share one column for each part
  if (keys.length > 12) {
    for (const p of view.parties) if (p.end === "hiding" && p.part !== null) colOf.set(p.key, "part:" + p.part);
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
      label = key.slice(5);
      detail = `${n} parties`;
    } else if (first.account !== null) {
      label = ROLE_WORD[first.role ?? "other"];
      detail = key !== first.key ? `${n} ${n === 1 ? "account" : "accounts"}` : first.label;
    } else {
      label = capital(first.label);
      if (key !== first.key) detail = `${n} ${n === 1 ? "party" : "parties"}`;
      else if (first.kind === "merchant" || first.kind === "account-elsewhere" || first.kind === "payer") detail = first.key.slice(2);
      else if (first.kind === "wallet") detail = shortRef(first.address ?? first.key.slice(2));
      else detail = "";
    }
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

/** The title of a step: the role as words with a capital first letter, or "Other planted transactions". A step of a library pattern is "<part id>.<step id>" and gives the step id in the same form. */
export function stepTitle(step: string): string {
  if (step === "other") return "Other planted transactions";
  const named = STEP_TITLE[step];
  if (named) return named;
  const dot = step.lastIndexOf(".");
  return capital((dot >= 0 ? step.slice(dot + 1) : step).replace(/-/g, " "));
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

/** The entries of a list of cases that hold a planted pattern with this key, in the order of the list. */
export function patternCases(cases: CaseSummary[], key: string): CaseSummary[] {
  return cases.filter((c) => c.keys.includes(key));
}

/**
 * The distinct steps of the cases that hold a planted pattern with this key, each with the sentence of its first leg and the
 * number of cases that have it. The cases are taken in the order of `listCases`. The list starts with the steps of the first
 * case, in the order of their first legs. Each step of a later case that the list does not hold yet goes directly after the
 * nearest earlier step of the same case that the list holds, or to the start of the list where the case has none.
 * A page that holds the cases of the pattern already (`patternCases` of `listCases`) passes them as `own`, so that the data
 * set is not read again.
 */
export function patternSteps(ds: Dataset, key: string, own?: CaseSummary[]): { step: string; say: string; cases: number }[] {
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
