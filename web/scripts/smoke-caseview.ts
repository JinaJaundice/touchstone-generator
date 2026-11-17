// Test of the case view (src/lib/gen/caseView.ts): makes 3 data sets with the working wallet pool and checks, for
// each, that every planted case becomes a view whose legs, parties and columns agree with the records.
// It also checks the 3 functions that name a pattern, the 3 branches of pickCase, the columns of 4 hand-made cases and partyName.
// Then it makes 4 data sets with library patterns on, one of them for the pattern that names a part twice, and checks the list, the payments, the steps and the columns of their cases and the typical case of each pattern. It exits with code 1 unless every statement holds.
//   npx esbuild scripts/smoke-caseview.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke-caseview.mjs && node .tmp/smoke-caseview.mjs
import { readFileSync } from "node:fs";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { DEFAULT_CONFIG } from "../src/lib/gen/config";
import { makeCalendar } from "../src/lib/gen/calendar";
import { DrawnRow, ledgerRead } from "../src/lib/flow";
import { ARCHETYPES, libraryCountText, libraryRateText } from "../src/lib/gen/archetypes";
import labelsFile from "../src/lib/gen/patterns/labels.json";
import { lengthText } from "../src/lib/format";
import { DRAWN_COLUMNS, ROLE_WORD, caseMinutes, caseSteps, ledgerDotY, mergeReferences, splitShortAddress, caseView, flowColumns, librarySteps, listCases, memberRef, partyName, patternCases, patternSteps, pickCase, stepHeading, stepTitle, typicalCaseView, useLabelsOf, withinLabel, type CaseSummary, type CaseView, type FlowLeg, type FlowParty } from "../src/lib/gen/caseView";
import { PARTS, PATTERNS, patternOf } from "../src/lib/gen/patterns/index";
import { typicalCase } from "../src/lib/gen/patterns/expand";
import { partIdOf } from "../src/lib/gen/patterns/types";
import { labelsOf } from "../src/lib/gen/patterns/labels";
import { patternFamily, patternLabel, patternShort, TYPOLOGY_LABEL, TYPOLOGY_SHORT, type AccountRole, type Dataset, type WalletRef } from "../src/lib/gen/types";

const wallets: WalletRef[] = readWalletPool(JSON.parse(readFileSync(new URL("../public/wallet_pool.json", import.meta.url), "utf8")));
let failures = 0;

