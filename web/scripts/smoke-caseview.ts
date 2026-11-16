// Test of the case view (src/lib/gen/caseView.ts): makes 3 data sets with the working wallet pool and checks, for
// each, that every planted case becomes a view whose legs, parties and columns agree with the records.
// It also checks the 3 functions that name a pattern, the 3 branches of pickCase, the columns of 4 hand-made cases and partyName.
// Then it makes 2 data sets with library patterns on and checks the list, the payments, the steps and the columns of their cases and the typical case of each pattern. It exits with code 1 unless every statement holds.
//   npx esbuild scripts/smoke-caseview.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke-caseview.mjs && node .tmp/smoke-caseview.mjs
import { readFileSync } from "node:fs";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { DEFAULT_CONFIG } from "../src/lib/gen/config";
import { ARCHETYPES, libraryCountText, libraryRateText } from "../src/lib/gen/archetypes";
import { DRAWN_COLUMNS, caseSteps, ledgerDotY, mergeReferences, splitShortAddress, caseView, flowColumns, librarySteps, listCases, memberRef, partyName, patternCases, patternSteps, pickCase, stepTitle, typicalCaseView, withinLabel, type CaseSummary, type CaseView, type FlowLeg, type FlowParty } from "../src/lib/gen/caseView";
import { PARTS, patternOf } from "../src/lib/gen/patterns/index";
import { labelsOf } from "../src/lib/gen/patterns/labels";
import { patternFamily, patternLabel, patternShort, TYPOLOGY_LABEL, TYPOLOGY_SHORT, type AccountRole, type Dataset, type WalletRef } from "../src/lib/gen/types";

const wallets: WalletRef[] = readWalletPool(JSON.parse(readFileSync(new URL("../public/wallet_pool.json", import.meta.url), "utf8")));
let failures = 0;
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
const account = (n: string, role: AccountRole): FlowParty => ({ key: "a" + n, group: "a:" + role, label: "CUST-" + n, kind: "customer", role, family: "aml", account: Number(n.replace(/\D/g, "") || 0), address: null, part: null, end: null });
const payer = (ref: string): FlowParty => ({ key: "x:" + ref, group: "x:payer", label: "a payer outside the bank", kind: "payer", role: null, family: null, account: null, address: null, part: null, end: null });
const madeView = (parties: FlowParty[], pays: [FlowParty, FlowParty][]): CaseView => {
  const rows: FlowLeg[] = pays.map(([a, b], i) => ({ seq: i, step: "x", say: "x", day: 0, minute: i, from: a.key, to: b.key, how: "fps", rail: "FPS", asset: "GBP", amount: 10, planned: null, seenBy: "bank", tx: null, declined: false }));
  return { ...summary(1, 10 * rows.length, rows.length), parties, rows, endDay: 0 };
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
  const outsider = (key: string, label: string, kind: string, address: string | null = null): FlowParty => ({ key, group: "x:" + kind, label, kind, role: null, family: null, account: null, address, part: null, end: null });
  const names: [string, string, string][] = [
    ["an account is its role and its customer id", partyName({ ...account("1", "mule"), label: "CUST-001077" }), "Mule account CUST-001077"],
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

// library cases: a data set with both library patterns on, the ransom pattern at both ends, at the top rate in a short run so that some payments do not happen
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

// the standard bank with both library patterns on at their own ends, as the panel makes it: the cases by number of columns
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
  eq("N7 a source of the pattern comes first and a source of a part follows once", mergeReferences([[{ id: "S57", pages: "10" }, { id: "S58" }], [{ id: "S58", pages: "3" }, { id: "S59", pages: "4" }], [{ id: "S59", pages: "9" }]]), [{ id: "S57", pages: "10" }, { id: "S58" }, { id: "S59", pages: "4" }]);
  eq("N8 the rate is read in words", [libraryRateText(0.5), libraryRateText(1)], ["0.5 cases for each 1,000 accounts", "1 case for each 1,000 accounts"]);
  eq("N9 the count is read in words", [libraryCountText(0), libraryCountText(1), libraryCountText(2)], ["0 cases", "1 case", "2 cases"]);
}

console.log(failures ? `\n${failures} FAILED` : "\nall ok");
process.exit(failures ? 1 : 0);
