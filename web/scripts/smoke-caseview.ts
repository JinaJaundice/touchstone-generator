// Test of the case view (src/lib/gen/caseView.ts): makes 3 data sets with the working wallet pool and checks, for
// each, that every planted case becomes a view whose legs, parties and columns agree with the records.
// It also checks the 3 functions that name a pattern, the 3 branches of pickCase, the columns of 4 hand-made cases and partyName. It exits with code 1 unless every statement holds.
//   npx esbuild scripts/smoke-caseview.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke-caseview.mjs && node .tmp/smoke-caseview.mjs
import { readFileSync } from "node:fs";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { DEFAULT_CONFIG } from "../src/lib/gen/config";
import { ARCHETYPES } from "../src/lib/gen/archetypes";
import { caseSteps, caseView, flowColumns, listCases, partyName, patternCases, patternSteps, pickCase, stepTitle, type CaseSummary, type CaseView, type FlowLeg, type FlowParty } from "../src/lib/gen/caseView";
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
    if (cols.length > 12) beyond++;
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
  console.log(`  columns: ${[...tally.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n} columns: ${k} cases`).join(", ")}; more than 12 columns: ${beyond} cases`);
}

console.log(failures ? `\n${failures} FAILED` : "\nall ok");
process.exit(failures ? 1 : 0);