/** The titles, the text and the hidden text of a React element tree whose function components hold no hook, in the form of the HTML that they would write. */
function readTree(node: unknown): { titles: string[]; text: string; hidden: string[] } {
  const out = { titles: [] as string[], text: "", hidden: [] as string[] };
  const go = (n: unknown, hide: boolean): void => {
    if (n === null || n === undefined || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") { out.text += n + " "; if (hide) out.hidden.push(String(n)); return; }
    if (Array.isArray(n)) { for (const c of n) go(c, hide); return; }
    const el = n as { type: unknown; props: Record<string, unknown> };
    const props = el.props ?? {};
    if (typeof props.title === "string") out.titles.push(props.title);
    if (typeof el.type === "function") { go((el.type as (p: unknown) => unknown)(props), hide); return; }
    go(props.children, hide || props["aria-hidden"] === "true");
  };
  go(node, false);
  return out;
}
const report = (name: string, first: string | null) => {
  if (first === null) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}: ${first}`); failures++; }
};

// the 3 functions that name a pattern
console.log("naming functions");
const checks: [string, unknown, unknown][] = [
  ['patternLabel("mule_herd")', patternLabel("mule_herd"), TYPOLOGY_LABEL.mule_herd],
  ['patternShort("mule_herd")', patternShort("mule_herd"), TYPOLOGY_SHORT.mule_herd],
  ['patternFamily("mule_herd")', patternFamily("mule_herd"), "mule"],
  ['patternLabel("lib.x.source")', patternLabel("lib.x.source"), "lib.x.source"],
  ['patternShort("toString")', patternShort("toString"), "toString"],
  ['patternFamily("no such pattern")', patternFamily("no such pattern"), "aml"],
  ['stepTitle("victim-payment")', stepTitle("victim-payment"), "Victim payment"],
  ['stepTitle("other")', stepTitle("other"), "Other planted transactions"],
  ['stepTitle("lib.x.source-in")', stepTitle("lib.x.source-in"), "Source in"],
  ['stepTitle("offramp-forward")', stepTitle("offramp-forward"), "Off-ramp forward"],
  ['stepTitle("first-party-build")', stepTitle("first-party-build"), "First-party build"],
  ['stepTitle("first-party-take")', stepTitle("first-party-take"), "First-party take"],
];
for (const [name, got, want] of checks) report(name, got === want ? null : `got ${String(got)}, wanted ${String(want)}`);

// pickCase on hand-made lists: the 3 branches
console.log("pickCase on hand-made lists");
const summary = (caseId: number, value: number, legs: number): CaseSummary => ({ caseId, title: "x", keys: [], families: [], value, legs, startDay: 0 });
{
  const idOf = (list: CaseSummary[]) => pickCase(list)?.caseId ?? null;
  const picks: [string, number | null, number | null][] = [
    ["an empty list gives null", idOf([]), null],
    ["the largest value among 4 to 14 payments", idOf([summary(1, 900, 3), summary(2, 300, 4), summary(3, 500, 14), summary(4, 800, 15)]), 3],
    ["no case of 4 to 14 payments gives the fewest payments, then the lowest number", idOf([summary(8, 100, 2), summary(5, 900, 20), summary(3, 50, 2), summary(9, 10, 1), summary(2, 10, 1)]), 2],
    ["2 cases of equal value give the lowest number", idOf([summary(9, 100, 6), summary(4, 100, 6), summary(7, 100, 6)]), 4],
  ];
  for (const [name, got, want] of picks) report(name, got === want ? null : `got ${String(got)}, wanted ${String(want)}`);
}

// the columns of 4 hand-made cases
console.log("flowColumns on hand-made cases");
const account = (n: string, role: AccountRole): FlowParty => ({ key: "a" + n, group: "a:" + role, label: "CUST-" + n, kind: "customer", role, family: "aml", account: Number(n.replace(/\D/g, "") || 0), address: null, part: null, end: null, partLabel: null });
const payer = (ref: string): FlowParty => ({ key: "x:" + ref, group: "x:payer", label: "a payer outside the bank", kind: "payer", role: null, family: null, account: null, address: null, part: null, end: null, partLabel: null });
const madeView = (parties: FlowParty[], pays: [FlowParty, FlowParty][]): CaseView => {
  const rows: FlowLeg[] = pays.map(([a, b], i) => ({ seq: i, step: "x", say: "x", day: 0, minute: i, from: a.key, to: b.key, how: "fps", rail: "FPS", asset: "GBP", amount: 10, planned: null, seenBy: "bank", tx: null, declined: false }));
  return { ...summary(1, 10 * rows.length, rows.length), parties, rows, endDay: 0, useLabels: {} };
};
{
  const shape = (v: CaseView) => flowColumns(v).map((c) => c.count).join(",");
  const keysOf = (v: CaseView) => flowColumns(v).map((c) => c.key).join(",");
  const L = (n: string) => account(n, "launderer");
  const fanA = L("1"), fanTo = ["2", "3", "4", "5", "6"].map(L);
  const fan = madeView([fanA, ...fanTo], fanTo.map((t) => [fanA, t] as [FlowParty, FlowParty]));
  const cyc = ["1", "2", "3", "4"].map(L);
  const cycle = madeView(cyc, [[cyc[0], cyc[1]], [cyc[1], cyc[2]], [cyc[2], cyc[3]], [cyc[3], cyc[0]]]);
  const left = ["1", "2", "3", "4"].map(L), right = ["5", "6", "7", "8"].map(L);
  const groups = madeView([...left, ...right], left.map((a, i) => [a, right[i]] as [FlowParty, FlowParty]));
  const victims = ["1", "2", "3", "4", "5"].map((n) => account(n, "victim"));
  const outside = ["P1", "P2", "P3", "P4"].map(payer);
  const mule = account("9", "mule"), collector = account("10", "collector");
  const net = madeView([...victims, ...outside, mule, collector], [...victims.map((v) => [v, mule] as [FlowParty, FlowParty]), ...outside.map((o) => [o, mule] as [FlowParty, FlowParty]), [mule, collector]]);
  const cols: [string, string, string][] = [
    ["a fan-out is 2 columns, one account and then 5", shape(fan), "1,5"],
    ["a cycle of 4 accounts is 4 columns", shape(cycle), "1,1,1,1"],
    ["2 groups of 4 accounts are 2 columns of 4", shape(groups), "4,4"],
    ["a mule network is 4 columns of 5, 4, 1 and 1", shape(net), "5,4,1,1"],
    ["a mule network runs victims, payers, the mule, the collector", keysOf(net), "a:victim,x:payer,a9,a10"],
  ];
  for (const [name, got, want] of cols) report(name, got === want ? null : `got ${got}, wanted ${want}`);
}

// the full name of a party
console.log("partyName");
{
  const ADDRESS = "bc1q9h7fkd0xw2m4c3zq8la5ujv6stn0y7pre4x2k";
  const outsider = (key: string, label: string, kind: string, address: string | null = null): FlowParty => ({ key, group: "x:" + kind, label, kind, role: null, family: null, account: null, address, part: null, end: null, partLabel: null });
  const names: [string, string, string][] = [
    ["an account is its role and its customer id", partyName({ ...account("1", "mule"), label: "CUST-001077" }), "Mule account CUST-001077"],
    ["an account of a library case is the label of its part file and its customer id", partyName({ ...account("2", "mule"), label: "CUST-000146", partLabel: "the first mule account" }), "The first mule account CUST-000146"],
    ["a party with no name of its own is its label", partyName(outsider("x:cash-in", "cash paid in", "cash-in")), "Cash paid in"],
    ["a merchant adds its name", partyName(outsider("x:Tesco", "a merchant", "merchant")), "A merchant Tesco"],
    ["a name that equals the label is not repeated", partyName(outsider("x:a merchant", "a merchant", "merchant")), "A merchant"],
    ["a wallet adds its short address", partyName(outsider("x:" + ADDRESS, "a wallet", "wallet", ADDRESS)), `A wallet ${ADDRESS.slice(0, 6)}…${ADDRESS.slice(-4)}`],
  ];
  for (const [name, got, want] of names) report(name, got === want ? null : `got "${got}", wanted "${want}"`);
}

const sets: [string, Dataset][] = [
  ["default seed 20260904", generate({ ...DEFAULT_CONFIG, seed: 20260904 }, wallets)],
  ["default seed 77", generate({ ...DEFAULT_CONFIG, seed: 77 }, wallets)],
  ["crypto-linked seed 20260904", generate(ARCHETYPES.cryptolinked.patch({ ...DEFAULT_CONFIG, seed: 20260904 }), wallets)],
];

for (const [name, ds] of sets) {
  console.log(name);
  const cases = listCases(ds);
  const distinct = new Set(ds.patterns.filter((p) => p.caseId >= 0).map((p) => p.caseId));
  const views = new Map<number, CaseView>();
  let first: string | null = null;

  // 1
  if (cases.length !== distinct.size) first = `${cases.length} entries for ${distinct.size} cases`;
  for (const id of distinct) {
    const v = caseView(ds, id);
    if (!v) { first ??= `no view for case ${id}`; continue; }
    views.set(id, v);
    if (!cases.some((c) => c.caseId === id)) first ??= `case ${id} is not listed`;
  }
  if (caseView(ds, -12345) !== null) first ??= "a view for a case that does not exist";
  report("1 one entry and one view for each case", first);

  // 2
  const txsOf = new Map<number, number[]>();
  for (const t of ds.txs) { if (!txsOf.has(t.caseId)) txsOf.set(t.caseId, []); txsOf.get(t.caseId)!.push(t.id); }
  first = null;
  for (const [id, v] of views) {
    const want = txsOf.get(id) ?? [];
    const got = v.rows.map((r) => r.tx);
    if (want.length !== got.length || want.some((x, i) => x !== got[i])) { first ??= `case ${id} rows differ from its transactions`; continue; }
    for (let i = 1; i < v.rows.length; i++) {
      const a = v.rows[i - 1], b = v.rows[i];
      if (b.day < a.day || (b.day === a.day && b.minute < a.minute)) { first ??= `case ${id} goes back in time at row ${i}`; break; }
    }
  }
  report("2 rows are the transactions of the case, in time order", first);

  // 3
  first = null;
  for (const [id, v] of views) {
    const planted = ds.patterns.filter((p) => p.caseId === id);
    const rows = v.rows.reduce((s, r) => s + r.amount, 0);
    const total = planted.reduce((s, p) => s + p.total, 0);
    if (Math.abs(rows - total) > planted.length) { first ??= `case ${id}: rows ${rows.toFixed(2)}, patterns ${total.toFixed(2)}`; }
  }
  report("3 amounts of the rows match the totals of the patterns", first);

  // 4
  first = null;
  for (const [id, v] of views) {
    const keys = new Set(v.parties.map((p) => p.key));
    const named = new Set<string>();
    for (const r of v.rows) {
      named.add(r.from); named.add(r.to);
      if (!keys.has(r.from) || !keys.has(r.to)) first ??= `case ${id} row ${r.seq} names ${keys.has(r.from) ? r.to : r.from}`;
    }
    for (const k of keys) if (!named.has(k)) first ??= `case ${id} party ${k} is named by no row`;
    if (keys.size !== v.parties.length) first ??= `case ${id} has a party twice`;
  }
  report("4 every row names parties of the view and every party is named", first);

  // 5
  first = null;
  let mostColumns = 0;
  for (const [id, v] of views) {
    const cols = flowColumns(v);
    mostColumns = Math.max(mostColumns, cols.length);
    if (v.rows.length && cols.length < 2) first ??= `case ${id} has ${cols.length} column`;
    const inColumn = new Map<string, number>();
    for (const c of cols) for (const k of c.parties) inColumn.set(k, (inColumn.get(k) ?? 0) + 1);
    for (const p of v.parties) if (inColumn.get(p.key) !== 1) first ??= `case ${id} party ${p.key} is in ${inColumn.get(p.key) ?? 0} columns`;
    const reached = new Set<string>();
    for (const r of v.rows) for (const k of [r.from, r.to]) for (const c of cols) if (c.parties.includes(k)) reached.add(c.key);
    for (const c of cols) if (!reached.has(c.key)) first ??= `case ${id} column ${c.key} is reached by no row`;
    for (const c of cols) if (c.count !== c.parties.length) first ??= `case ${id} column ${c.key} count differs`;
  }
  report("5 columns are reached and hold every party once", first);

  // 6
  first = null;
  for (const t of ds.txs) if (t.patternId >= 0 && t.caseId < 0) { first ??= `transaction ${t.id} of pattern ${t.patternId}`; break; }
  report("6 a planted transaction always has a case", first);

  // 7
  first = null;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const total = ds.patterns.filter((p) => p.caseId === c.caseId).reduce((s, p) => s + p.total, 0);
    if (Math.abs(total - c.value) > 1e-6) first ??= `case ${c.caseId} value ${c.value} against ${total}`;
    if (i > 0) {
      const a = cases[i - 1];
      if (a.value < c.value || (a.value === c.value && a.caseId > c.caseId)) first ??= `case ${c.caseId} is out of order`;
    }
  }
  report("7 the list is in order of value and each value is the sum of its patterns", first);

  // 8
  first = null;
  for (const [id, v] of views) {
    const planted = ds.patterns.filter((p) => p.caseId === id).sort((a, b) => a.id - b.id);
    for (const p of v.parties) {
      if (p.account === null) continue;
      if (p.label !== (ds.accounts[p.account]?.customerId ?? String(p.account))) first ??= `case ${id} party ${p.key} label ${p.label}`;
      const owner = planted.find((q) => q.accounts.includes(p.account!));
      const role = owner ? owner.roles[p.account] ?? null : null;
      if (p.role !== role) first ??= `case ${id} party ${p.key} role ${p.role} against ${role}`;
    }
  }
  report("8 account parties carry the customer id and the role", first);

  // 9
  const pick = pickCase(cases);
  let best: CaseSummary | null = null;
  for (const c of cases) if (c.legs >= 4 && c.legs <= 14 && (!best || c.value > best.value || (c.value === best.value && c.caseId < best.caseId))) best = c;
  report("9 pickCase gives the largest value among the cases of 4 to 14 legs where there is one", !pick ? "no case picked" : best && pick.caseId !== best.caseId ? `picked case ${pick.caseId}, wanted case ${best.caseId}` : !best && cases.some((c) => c.legs < pick.legs) ? `picked case ${pick.caseId} with ${pick.legs} legs, and a case has fewer` : null);

  // 10
  first = null;
  for (const [id, v] of views) {
    const steps = caseSteps(v);
    const seen = new Map<number, number>();
    let last = -1;
    for (const s of steps) {
      if (!s.rows.length) first ??= `case ${id} step ${s.step} has no row`;
      let before = -1;
      for (const r of s.rows) {
        seen.set(r.seq, (seen.get(r.seq) ?? 0) + 1);
        if (r.step !== s.step) first ??= `case ${id} row ${r.seq} is in step ${s.step} but names ${r.step}`;
        if (r.seq <= before) first ??= `case ${id} step ${s.step} is out of the order of the view at row ${r.seq}`;
        before = r.seq;
      }
      if (s.rows.length && s.rows[0].seq <= last) first ??= `case ${id} step ${s.step} starts before the step ahead of it`;
      if (s.rows.length) last = s.rows[0].seq;
    }
    if (steps.length !== new Set(v.rows.map((r) => r.step)).size) first ??= `case ${id} has ${steps.length} steps for ${new Set(v.rows.map((r) => r.step)).size} distinct steps`;
    for (const r of v.rows) if (seen.get(r.seq) !== 1) first ??= `case ${id} row ${r.seq} is in ${seen.get(r.seq) ?? 0} steps`;
  }
  report("10 every row is in one step, steps follow their first legs and rows follow the view", first);

  // 11
  first = null;
  const perKey = new Map<string, number>();
  for (const c of cases) for (const k of c.keys) perKey.set(k, (perKey.get(k) ?? 0) + 1);
  const topKeys = [...perKey.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 3).map((e) => e[0]);
  for (const key of topKeys) {
    const own = patternCases(cases, key);
    const want = new Map<string, number>();
    for (const c of own) for (const s of caseSteps(views.get(c.caseId)!)) want.set(s.step, (want.get(s.step) ?? 0) + 1);
    const got = patternSteps(ds, key);
    if (got.length !== want.size) { first ??= `${key} has ${got.length} steps for ${want.size} distinct steps`; continue; }
    for (const g of got) if (want.get(g.step) !== g.cases) first ??= `${key} step ${g.step} is in ${g.cases} cases, wanted ${want.get(g.step)}`;
    if (new Set(got.map((g) => g.step)).size !== got.length) first ??= `${key} lists a step twice`;
    const lead = caseSteps(views.get(own[0].caseId)!).map((s) => s.step);
    const order = got.map((g) => g.step);
    let from = 0;
    for (const step of lead) {
      const at = order.indexOf(step, from);
      if (at < 0) { first ??= `${key} lists the step ${step} of its largest case out of the order of that case`; break; }
      from = at + 1;
    }
  }
  report("11 the steps of a pattern are the distinct steps of its cases, each with its number of cases", first);

  // 12
  first = null;
  for (const [id, v] of views) {
    if (v.parties.some((p) => p.part !== null)) continue;
    const cols = flowColumns(v);
    const colOf = new Map<string, string>();
    for (const c of cols) for (const k of c.parties) colOf.set(k, c.key);
    for (const r of v.rows) if (r.from !== r.to && colOf.get(r.from) === colOf.get(r.to)) first ??= `case ${id} (${patternLabel(v.keys[0])}) leg ${r.seq} from ${r.from} to ${r.to} stays in column ${colOf.get(r.from)}`;
  }
  report("12 no leg of a built-in case has its payer and its payee in one column", first);

  // 13
  first = null;
  const tally = new Map<number, number>();
  let beyond = 0;
  for (const [id, v] of views) {
    const cols = flowColumns(v);
    tally.set(cols.length, (tally.get(cols.length) ?? 0) + 1);
    if (cols.length > DRAWN_COLUMNS) beyond++;
    const at = new Map<string, number>();
    cols.forEach((c, i) => c.parties.forEach((k) => at.set(k, i)));
    const paid = new Set<number>();
    for (const r of v.rows) paid.add(at.get(r.to)!);
    for (let i = 0; i < cols.length; i++) {
      if (paid.has(i)) continue;
      const leg = v.rows.find((r) => at.get(r.from) === i);
      if (leg && at.get(leg.to)! <= i) first ??= `case ${id} (${patternLabel(v.keys[0])}) column ${cols[i].key} at ${i} pays column ${at.get(leg.to)} by leg ${leg.seq}`;
    }
  }
  report("13 every column that only pays is left of the column that its first leg pays", first);

  // 14
  first = null;
  for (const [id, v] of views) for (const c of flowColumns(v)) if (c.count > 1 && c.count <= 3) first ??= `case ${id} (${patternLabel(v.keys[0])}) column ${c.key} holds ${c.count} parties`;
  report("14 a column that holds more than one party holds more than 3", first);

  console.log(`  figures: ${cases.length} cases, most legs in a case ${Math.max(0, ...cases.map((c) => c.legs))}, most columns ${mostColumns}`);
  console.log(`  columns: ${[...tally.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n} columns: ${k} cases`).join(", ")}; more than ${DRAWN_COLUMNS} columns: ${beyond} cases`);
}

// library cases: a data set with the ransom pattern and the peel chain pattern on, the ransom pattern at both ends, at the top rate in a short run so that some payments do not happen
console.log("library cases");
{
  const lib = {
    "ransom-through-a-mixer": { on: true, per1k: 5, size: 1, speed: 0.25, bankSees: "both" as const },
    "stolen-funds-through-a-peel-chain": { on: true, per1k: 5, size: 1, speed: 0.25, bankSees: "cash-out" as const },
  };
  const ds = generate({ ...DEFAULT_CONFIG, seed: 20260904, accounts: 1200, days: 28, library: lib }, wallets);
  const cases = listCases(ds);
  const libCases = ds.library?.cases ?? [];
  const mine = cases.filter((c) => libCases.some((e) => e.caseId === c.caseId));
  let first: string | null = null;

  // L1
  const rowsOf = new Map<number, number>();
  for (const l of ds.caseLegs) rowsOf.set(l.caseId, (rowsOf.get(l.caseId) ?? 0) + 1);
  if (mine.length !== libCases.length || libCases.length === 0) first = `${mine.length} entries for ${libCases.length} library cases`;
  for (const e of libCases) {
    const c = cases.find((x) => x.caseId === e.caseId);
    if (!c) { first ??= `case ${e.caseId} is not listed`; continue; }
    const planted = ds.patterns.filter((p) => p.caseId === e.caseId);
    if (c.title !== patternOf(e.pattern)!.title) first ??= `case ${e.caseId} title ${c.title}`;
    if (c.value !== e.value || c.startDay !== e.startDay) first ??= `case ${e.caseId} value or first day differs from the record`;
    if (c.legs !== rowsOf.get(e.caseId)) first ??= `case ${e.caseId} has ${c.legs} payments for ${rowsOf.get(e.caseId)} rows`;
    if (c.keys.length !== new Set(planted.map((p) => p.typology)).size || planted.some((p) => !c.keys.includes(p.typology) || !c.families.includes(p.family))) first ??= `case ${e.caseId} keys or families differ from its planted patterns`;
  }
  if (cases.length !== new Set(ds.patterns.filter((p) => p.caseId >= 0).map((p) => p.caseId)).size) first ??= "the list does not hold one entry for each planted case";
  report("L1 one entry for each library case with the fields of the record", first);

  // L2
  first = null;
  const views = new Map<number, CaseView>();
  for (const e of libCases) {
    const v = caseView(ds, e.caseId);
    if (!v) { first ??= `no view for case ${e.caseId}`; continue; }
    views.set(e.caseId, v);
    const legs = ds.caseLegs.filter((l) => l.caseId === e.caseId).sort((a, b) => a.seq - b.seq);
    if (legs.length !== v.rows.length) { first ??= `case ${e.caseId} has ${v.rows.length} rows for ${legs.length} legs`; continue; }
    legs.forEach((l, i) => {
      const r = v.rows[i];
      if (r.step !== `${l.part}.${l.step}` || r.say !== l.say || r.how !== l.via || r.from !== l.from || r.to !== l.to || r.day !== l.day || r.minute !== l.minute || r.tx !== l.tx) first ??= `case ${e.caseId} row ${i} differs from its leg`;
      if (i > 0 && legs[i - 1].seq >= l.seq) first ??= `case ${e.caseId} legs are not in the order of seq`;
    });
  }
  report("L2 the payments of a library case are its rows in the order of seq, with part, step, sentence and way of paying", first);

  // L3
  first = null;
  for (const [id, v] of views) {
    const names = new Set(librarySteps(libCases.find((e) => e.caseId === id)!.pattern).map((s) => s.step));
    for (const r of v.rows) {
      const tail = r.step.slice(r.step.lastIndexOf(".") + 1);
      if (!names.has(r.step) && tail !== "handoff") first ??= `case ${id} row ${r.seq} names the step ${r.step}`;
      const words = tail.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/-/g, " ").toLowerCase();
      if (stepTitle(r.step) !== (tail === "handoff" ? "Hand-off" : words.charAt(0).toUpperCase() + words.slice(1))) first ??= `the title of ${r.step} is ${stepTitle(r.step)}`;
    }
    if (caseSteps(v).length !== new Set(v.rows.map((r) => r.step)).size) first ??= `case ${id} steps differ from its distinct steps`;
  }
  report("L3 each step is a step of the files or a hand-off, and its title is the step id in words", first);

  // L4
  first = null;
  const seen = new Set<string>();
  for (const v of views.values()) for (const r of v.rows) seen.add(r.seenBy);
  for (const k of ["bank", "chain", "none"]) if (!seen.has(k)) first ??= `no payment is seen by ${k}`;
  for (const v of views.values()) for (const r of v.rows) if ((r.seenBy === "bank") !== (r.tx !== null) && r.amount > 0) first ??= `case ${v.caseId} row ${r.seq} seenBy ${r.seenBy} with transaction ${r.tx}`;
  report("L4 payments take the 3 values of seenBy, and a payment in the bank's records has a transaction", first);

  // L5
  first = null;
  let never = 0;
  for (const v of views.values()) for (const r of v.rows) {
    if (r.amount === 0) { never++; if (r.planned === null || !(r.planned > 0)) first ??= `case ${v.caseId} row ${r.seq} did not happen and has no planned amount`; }
  }
  if (never === 0) first ??= "no payment of the data set did not happen";
  report("L5 a payment that did not happen has the amount 0 and keeps its planned amount", first);

  // L6
  first = null;
  let longest: CaseView | null = null;
  for (const v of views.values()) if (!longest || v.rows.length > longest.rows.length) longest = v;
  const tallyColumns = new Map<number, number>();
  for (const v of views.values()) {
    const cols = flowColumns(v);
    tallyColumns.set(cols.length, (tallyColumns.get(cols.length) ?? 0) + 1);
    const inColumn = new Map<string, number>();
    for (const c of cols) for (const k of c.parties) inColumn.set(k, (inColumn.get(k) ?? 0) + 1);
    for (const p of v.parties) if (inColumn.get(p.key) !== 1) first ??= `case ${v.caseId} party ${p.key} is in ${inColumn.get(p.key) ?? 0} columns`;
  }
  const longCols = longest ? flowColumns(longest) : [];
  if (!longest || longCols.length < 2 || longCols.length > DRAWN_COLUMNS) first ??= `the longest case has ${longCols.length} columns`;
  if (longest && longest.parties.filter((p) => p.part !== null && p.group === "peel-chain.hops").length > 3 && !longCols.some((c) => c.count > 3)) first ??= "the run of wallets does not share a column";
  report("L6 the longest case has 2 to 8 columns, and every party is in one column", first);

  // L7
  first = null;
  for (const id of ["ransom-through-a-mixer", "stolen-funds-through-a-peel-chain"]) {
    const keys = (patternOf(id) ? labelsOf([patternOf(id)!], PARTS)[0].keys.map((k) => k.key) : []);
    const byId = patternCases(cases, id).map((c) => c.caseId).join(",");
    for (const k of keys) if (patternCases(cases, k).map((c) => c.caseId).join(",") !== byId) first ??= `${k} gives other cases than ${id}`;
    if (!byId) first ??= `${id} holds no case`;
    const want = librarySteps(id).map((s) => s.step).join(",");
    const got = patternSteps(ds, id).map((s) => s.step).join(",");
    if (got !== want || patternSteps(ds, keys[0]).map((s) => s.step).join(",") !== want) first ??= `${id} steps ${got} against the files ${want}`;
    if (patternSteps(ds, id).some((s) => !s.say)) first ??= `${id} has a step without a sentence`;
  }
  if (patternCases(cases, "lib.ransom-through-a-mixer.cash-out").length === 0) first ??= "the cash-out key finds no case of the pattern that is seen at both ends";
  report("L7 the cases and the steps of a library pattern are the same for its id and for each of its keys", first);

  // L8
  first = null;
  for (const v of views.values()) for (const p of v.parties) {
    if ((p.account !== null) !== (p.role !== null)) first ??= `case ${v.caseId} party ${p.key} has account ${p.account} and role ${p.role}`;
    if (p.account !== null && p.label !== (ds.accounts[p.account]?.customerId ?? String(p.account))) first ??= `case ${v.caseId} party ${p.key} label ${p.label}`;
    if (p.part === null || p.end === null) first ??= `case ${v.caseId} party ${p.key} has no part or end`;
  }
  report("L8 a party with an account has its role and its customer id, and every party has its part and end", first);

  // the typical case of each pattern
  for (const id of ["ransom-through-a-mixer", "stolen-funds-through-a-peel-chain"]) {
    const a = typicalCaseView(id), b = typicalCaseView(id);
    report(`T1 2 calls of typicalCaseView give the same view for ${id}`, a && b && JSON.stringify(a) === JSON.stringify(b) ? null : "the views differ or are null");
    first = null;
    if (a) {
      const have = new Set(a.rows.map((r) => r.step));
      for (const s of librarySteps(id)) if (s.required && !have.has(s.step)) first ??= `the required step ${s.step} has no payment`;
      if (a.rows.some((r) => r.amount <= 0)) first ??= "a payment has no amount";
      if (a.caseId !== -1 || flowColumns(a).length < 2) first ??= "the case number or the columns are wrong";
    } else first = "no view";
    report(`T2 the typical case of ${id} holds each required step`, first);
  }
  {
    const ransom = typicalCaseView("ransom-through-a-mixer");
    const peel = typicalCaseView("stolen-funds-through-a-peel-chain");
    first = null;
    if (!ransom) first = "no view";
    else {
      const groups = new Set(ransom.parties.map((p) => p.group)).size;
      const cols = flowColumns(ransom);
      if (groups <= DRAWN_COLUMNS) first ??= `the typical ransom case has ${groups} party groups`;
      if (cols.length > DRAWN_COLUMNS) first ??= `the typical ransom case has ${cols.length} columns`;
      const shared = cols.filter((c) => c.key.startsWith("part:"));
      const hiding = patternOf("ransom-through-a-mixer")?.parts.hiding ?? [];
      if (shared.length !== 2 || hiding.length !== 2) first ??= `the typical ransom case has ${shared.length} shared columns for ${hiding.length} hiding parts`;
      for (const c of shared) {
        const id = c.key.slice(5);
        if (c.label !== PARTS.get(id)?.title) first ??= `the shared column ${id} is labelled ${c.label}`;
        if (c.detail !== `${c.count} parties`) first ??= `the shared column ${id} has the detail ${c.detail}`;
      }
    }
    report("T4 the typical ransom case has more than 8 party groups, at most 8 columns, and 2 shared columns that carry the titles of the parts", first);
    first = null;
    if (!peel) first = "no view";
    else {
      const cols = flowColumns(peel);
      if (DRAWN_COLUMNS !== 8) first ??= `DRAWN_COLUMNS is ${DRAWN_COLUMNS}`;
      if (cols.length !== 8) first ??= `the typical peel case has ${cols.length} columns`;
      if (cols.some((c) => c.key.startsWith("part:"))) first ??= "the typical peel case has a shared column of a part";
    }
    report("T5 the limit of drawn columns is 8 and the typical peel case has 8 columns and no shared column of a part", first);
    first = null;
    const ids = new Set(PARTS.keys());
    for (const v of views.values()) for (const c of flowColumns(v)) if (ids.has(c.label)) first ??= `case ${v.caseId} has a column labelled with the id ${c.label}`;
    report("T6 no column of a library case has the id of a part as its label", first);
  }
  report("T3 typicalCaseView of an unknown id is null", typicalCaseView("no-such-pattern") === null ? null : "not null");

  // the labels inside a shared column
  first = null;
  for (const id of ["ransom-through-a-mixer", "stolen-funds-through-a-peel-chain"]) {
    const v = typicalCaseView(id);
    if (!v) { first ??= `no typical view for ${id}`; continue; }
    const colOf = new Map<string, number>();
    flowColumns(v).forEach((c, i) => c.parties.forEach((k) => colOf.set(k, i)));
    const byKey = new Map(v.parties.map((p) => [p.key, p]));
    for (const r of v.rows) {
      const f = byKey.get(r.from), t = byKey.get(r.to);
      if (f && t && colOf.get(f.key) === colOf.get(t.key) && withinLabel(f, t) !== "") first ??= `${id} row ${r.seq} has the label ${withinLabel(f, t)}`;
    }
    const hiding = new Set((patternOf(id)?.parts.hiding ?? []) as string[]);
    for (const p of v.parties) if (p.part !== null && hiding.has(p.part) && memberRef(p) !== "") first ??= `${id} party ${p.key} has the reference ${memberRef(p)}`;
  }
  report("W1 in the typical cases a payment inside one column has no label, and a party of a hiding part has no reference", first);
  first = null;
  let within = 0, same = 0;
  for (const v of views.values()) {
    const colOf = new Map<string, number>();
    flowColumns(v).forEach((c, i) => c.parties.forEach((k) => colOf.set(k, i)));
    const byKey = new Map(v.parties.map((p) => [p.key, p]));
    for (const r of v.rows) {
      const f = byKey.get(r.from), t = byKey.get(r.to);
      if (!f || !t || colOf.get(f.key) !== colOf.get(t.key)) continue;
      const text = withinLabel(f, t);
      if (r.from === r.to) { same++; if (text !== "") first ??= `case ${v.caseId} row ${r.seq} pays itself and has the label ${text}`; continue; }
      within++;
      if (!/^….{4} pays ….{4}$/.test(text)) first ??= `case ${v.caseId} row ${r.seq} has the label ${text}`;
    }
  }
  if (within === 0) first ??= "no payment of a library case lies inside one column";
  report("W2 a payment between 2 parties of one column has the label of 2 tail forms", first);
  {
    const p = payer("1");
    report("W3 a payment of a party to itself has no label", withinLabel(p, p) === "" ? null : "not empty");
  }
  console.log(`  figures: ${within} payments inside one column, ${same} of a party to itself`);

  console.log(`  figures: ${cases.length} cases, ${libCases.length} library cases, most payments in a library case ${longest?.rows.length ?? 0}, ${never} payments did not happen`);
  console.log(`  columns of library cases: ${[...tallyColumns.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n} columns: ${k} cases`).join(", ")}; more than ${DRAWN_COLUMNS} columns: ${[...tallyColumns.entries()].filter(([n]) => n > DRAWN_COLUMNS).reduce((s, [, k]) => s + k, 0)} cases`);
}

// the standard bank with the ransom pattern and the peel chain pattern on at their own ends, as the panel makes it: the cases by number of columns
console.log("library cases of the standard bank");
{
  const ds = generate({ ...DEFAULT_CONFIG, seed: 20260904, library: {
    "ransom-through-a-mixer": { on: true, per1k: 0.4, size: 1, speed: 1, bankSees: "source" },
    "stolen-funds-through-a-peel-chain": { on: true, per1k: 0.4, size: 1, speed: 1, bankSees: "cash-out" },
  } }, wallets);
  const tally = new Map<number, number>();
  let wrong: string | null = null;
  for (const c of listCases(ds)) {
    const v = caseView(ds, c.caseId);
    if (!v) { wrong ??= `no view for case ${c.caseId}`; continue; }
    const n = flowColumns(v).length;
    tally.set(n, (tally.get(n) ?? 0) + 1);
  }
  report("L9 every case of the standard bank has a view", wrong);
  console.log(`  columns of all ${[...tally.values()].reduce((s, k) => s + k, 0)} cases: ${[...tally.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n} columns: ${k} cases`).join(", ")}`);
}

// the pattern that names a part twice: the uses are told apart in words and the character ~ never reaches a column
console.log("a pattern with a part used twice");
{
  const id = "stolen-funds-through-bridge-and-mixers";
  const pat = patternOf(id)!;
  const ds = generate({ ...DEFAULT_CONFIG, seed: 20260904, library: { [id]: { on: true, per1k: 5, size: 1, speed: 1, bankSees: pat.bankSees } } }, wallets);
  const eq = (name: string, got: unknown, want: unknown) => report(name, JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const want = { mixer: "use 1 of 2", "mixer~2": "use 2 of 2" };
  const typical = typicalCaseView(id);
  const views = [...(typical ? [typical] : []), ...patternCases(listCases(ds), id).map((c) => caseView(ds, c.caseId)).filter((v): v is CaseView => v !== null)];
  const steps = librarySteps(id).map((x) => x.step);
  {
    const dup = steps.find((x, i) => steps.indexOf(x) !== i);
    report("U1 the steps of the pattern hold no key twice and hold both mixer.deposit and mixer~2.deposit", dup ? `${dup} is held twice` : steps.includes("mixer.deposit") && steps.includes("mixer~2.deposit") ? null : "a deposit of a mixer is missing");
  }
  {
    let first: string | null = views.length > 1 ? null : "the data set holds no case of the pattern";
    for (const v of views) for (const r of v.rows) if (!steps.includes(r.step) && !r.step.endsWith(".handoff")) first ??= `case ${v.caseId} has the step ${r.step}`;
    report("U2 each row of each case and of the typical case has a step of the pattern or a hand-off", first);
  }
  {
    let first: string | null = null;
    for (const v of views) if (JSON.stringify(v.useLabels) !== JSON.stringify(want)) first ??= `case ${v.caseId} has ${JSON.stringify(v.useLabels)}`;
    report("U3 useLabels of each view holds the 2 uses of the mixer and no other entry", first);
    eq("U4 useLabelsOf gives the same 2 entries", useLabelsOf(id), want);
  }
  {
    const some = views[0];
    eq("U5 stepHeading names the use of a step", [stepHeading(some, "mixer.deposit"), stepHeading(some, "mixer~2.deposit"), stepHeading(some, "bridge-hop.deposit"), stepHeading(some, "mixer~2.handoff")], ["Deposit (use 1 of 2)", "Deposit (use 2 of 2)", stepTitle("bridge-hop.deposit"), "Hand-off (use 2 of 2)"]);
    report("U6 a step of the part bridge-hop has no brackets", stepHeading(some, "bridge-hop.deposit").includes("(") ? "it has brackets" : null);
  }
  {
    let first: string | null = null, shared = 0;
    for (const v of views) {
      const cols = flowColumns(v);
      for (const c of cols) if (c.label.includes("~") || c.detail.includes("~")) first ??= `case ${v.caseId} has the column ${c.label} / ${c.detail}`;
      const mixers = cols.filter((c) => c.label === PARTS.get("mixer")!.title);
      if (mixers.length === 2) {
        shared++;
        if (mixers[0].detail === mixers[1].detail) first ??= `case ${v.caseId} has 2 mixing columns with the detail ${mixers[0].detail}`;
        const [a, b] = mixers.map((c) => c.detail);
        if (!a.endsWith(", use 1 of 2") || !b.endsWith(", use 2 of 2")) first ??= `case ${v.caseId} has the mixing details ${a} and ${b}`;
      }
    }
    report("U7 no column shows ~ and the 2 columns of the mixing services differ in their detail, which ends with the words of their use", first);
    console.log(`  figures: ${views.length} views, ${shared} with 2 columns that share the title of the mixing service`);
  }
  {
    let first: string | null = null;
    const other = generate({ ...DEFAULT_CONFIG, seed: 20260904, library: { "ransom-through-a-mixer": { on: true, per1k: 5, size: 1, speed: 1, bankSees: patternOf("ransom-through-a-mixer")!.bankSees } } }, wallets);
    for (const [name, set] of [["a built-in data set", sets[0][1]], ["the ransom pattern", other]] as [string, Dataset][]) {
      for (const c of listCases(set)) { const v = caseView(set, c.caseId); if (v && Object.keys(v.useLabels).length) first ??= `${name}, case ${c.caseId}`; }
    }
    const t = typicalCaseView("ransom-through-a-mixer");
    if (!t || Object.keys(t.useLabels).length) first ??= "the typical case of the ransom pattern";
    report("U8 useLabels is empty for a built-in case and for a case of the ransom pattern", first);
  }
}

// wide cases of the 12 library patterns: steps 6 to 8 of flowColumns bring every case to at most DRAWN_COLUMNS columns
console.log("wide cases of the 12 library patterns");
{
  const ids = PATTERNS.map((p) => p.id);
  const allowed = new Map(labelsOf(PATTERNS, PARTS).map((e) => [e.id, e.allowed as string[]]));
  const library: Record<string, { on: boolean; per1k: number; size: number; speed: number; bankSees: "source" | "cash-out" | "both" }> = {};
  for (const id of ids) library[id] = { on: true, per1k: 5, size: 1, speed: 1, bankSees: allowed.get(id)!.includes("both") ? "both" : patternOf(id)!.bankSees };
  const ds = generate({ ...DEFAULT_CONFIG, seed: 20260904, library }, wallets);
  const views: { name: string; id: string; view: CaseView }[] = [];
  for (const id of ids) {
    for (const c of patternCases(listCases(ds), id)) { const v = caseView(ds, c.caseId); if (v) views.push({ name: `case ${c.caseId}`, id, view: v }); }
    for (const end of allowed.get(id)!) views.push({ name: `typical case at ${end}`, id, view: typicalCaseView(id, { bankSees: end as "source" | "cash-out" | "both" })! });
  }
  const typicals = views.filter((x) => x.view.caseId < 0);
  const cases = views.filter((x) => x.view.caseId >= 0);
  let first: string | null = null;
  for (const id of ids) if (!cases.some((x) => x.id === id)) first ??= `the data set holds no case of ${id}`;
  for (const x of cases) { const n = flowColumns(x.view).length; if (n > DRAWN_COLUMNS) first ??= `${x.id} ${x.name} has ${n} columns`; }
  report("V1 every case of each of the 12 patterns in the data set has at most 8 columns", first);
  first = null;
  for (const x of typicals) { const n = flowColumns(x.view).length; if (n > DRAWN_COLUMNS) first ??= `${x.id} ${x.name} has ${n} columns`; }
  report("V2 the typical case of each pattern at each end that it allows has at most 8 columns", first);
  first = null;
  for (const x of views) {
    const named = new Set<string>();
    for (const r of x.view.rows) { named.add(r.from); named.add(r.to); }
    const seen = new Map<string, number>();
    let total = 0;
    for (const c of flowColumns(x.view)) { total += c.count; for (const k of c.parties) seen.set(k, (seen.get(k) ?? 0) + 1); }
    if (total !== named.size) first ??= `${x.id} ${x.name} has columns that hold ${total} parties and its rows name ${named.size}`;
    for (const k of named) if (seen.get(k) !== 1) first ??= `${x.id} ${x.name}: party ${k} is in ${seen.get(k) ?? 0} columns`;
  }
  report("V3 in each case each party is in one column and the counts of the columns add up to the parties that the rows name", first);
  first = null;
  for (const x of views.filter((y) => y.id === "ransom-through-a-mixer" || y.id === "stolen-funds-through-a-peel-chain")) {
    const byKey = new Map(x.view.parties.map((p) => [p.key, p]));
    for (const c of flowColumns(x.view)) {
      if (c.key.startsWith("next:")) first ??= `${x.id} ${x.name} has the column ${c.key}`;
      if (c.key.startsWith("part:")) for (const k of c.parties) { const p = byKey.get(k)!; if (p.end !== "hiding") first ??= `${x.id} ${x.name} has the party ${k} of the end ${p.end} in the column ${c.key}`; }
    }
  }
  report("V4 a case of the ransom pattern or the peel chain has no column whose key starts with next: and no party of a source or cash-out part in a part column", first);
  // the headings of the columns of accounts of a library case
  const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  /** The label that the part file gives the party, read from PARTS and not from the view. */
  const fileLabel = (p: FlowParty): string => {
    const id = p.key.slice((p.part as string).length + 1).split("#")[0];
    return PARTS.get(partIdOf(p.part as string))?.parties.find((x) => x.id === id)?.label ?? "[no party " + id + " in the part file]";
  };
  const endOf = new Map((ds.library?.cases ?? []).map((c) => [c.caseId, c.bankSees]));
  const typicalFor = new Map<string, CaseView>();
  for (const x of typicals) typicalFor.set(x.id + "|" + x.name.replace("typical case at ", ""), x.view);
  first = null;
  let accountColumns = 0;
  for (const x of cases) {
    const byKey = new Map(x.view.parties.map((p) => [p.key, p]));
    const seenHeads = new Set<string>();
    for (const c of flowColumns(x.view)) {
      const p = byKey.get(c.parties[0])!;
      if (p.account === null) continue;
      accountColumns++;
      const want = capFirst(fileLabel(p));
      if (c.label !== want) first ??= `${x.id} ${x.name}: the column of ${p.key} is headed "${c.label}" and its part file says "${want}"`;
      const head = c.label + "|" + c.detail;
      if (seenHeads.has(head)) first ??= `${x.id} ${x.name}: 2 columns carry "${c.label}" over "${c.detail}"`;
      seenHeads.add(head);
    }
  }
  if (!accountColumns) first ??= "the data set holds no column of accounts";
  report("V5 each column of accounts of a library case carries the label of its party in the part file, and no 2 carry the same label and detail", first);
  first = null;
  for (const x of cases) {
    const end = endOf.get(x.view.caseId) as string;
    const typical = typicalFor.get(x.id + "|" + end);
    if (!typical) { first ??= `${x.id} has no typical case at ${end}`; continue; }
    const allowedLabels = new Set<string>([...flowColumns(typical).map((c) => c.label), ...typical.parties.map((p) => capFirst(p.label))]);
    const byKey = new Map(x.view.parties.map((p) => [p.key, p]));
    for (const c of flowColumns(x.view)) {
      if (byKey.get(c.parties[0])!.account !== null && !allowedLabels.has(c.label)) first ??= `${x.id} ${x.name} at the end ${end}: "${c.label}" is no label of the typical case`;
    }
  }
  report("V6 each label of a column of accounts of a planted case is a label of a column or a party of the typical case at the same end", first);
  first = null;
  let builtIn = 0;
  for (const [, set] of sets) {
    for (const c of listCases(set)) {
      const v = caseView(set, c.caseId);
      if (!v) continue;
      for (const col of flowColumns(v)) {
        const p = v.parties.find((q) => q.key === col.parties[0])!;
        if (p.account === null) continue;
        builtIn++;
        if (p.partLabel !== null || col.label !== ROLE_WORD[p.role ?? "other"]) first ??= `built-in case ${c.caseId} has the column heading "${col.label}" for the role ${p.role}`;
      }
    }
  }
  if (!builtIn) first ??= "no column of accounts in a built-in case";
  report("V7 a column of accounts of a built-in case carries the word for its role", first);
  first = null;
  let named = 0;
  for (const x of cases) {
    for (const p of x.view.parties) {
      if (p.account === null) continue;
      named++;
      const want = capFirst(fileLabel(p)) + " " + p.label;
      if (partyName(p) !== want) first ??= `${x.id} ${x.name}: partyName gives "${partyName(p)}" and the label of the part file gives "${want}"`;
    }
  }
  if (!named) first ??= "no account in a library case";
  report("V8 partyName of an account of a library case is the label of its part file with a capital first letter and the customer id", first);
  console.log(`  figures: ${cases.length} cases and ${typicals.length} typical cases, most columns ${views.reduce((m, x) => Math.max(m, flowColumns(x.view).length), 0)}`);

  // hand-made views of library parties
  const lp = (key: string, group: string, kind: string, part: string, end: "source" | "hiding" | "cash-out", extra: Partial<FlowParty> = {}): FlowParty =>
    ({ key, group, label: kind === "customer" ? "CUST-" + key : "a " + kind, kind, role: kind === "customer" ? "mule" : null, family: null, account: kind === "customer" ? 1 : null, address: null, part, end, partLabel: null, ...extra });
  const partId = [...PARTS.keys()][0], otherId = [...PARTS.keys()][1], hideId = [...PARTS.keys()][2];
  const hide = lp(hideId + ".z", "z", "wallet", hideId, "hiding");
  const lib = (parties: FlowParty[], pays: [FlowParty, FlowParty][]) => madeView([...parties, hide], [...pays, ...parties.filter((p) => !pays.some(([a]) => a === p)).map((p) => [p, hide] as [FlowParty, FlowParty])]);
  const byKey = (cols: ReturnType<typeof flowColumns>) => new Map(cols.map((c) => [c.key, c]));
  {
    // step 6: 2 groups of 2 and 5 parties alone in their group, with no account, are 10 columns with the hiding party
    const g1 = ["a1", "a2"].map((k) => lp(partId + "." + k, "g1", "outside-account", partId, "source"));
    const g2 = ["b1", "b2"].map((k) => lp(partId + "." + k, "g2", "outside-account", partId, "source"));
    const alone = ["c1", "c2", "c3", "c4", "c5"].map((k) => lp(partId + "." + k, "alone-" + k, "outside-account", partId, "source"));
    const v = lib([...g1, ...g2, ...alone], []);
    const cols = flowColumns(v), at = byKey(cols);
    report("X1 step 6 brings 10 columns to 8: a group of 2 shares a column that has its group as its key", cols.length === 8 && at.get("g1")?.count === 2 && at.get("g2")?.count === 2 && at.get("g1")?.detail === "2 parties" ? null : `got ${cols.map((c) => c.key + "/" + c.count).join(",")}`);
    report("X2 step 6 leaves a party that is alone in its group in its own column and does not share the part", alone.every((p) => at.get(p.key)?.count === 1) && !at.has("part:" + partId) ? null : "a party that is alone changed its column");
  }
  {
    // step 7: 10 parties of a part with no account, each alone in its group
    const ps = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((k) => lp(partId + "." + k, "alone-" + k, "outside-account", partId, "source"));
    const cols = flowColumns(lib(ps, []));
    const shared = cols.filter((c) => c.key === "part:" + partId);
    report("X3 step 7 gives the parties of a part with no account one column with the title of the part", cols.length === 2 && shared.length === 1 && shared[0].count === 10 && shared[0].label === PARTS.get(partId)!.title && shared[0].detail === "10 parties" ? null : `got ${cols.map((c) => c.key + "/" + c.label + "/" + c.detail).join(",")}`);
    const one = flowColumns(lib([ps[0], ps[1]], []));
    report("X4 step 7 does not run for a case of at most 8 columns", one.every((c) => !c.key.startsWith("part:" + partId)) ? null : "a part column was made");
  }
  {
    // step 8: 2 accounts, 6 parties that the accounts pay and 1 outside party that pays an account
    const a1 = lp(otherId + ".a1", "acc-1", "customer", otherId, "source"), a2 = lp(otherId + ".a2", "acc-2", "customer", otherId, "source");
    const q = lp(otherId + ".q", "q", "outside-account", otherId, "source");
    const next = ["n1", "n2", "n3", "n4", "n5", "n6"].map((k) => lp(otherId + "." + k, "n-" + k, "outside-account", otherId, "source"));
    const v = madeView([a1, a2, q, ...next, hide], [[q, a1], [a1, next[0]], [a1, next[1]], [a1, next[2]], [a2, next[3]], [a2, next[4]], [a2, next[5]], ...[a1, a2, ...next].map((p) => [p, hide] as [FlowParty, FlowParty])]);
    const cols = flowColumns(v), at = byKey(cols);
    const col = at.get("next:" + otherId);
    report("X5 step 8 gives the parties that the accounts pay one column labelled Where the money goes next", col && col.label === "Where the money goes next" && col.count === 6 && col.detail === "6 parties" ? null : `got ${cols.map((c) => c.key + "/" + c.label + "/" + c.count).join(",")}`);
    report("X6 step 8 leaves a party that pays an account in a column of its own", at.get(q.key)?.count === 1 && !col?.parties.includes(q.key) && !col?.parties.includes(a1.key) ? null : "the party that pays an account was moved");
    // 1 party that no account pays gains no shared column: 1 receiver and 7 payers of the accounts
    const o1 = lp(otherId + ".o1", "o-1", "outside-account", otherId, "source");
    const qs = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"].map((k) => lp(otherId + "." + k, "o-" + k, "outside-account", otherId, "source"));
    const w = madeView([a1, a2, o1, ...qs, hide], [...qs.map((p) => [p, a1] as [FlowParty, FlowParty]), [a1, o1], [a2, hide], [o1, hide]]);
    const wc = flowColumns(w);
    report("X7 step 8 gives a part with 1 such party no shared column", wc.length === 11 && wc.every((c) => !c.key.startsWith("next:")) ? null : `got ${wc.map((c) => c.key).join(",")}`);
    // the detail of an outside party of a library case
    const m = lp(otherId + ".gift", "gift", "merchant", otherId, "source");
    const mc = flowColumns(madeView([m, hide], [[m, hide]]));
    const builtIn = flowColumns(madeView([{ ...m, key: "x:Tesco", part: null, end: null }, payer("1")], [[{ ...m, key: "x:Tesco", part: null, end: null }, payer("1")]]));
    report("X8 the detail of a column of a library party of the kind merchant is empty, and a built-in merchant keeps its name", mc[0].detail === "" && builtIn[0].detail === "Tesco" ? null : `got "${mc[0].detail}" and "${builtIn[0].detail}"`);
  }
}

// the functions that the pages call for the ledger, the list of references and the panel of library patterns
console.log("page functions");
{
  const eq = (name: string, got: unknown, want: unknown) => report(name, JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  eq("N1 a short address is split from its words", splitShortAddress("Wallet bc1q09…64dk"), { head: "Wallet ", address: "bc1q09…64dk" });
  eq("N2 a name with no short address is whole", splitShortAddress("CUST-0001"), { head: "CUST-0001", address: null });
  eq("N3 a bare short address has an empty head", splitShortAddress("bc1q09…64dk"), { head: "", address: "bc1q09…64dk" });
  eq("N4 the dot sits low where payer and payee share a column", ledgerDotY(2, 2, "64%", "86%"), "86%");
  eq("N5 the dot keeps the line height between columns", ledgerDotY(1, 2, "64%", "86%"), "64%");
  eq("N6 the dot keeps the line height where a party has no column", ledgerDotY(undefined, undefined, "64%", "86%"), "64%");
  eq("N7 a source of the pattern comes first, each source appears once, and its pages are those of every citation", mergeReferences([[{ id: "S57", pages: "10" }, { id: "S58" }], [{ id: "S58", pages: "3" }, { id: "S59", pages: "4" }], [{ id: "S59", pages: "9" }]]), [{ id: "S57", pages: "10" }, { id: "S58", pages: "3" }, { id: "S59", pages: "4, 9" }]);
  eq("N8 the rate is read in words", [libraryRateText(0.5), libraryRateText(1)], ["0.5 cases for each 1,000 accounts", "1 case for each 1,000 accounts"]);
  eq("N9 the count is read in words", [libraryCountText(0), libraryCountText(1), libraryCountText(2)], ["0 cases", "1 case", "2 cases"]);
}

// the typical case under a size, a speed and an end, its length in words and the note of a reference
console.log("settings of the typical case");
{
  const eq = (name: string, got: unknown, want: unknown) => report(name, JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const allowedOf = new Map(labelsFile.patterns.map((p) => [p.id, p.allowed as string[]]));
  const bankRows = (v: CaseView) => v.rows.filter((r) => r.seenBy === "bank").length;
  for (const p of PATTERNS) {
    const base = typicalCaseView(p.id)!;
    eq(`T1 ${p.id}: a call with one argument equals the view with the pattern's own values`, typicalCaseView(p.id, { size: 1, speed: 1, bankSees: p.bankSees }), base);
    for (const size of [0.25, 0.5, 2, 4]) {
      const v = typicalCaseView(p.id, { size })!;
      let first: string | null = null;
      if (v.rows.length !== base.rows.length) first = `${v.rows.length} payments, not ${base.rows.length}`;
      else if (Math.abs(v.value - base.value * size) > 0.01 * base.rows.length) first = `the value is ${v.value}, wanted ${base.value * size}`;
      report(`T2 ${p.id}: at the size ${size} the value is ${size} times the value at size 1, within 1 penny for each payment, and the payments are the same`, first);
    }
    const slow = caseMinutes(typicalCaseView(p.id, { speed: 0.25 })!), own = caseMinutes(base);
    report(`T3 ${p.id}: at a quarter of the speed the case lasts 3.5 to 4.5 times as long`, own > 0 && slow / own >= 3.5 && slow / own <= 4.5 ? null : `${slow} minutes against ${own}`);
    if ((allowedOf.get(p.id) ?? []).length === 3) {
      const both = bankRows(typicalCaseView(p.id, { bankSees: "both" })!), src = bankRows(typicalCaseView(p.id, { bankSees: "source" })!), out = bankRows(typicalCaseView(p.id, { bankSees: "cash-out" })!);
      report(`T4 ${p.id}: at both ends more payments are in the bank's records than at either end`, both > src && both > out ? null : `both ${both}, source ${src}, cash-out ${out}`);
    }
  }
  const one = typicalCaseView(PATTERNS[0].id)!;
  eq("T5 a view with 1 payment lasts 0 minutes, and a view with 2 payments lasts the time between them", [caseMinutes({ ...one, rows: one.rows.slice(0, 1) }), caseMinutes({ ...one, rows: [{ ...one.rows[0], day: 0, minute: 10 }, { ...one.rows[0], day: 1, minute: 5 }] })], [0, 1435]);
  eq("T6b under 24 hours never reads as a day", [lengthText(1439), lengthText(1430), lengthText(1380)], ["23 hours", "23 hours", "23 hours"]);
  eq("T6 a length is written in minutes, hours, or days and hours", [lengthText(40), lengthText(900), lengthText(3360), lengthText(17280), lengthText(1), lengthText(60), lengthText(1440)], ["40 minutes", "15 hours", "2 days and 8 hours", "12 days", "1 minute", "1 hour", "1 day"]);
  eq("T7 the merge of references lists each different note of an id, in the order of the citations", mergeReferences([[{ id: "x99", pages: "3", note: "first" }], [{ id: "x99", note: "second" }, { id: "x98", note: "other" }], [{ id: "x99", note: "first" }]]), [{ id: "x99", pages: "3", note: "first second" }, { id: "x98", note: "other" }]);
  eq("T8 a source that 2 citations give with other pages lists the pages of both, in ascending order", mergeReferences([[{ id: "x99", pages: "20 to 22, 29" }], [{ id: "x99", pages: "10, 20 to 22" }]]), [{ id: "x99", pages: "10, 20 to 22, 29" }]);
  eq("T8b a range and a page inside it give the range once, runs of 3 or more are ranges and a text that is no page keeps its place after the numbers", mergeReferences([[{ id: "x99", pages: "7, 16, 17, 29, 30, 42, appendix" }], [{ id: "x99", pages: "15 to 20, 19, 33 to 35" }]]), [{ id: "x99", pages: "7, 15 to 20, 29, 30, 33 to 35, 42, appendix" }]);
  eq("T9 a source cited twice with the same pages lists them once", mergeReferences([[{ id: "x99", pages: "7, 16" }], [{ id: "x99", pages: "7, 16" }]]), [{ id: "x99", pages: "7, 16" }]);
}

// the drawn ledger of the typical case of each pattern at each end that it allows: the names of a payment inside one column and the paragraph above the table
console.log("drawn ledger");
{
  const eq = (name: string, got: unknown, want: unknown) => report(name, JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const allowedOf = new Map(labelsFile.patterns.map((p) => [p.id, p.allowed as string[]]));
  const cal = makeCalendar(1, 90);
  const partIds = [...PARTS.keys()];
  let sawDot = false, sawLabel = false;
  for (const p of PATTERNS) {
    for (const end of allowedOf.get(p.id) ?? []) {
      const v = typicalCaseView(p.id, { bankSees: end as "source" | "cash-out" | "both" })!;
      const cols = flowColumns(v);
      const at = new Map<string, number>();
      cols.forEach((c, i) => c.parties.forEach((k) => at.set(k, i)));
      const byKey = new Map(v.parties.map((x) => [x.key, x]));
      let untitled: string | null = null, bad: string | null = null, labelled = 0, dots = 0, hidden: string | null = null;
      for (const leg of v.rows) {
        const row = readTree(DrawnRow({ leg, cols, at, byKey, cal }));
        const titles = row.titles;
        const texts = row.text;
        const html = texts + " " + titles.join(" ");
        if (html.includes("~") || partIds.some((id) => html.includes(id))) bad = bad ?? `a page text of ${leg.step} holds ~ or an id of a part file`;
        const fi = at.get(leg.from), ti = at.get(leg.to);
        if (fi === undefined || fi !== ti) continue;
        const from = byKey.get(leg.from)!, to = byKey.get(leg.to)!;
        const own = leg.from === leg.to;
        if (own) dots++; else if (withinLabel(from, to)) labelled++; else dots++;
        const names = titles.filter((x) => (own ? x.startsWith("A payment inside ") : x.includes(" pays ")));
        if (names.length !== 1) untitled = untitled ?? `${leg.step} has ${names.length} titles with 2 names or of a payment inside one party`;
        if (!own && withinLabel(from, to) && row.hidden.length === 0) hidden = hidden ?? `${leg.step}: the visible label is not hidden from a screen reader`;
        if (!texts.includes(own ? "a payment inside" : " pays ")) untitled = untitled ?? `${leg.step}: no text for a screen reader`;
      }
      report(`D1 ${p.id} at ${end}: every cell of a payment inside one column has a title with 2 names or of a payment inside one party`, untitled);
      report(`D2 ${p.id} at ${end}: no title, label or text of the drawn rows holds ~ or an id of a part file`, bad);
      report(`D3 ${p.id} at ${end}: the visible label of a payment inside one column is hidden from a screen reader`, hidden);
      const read = ledgerRead(v, true, cols, caseSteps(v));
      const dotWords = "A dot with no line is a payment inside one column.", labelWords = "Inside a shared column, a label names the party";
      if (dots) sawDot = true;
      if (labelled) sawLabel = true;
      report(`D4 ${p.id} at ${end}: the paragraph holds the sentence on a dot with no line only where such a row exists, and the sentence on a label only where a row has a label`, read.includes(dotWords) === dots > 0 && read.includes(labelWords) === labelled > 0 ? null : `dot rows ${dots}, label rows ${labelled}, paragraph "${read}"`);
    }
  }
  report("D5 some typical case holds a dot with no line and the paragraph says so", sawDot ? null : "no typical case holds one");
  // a typical case holds no label, so give the 2 parties of its first payment between 2 members of one column an address each
  for (const p of PATTERNS) {
    const v = typicalCaseView(p.id)!;
    const cols = flowColumns(v);
    const at = new Map<string, number>();
    cols.forEach((c, i) => c.parties.forEach((k) => at.set(k, i)));
    const leg = v.rows.find((r) => r.from !== r.to && at.get(r.from) !== undefined && at.get(r.from) === at.get(r.to));
    if (!leg) continue;
    const parties = v.parties.map((x) => (x.key === leg.from ? { ...x, address: "bc1qaaaaaaaaaaaa1234" } : x.key === leg.to ? { ...x, address: "bc1qbbbbbbbbbbbb5678" } : x));
    const byKey = new Map(parties.map((x) => [x.key, x]));
    const row = readTree(DrawnRow({ leg, cols, at, byKey, cal }));
    eq(`D6 ${p.id}: a payment inside one column with a label hides the label from a screen reader and has a title with 2 names`, [row.hidden.join("").includes("1234 pays"), row.titles.some((x) => x.includes(" pays "))], [true, true]);
    const read = ledgerRead({ ...v, parties }, true, cols, [{ step: leg.step, rows: [leg] }]);
    eq(`D7 ${p.id}: a paragraph over a row with a label holds the sentence on a label and none on a dot with no line`, [read.includes("a label names the party"), read.includes("A dot with no line")], [true, false]);
    break;
  }
  eq("D8 a paragraph over no row holds neither sentence", [ledgerRead(typicalCaseView(PATTERNS[0].id)!, true, [], []).includes("A dot with no line"), ledgerRead(typicalCaseView(PATTERNS[0].id)!, true, [], []).includes("a label names")], [false, false]);
  console.log(`  (a typical case with a label inside a shared column: ${sawLabel})`);
}

console.log(failures ? `\n${failures} FAILED` : "\nall ok");
process.exit(failures ? 1 : 0);
