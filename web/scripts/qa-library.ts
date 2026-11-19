// Test of the pattern library (src/lib/gen/patterns/). It holds tests L1 to L14, and every one covers every pattern of the library as the registry holds it.
// L3, L6, L7, L8, L9 (second half) and L10 read 16 data sets made one at a time: A1 to A3 (every pattern at its own rate and end, seeds 20260904, 77 and 4242),
// B, C and D (patterns with 2 customer ends set to both ends, the source and the cash-out), E (A1 again), F (the ransom pattern alone at both ends), G1 to G5 (the
// peel-chain pattern alone at a rate of 5, seeds 1 to 5), H (every pattern at a rate of 5 with the cap of rows at 1,000) and I1 and I2 (the private bank and the challenger bank).
// L14 makes one data set of its own after them, so their counts do not change.
//   L1  every file under parts/ and library/ is valid and imported by index.ts, no pattern has the id of a built-in
//       pattern, labels.json holds what labelsOf gives from the files, the 3 name functions of types.ts answer for each
//       library key and for mule_herd, and classOf maps each of the 10 classes of a screening tool.
//   L2  drawPlan and price give the plan, the priced case and the settled case that the stored case of the reference
//       implementation holds (scripts/fixtures/library-golden/).
//   L3  every pattern plants a case in A1 to A3, and every pattern with 2 customer ends plants one in B, C and D.
//   L4  in 200 cases of each pattern every required step of each use is present, each count and each wait is inside its range, and
//       each supporting step is present in its stated share of cases within 0.1. At size 2 and speed 2 the value of a
//       case is twice as large where it has a range, and the case is between 0.4 and 0.65 of its length.
//   L5  in every one of those cases no party's funds go below 0 and the funds add up (rule 5 of the specification). In each pattern that names a part more than once, at the size 1 and the speed 1 and
//       at the size 4 and the speed 0.25, the parties hold each use, each hand-off joins 2 different uses and no use pays out more than it took in.
//   L6  every row of parties and caseLegs and every planted pattern of a library key fits the dictionary. In A1 to A3, B to D, I1 and I2 each row that the bank sees
//       names its transaction, each library transaction is named once, a replay of each case from what its customers held leaves no party more than 1 penny below 0,
//       the window and the main account of each planted pattern are right, I1 has no cash transaction and each cash transaction of I2 uses a partner counter.
//   L7  A1 and E give the same hashes, and the rows of the ransom pattern in F and B are the same apart from the fields that the check names. In a bank of 1,000 accounts, each of the 12 patterns
//       at a rate of 5 alone and with all 12 on plants cases with the same day, minute, payer, payee and planned amount in each row, the cases of a pattern paired in their order.
//   L8  the share of cases of G1 to G5 whose arriving Bitcoin carries the label "illicit" is within 0.07 of 0.95.
//   L9  (first half) 1,000 segwit, Tron and Ethereum addresses are valid, the Tron and Ethereum addresses equal those of
//       the prototype's functions, and sha256 of address.ts gives the digest of Node.js.
//   L9  (second half) each address of a party is valid for its chain and is no address of the wallet pool or of the OFAC list.
//   L10 in H no pattern holds more than 1,000 rows of caseLegs, and the record names each pattern that stopped.
//   L11 normaliseConfig gives the settings of a library pattern their values, limits and omissions.
//   L12 in each of the 16 data sets the CSV files of the parties and of the planned payments read back with as many rows as the data set holds and the same values in 3 rows.
//   L13 (1) in 200 plans of each pattern no payment with a chain names a party of another chain or a wallet without a chain. (2) In A1, A2, A3, B, C, D, I1 and I2
//       no row of caseLegs with a chain names a party of the same case whose chain or whose address format is another one. (3) The validator refuses 3 changed copies of
//       the part bridge-hop, by check 11, check 12 and check 13. (4) cutShortOf is true for the stored case of the bridge pattern without the payments of the step
//       deposit of the use mixer~2, and false with every payment. (5) Over the same 200 plans, the groups of parties that hold no chain on a payment with a chain, with the customers left out,
//       are the 4 services of the table of the design on uses and chains and no others.
//   L14 in its own data set, the standard bank at seed number 20260904 with every pattern at a rate of 5 and at both ends where labelsOf allows it, the library
//       payments are compared with the ordinary payments of the same data set. (1) In 5 groups by direction, rail and method no minute of the day holds more than 3%
//       of the library payments, and (2) the gap between the curves of library and ordinary payments is at most 1.63 * sqrt(1/n + 1/N). (3) The rows of each case never
//       run back in time. (4) No rising run of 3 or more payments is a ladder of whole multiples of its first payment, and (5) no run of 2 or more payments of the 3
//       uneven steps of library version 2026-11.3 has one planned amount. (6) Library pairs of payments by one payer to one payee within 3 days have one amount no more
//       often than ordinary pairs. (7) No library payment to a payee already paid has a reason, and (8) the outside accounts that customers pay are personal within 3
//       standard deviations of the shares of an ordinary new payee of the first payer's segment (section 7 of docs/PATTERN_FORMAT.md).
// It prints one line for each check and exits with code 1 unless every check passes. It prints 16 lines of checks, because it prints L9 in 2 halves and holds check L1b, and then the times of the data sets and a summary.
//   npx esbuild scripts/qa-library.ts --bundle --platform=node --format=esm --outfile=.tmp/qa-library.mjs && node .tmp/qa-library.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mulberry32 } from "../src/lib/rng";
import { TYPOLOGY_FAMILY, TYPOLOGY_LABEL, TYPOLOGY_SHORT, patternFamily, patternLabel, patternShort } from "../src/lib/gen/types";
import references from "../src/lib/gen/patterns/references.json";
import { PARTS, PATTERNS } from "../src/lib/gen/patterns/index";
import { labelsOf } from "../src/lib/gen/patterns/labels";
import { drawPlan, price } from "../src/lib/gen/patterns/expand";
import { validatePart, validatePattern } from "../src/lib/gen/patterns/validate";
import { CLASSES, partIdOf, usesOf } from "../src/lib/gen/patterns/types";
import type { Part, Pattern, Plan, PricedCase, Range, Step, Wait } from "../src/lib/gen/patterns/types";
import { classOf } from "../src/lib/gen/walletClass";
import { DEFAULT_CONFIG, normaliseConfig } from "../src/lib/gen/config";
import type { CaseLeg, Dataset, GenConfig, LibrarySetting, Party, Tx } from "../src/lib/gen/types";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { ARCHETYPES } from "../src/lib/gen/archetypes";
import { caseLegsCsv, partiesCsv } from "../src/lib/gen/csv";
import { CASE_LEG_COLUMNS, PARTY_COLUMNS, caseLegCell, partyCell } from "../src/lib/gen/parquet";
import { CASE_LEG_FIELDS, PARTY_FIELDS, PATTERN_FIELDS, checkRecord } from "../src/lib/gen/dictionary";
import { LIBRARY_ROW_CAP, cutShortOf, setRowCap } from "../src/lib/gen/patterns/plant";
import { makeEthAddress, makeSegwitAddress, makeTronAddress, sha256 } from "../src/lib/gen/address";
import { isBitcoinAddress, isTronAddress, looksEthereum } from "./lib/btc";

const started = Date.now();
const patternsDir = new URL("../src/lib/gen/patterns/", import.meta.url);
const goldenDir = new URL("../scripts/fixtures/library-golden/", import.meta.url);
const known = new Set(references.sources.map((s) => s.id));
const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, "utf8"));
const names = (dir: string): string[] => readdirSync(new URL(dir, patternsDir)).filter((f) => f.endsWith(".json")).sort().map((f) => f.slice(0, -5));
const plain = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
const pen = (x: number): number => Math.round(x * 100);
const MIN = { minutes: 1, hours: 60, days: 1440 } as const;

/** The path of the first difference between 2 plain values, or null where they are the same. */
function firstDiff(a: unknown, b: unknown, path = ""): string | null {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return `${path || "(root)"}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path || "(root)"}: an array against an object`;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: ${a.length} entries against ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (!(k in x) || !(k in y)) return `${path}.${k}: held by one side only`;
    const d = firstDiff(x[k], y[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

/** Replays the priced legs: the funds that each party holds, in pennies, and the funds that own legs raised. */
function replay(res: PricedCase): { raised: number; total: number; minHeld: number } {
  const h = new Map<string, number>(); let raised = 0, minHeld = 0;
  for (const l of res.legs) {
    const a = pen(l.amount);
    if (l.pays === "case") h.set(l.from, (h.get(l.from) ?? 0) - a); else raised += a;
    minHeld = Math.min(minHeld, h.get(l.from) ?? 0);
    h.set(l.to, (h.get(l.to) ?? 0) + a);
    minHeld = Math.min(minHeld, h.get(l.from) ?? 0);
  }
  return { raised: raised / 100, total: [...h.values()].reduce((a, b) => a + b, 0) / 100, minHeld: minHeld / 100 };
}
/** Rule 5 of section 5.2: the funds held at the end add up to the funds raised, and those to the value, within 1 penny a leg. */
function rule5(res: PricedCase): string[] {
  const rp = replay(res), tol = 0.01 * res.legs.length + 1e-9, out: string[] = [];
  if (Math.abs(rp.total - rp.raised) > 1e-6) out.push(`rule 5: held ${rp.total} differs from raised ${rp.raised}`);
  if (Math.abs(rp.raised - res.value) > tol) out.push(`rule 5: raised ${rp.raised} differs from ${res.value} by more than ${tol.toFixed(2)}`);
  return out;
}
const days = (res: PricedCase): number => Math.max(0, ...res.legs.map((l) => l.minute)) / 1440;
const draw = (p: Pattern, seed: number, size = 1, speed = 1): Plan => drawPlan(p, PARTS, { size, speed, bankSees: p.bankSees }, mulberry32(seed));
const partOf = (use: string): Part => { const x = PARTS.get(partIdOf(use)); if (!x) throw new Error(`no part ${partIdOf(use)}`); return x; };
/** The minutes that a drawn wait can take at speed 1: the range in minutes, with at least 1 where the range reaches above 0. */
function waitBounds(w: Wait | undefined): [number, number] {
  const u = w?.hours ? "hours" : w?.days ? "days" : "minutes", r: Range = w?.[u] ?? [0, 0];
  const lo = Math.round(r[0] * MIN[u]), hi = Math.round(r[1] * MIN[u]);
  return r[1] > 0 ? [Math.max(lo, 1), Math.max(hi, 1)] : [lo, hi];
}
const inside = (x: number, b: [number, number]): boolean => x >= b[0] && x <= b[1];

const results: { id: string; name: string; fail: string | null }[] = [];
const record = (id: string, name: string, fail: string | null): void => { results.push({ id, name, fail }); console.log(`${fail === null ? "ok  " : "FAIL"} ${id} ${name}${fail === null ? "" : `: ${fail}`}`); };

// ---------- L1 ----------
{
  let fail: string | null = null;
  const note = (m: string): void => { fail ??= m; };
  const partNames = names("parts/"), patternNames = names("library/");
  for (const n of partNames) {
    const res = validatePart(readJson(new URL(`parts/${n}.json`, patternsDir)), known);
    if (!res.ok) note(res.errors[0]); else if (res.value.id !== n) note(`parts/${n}.json holds the id ${res.value.id}`);
    if (!PARTS.has(n)) note(`parts/${n}.json is not imported by index.ts`);
  }
  for (const id of PARTS.keys()) if (!partNames.includes(id)) note(`index.ts imports the part ${id}, which has no file`);
  for (const n of patternNames) {
    const res = validatePattern(readJson(new URL(`library/${n}.json`, patternsDir)), PARTS, known);
    if (!res.ok) note(res.errors[0]); else if (res.value.id !== n) note(`library/${n}.json holds the id ${res.value.id}`);
    if (!PATTERNS.some((p) => p.id === n)) note(`library/${n}.json is not imported by index.ts`);
  }
  for (const p of PATTERNS) if (!patternNames.includes(p.id)) note(`index.ts imports the pattern ${p.id}, which has no file`);
  const builtIn = new Set(Object.keys(TYPOLOGY_LABEL));
  for (const p of PATTERNS) if (builtIn.has(p.id)) note(`the pattern id ${p.id} is the name of a built-in pattern`);
  const labels = readJson(new URL("labels.json", patternsDir)) as { patterns: unknown };
  const d = firstDiff(plain(labels.patterns), plain(labelsOf(PATTERNS, PARTS)), "labels.json.patterns");
  if (d) note(d);
  // the 3 name functions of types.ts give each library key its entry in labels.json, and a built-in name its own entry
  for (const e of labelsOf(PATTERNS, PARTS)) for (const k of e.keys) {
    if (patternLabel(k.key) !== k.label) note(`patternLabel(${k.key}) gives ${patternLabel(k.key)}`);
    if (patternShort(k.key) !== k.short) note(`patternShort(${k.key}) gives ${patternShort(k.key)}`);
    if (patternFamily(k.key) !== k.family) note(`patternFamily(${k.key}) gives ${patternFamily(k.key)}`);
  }
  if (patternLabel("mule_herd") !== TYPOLOGY_LABEL.mule_herd || patternShort("mule_herd") !== TYPOLOGY_SHORT.mule_herd || patternFamily("mule_herd") !== TYPOLOGY_FAMILY.mule_herd) note("the name functions do not give the entries of the 3 tables for mule_herd");
  // the 10 classes that a screening tool reports are each mapped by classOf to a wallet class other than "unknown"
  for (const c of CLASSES) if (classOf(c) === "unknown") note(`classOf does not map the class "${c}" and gives "${classOf(c)}"`);
  record("L1", `${partNames.length} parts and ${patternNames.length} patterns are valid, imported and named`, fail);
}

// ---------- L1b: the basis of a step is checked as the basis of a value is ----------
{
  let fail: string | null = null;
  const accepted: string[] = []; // each faulty basis that the validator lets through, so that the message names all of them
  const base = readJson(new URL(`parts/${names("parts/")[0]}.json`, patternsDir)) as { steps: { basis: unknown }[] };
  const words31 = Array.from({ length: 31 }, () => "word").join(" ") + ".";
  const bad: [string, unknown][] = [
    ["a text", "x"], ["the kind guess", { kind: "guess", note: "A note." }], ["an extra field", { kind: "assumed", note: "A note.", foo: 1 }],
    ["the source x99", { kind: "reported", ref: "x99", note: "A note." }], ["the source zzz", { kind: "reported", ref: "zzz", note: "A note." }],
    ["a note of 31 words", { kind: "assumed", note: words31 }],
  ];
  for (const [what, b] of bad) {
    const part = JSON.parse(JSON.stringify(base)) as typeof base;
    part.steps[0].basis = b;
    if (validatePart(part, known).ok) accepted.push(what);
  }
  if (accepted.length) fail = `a step with ${accepted.length === 1 ? "this faulty basis is" : "each of these faulty bases is"} accepted: ${accepted.join(", ")}`;
  record("L1b", "a step with a faulty basis is rejected", fail);
}

// ---------- L2 ----------
{
  let fail: string | null = null;
  for (const p of PATTERNS) {
    const stored = readJson(new URL(`${p.id}.json`, goldenDir)) as { plan: unknown; priced: unknown; settled: unknown };
    const plan = draw(p, 20261110), priced = price(plan), first = priced.legs.find((l) => l.seenBy === "bank");
    let settled: unknown = null;
    if (first) {
      const res1 = price(plan, {}, { [first.seq]: first.amount / 2 });
      settled = { fixed: { seq: first.seq, step: first.step, planned: first.amount, written: first.amount / 2 }, ...res1 };
    }
    for (const [what, mine, theirs] of [["plan", plan, stored.plan], ["priced", priced, stored.priced], ["settled", settled, stored.settled]] as const) {
      const d = firstDiff(plain(mine), plain(theirs), what);
      if (d) { fail ??= `${p.id}: ${d}`; }
    }
  }
  record("L2", `the plan, the priced case and the settled case of ${PATTERNS.length} patterns match the stored cases`, fail);
}

// ---------- L4 and L5 ----------
{
  let l4: string | null = null, l5: string | null = null, l5use: string | null = null;
  const note4 = (m: string): void => { l4 ??= m; }, note5 = (m: string): void => { l5 ??= m; };
  for (const p of PATTERNS) {
    const order = usesOf(p), multi = new Set(order.map(partIdOf)).size < order.length;
    const present = new Map<string, number>(); // supporting steps: the number of cases in which the step ran
    for (let seed = 1; seed <= 200; seed++) {
      const plan = draw(p, seed), res = price(plan), tag = `${p.id} seed ${seed}`;
      // L5
      const rp = replay(res);
      if (rp.minHeld < 0) note5(`${tag}: a party's funds went below 0 (${rp.minHeld})`);
      for (const m of rule5(res)) note5(`${tag}: ${m}`);
      // L5: in a pattern that names a part more than once, no use pays out more than it took in (whole pence, no tolerance)
      // it runs at the size 1 and the speed 1 and again at the size 4 and the speed 0.25, and it holds that the parties hold each use and that each hand-off joins 2 different uses
      if (multi) for (const [size, speed] of [[1, 1], [4, 0.25]] as const) {
        const at = size === 1 ? res : price(draw(p, seed, size, speed)), where = `${tag} at size ${size} and speed ${speed}`;
        const useOf = new Map(at.parties.map((q) => [q.key, q.part] as const));
        for (const u of order) if (!at.parties.some((q) => q.part === u)) l5use ??= `${where}: no party of the plan holds the use ${u}`;
        for (const l of at.legs) if (l.step === "handoff" && useOf.get(l.from) === useOf.get(l.to)) l5use ??= `${where}: the hand-off ${l.seq} joins the use ${useOf.get(l.from)} to itself`;
        // the first use is the source use: it takes in nothing from another use, as the design says, so only the later uses are tested
        for (const u of order.slice(1)) {
          let took = 0, paid = 0;
          for (const l of at.legs) {
            const f = useOf.get(l.from), t = useOf.get(l.to);
            if (f === t) continue;
            if (t === u) took += pen(l.amount);
            if (f === u) paid += pen(l.amount);
          }
          if (paid > took) l5use ??= `${where}: the use ${u} paid out ${paid / 100} and took in ${took / 100}`; // kept apart, so that a failure of the funds check does not hide it
        }
      }
      // L4: every required step has a leg
      for (const pid of order) for (const s of partOf(pid).steps) {
        if (s.need === "required" && !res.legs.some((l) => l.part === pid && l.step === s.id)) note4(`${tag}: required step ${pid}.${s.id} has no leg`);
        if (s.need === "supporting" && plan.runs.some((r) => r.part === pid && r.step === s.id)) present.set(`${pid}.${s.id}`, (present.get(`${pid}.${s.id}`) ?? 0) + 1);
      }
      // L4: each count inside its range
      for (const [k, n] of Object.entries(plan.counts)) {
        const [pid, qid] = k.split("."), g = partOf(pid).parties.find((q) => q.id === qid)?.count ?? [1, 1];
        if (n < g[0] || n > g[1]) note4(`${tag}: count of ${k} is ${n}, outside ${g}`);
      }
      const stepOf = (pid: string, sid: string): Step | undefined => partOf(pid).steps.find((s) => s.id === sid);
      const handoff = new Map<string, number>();
      for (const l of plan.legs) if (l.step === "handoff") handoff.set(l.part, l.minute);
      for (const run of plan.runs) {
        if (run.step === "handoff") continue;
        const s = stepOf(run.part, run.step);
        if (!s) { note4(`${tag}: ${run.part}.${run.step} is no step of the part`); continue; }
        const g: Range = s.kind === "move" ? s.times ?? [1, 1] : s.kind === "chain" ? ("count" in s.through ? s.through.count : [run.n, run.n]) : s.ways;
        if (run.n < g[0] || run.n > g[1]) note4(`${tag}: ${run.part}.${run.step}: count ${run.n} outside ${g}`);
        const mine = plan.legs.filter((l) => l.run === run.id);
        if (run.kind === "move" && mine.length !== run.n) note4(`${tag}: ${run.part}.${run.step}: leg count differs from ${run.n}`);
        if (!mine.length) continue;
        // each wait inside its range: the first leg after its anchor, the gaps of a move or a chain, the span of a split
        const a = s.start.after;
        const anchor = s.start.per ? null : a === "case" ? 0 : a === "entry" ? handoff.get(run.part) ?? null : (() => {
          const ls = plan.legs.filter((l) => l.part === run.part && l.step === a);
          return ls.length ? Math.max(...ls.map((l) => l.minute)) : null;
        })();
        const firstLeg = mine.find((l) => l.first) ?? mine[0];
        if (anchor !== null && !inside(firstLeg.minute - anchor, waitBounds(s.start))) note4(`${tag}: ${run.part}.${run.step}: the first leg comes ${firstLeg.minute - anchor} minutes after its anchor, outside ${waitBounds(s.start)}`);
        if (s.kind === "move" || s.kind === "chain") {
          const peelSay = s.kind === "chain" ? s.peel?.say : undefined;
          const main = mine.filter((l) => peelSay === undefined || l.say !== peelSay).sort((x, y) => x.seq - y.seq);
          const gb = waitBounds(s.between);
          for (let i = 1; i < main.length; i++) {
            const gap = main[i].minute - main[i - 1].minute;
            if (!inside(gap, gb)) { note4(`${tag}: ${run.part}.${run.step}: a gap of ${gap} minutes is outside ${gb}`); break; }
          }
        } else {
          const fan = mine.filter((l) => !s.gather || l.from === mine[0].from).sort((x, y) => x.seq - y.seq);
          const span = fan[fan.length - 1].minute - fan[0].minute;
          if (!inside(span, waitBounds(s.over))) note4(`${tag}: ${run.part}.${run.step}: the fan-out spans ${span} minutes, outside ${waitBounds(s.over)}`);
        }
      }
    }
    // L4: each supporting step is present in its stated share of cases within 0.1
    for (const pid of order) for (const s of partOf(pid).steps) {
      if (s.need !== "supporting") continue;
      const share = (present.get(`${pid}.${s.id}`) ?? 0) / 200, chance = s.chance ?? 0;
      if (Math.abs(share - chance) > 0.1) note4(`${p.id}: supporting step ${pid}.${s.id} is present in ${share} of 200 cases, its chance is ${chance}`);
    }
    // L4: size 2 and speed 2
    const plan1 = draw(p, 20261110), plan2 = draw(p, 20261110, 2, 2), r1 = price(plan1), r2 = price(plan2);
    if (plan1.value.log && Math.abs(r2.value - 2 * r1.value) > 0.015) note4(`${p.id}: the value ${r2.value} at size 2 is not twice ${r1.value}`);
    const ratio = days(r2) / days(r1);
    if (!(ratio > 0.4 && ratio < 0.65)) note4(`${p.id}: at speed 2 the length is ${ratio.toFixed(3)} of the length at speed 1, outside 0.4 to 0.65`);
  }
  record("L4", `${PATTERNS.length} patterns in 200 cases each: steps, counts, waits, chances, size and speed`, l4);
  record("L5", `${PATTERNS.length} patterns in 200 cases each: no funds below 0, and the funds add up`, [l5, l5use].filter((m) => m !== null).join(" | ") || null);
}

// ---------- L9, first half: the addresses ----------
{
  // hex and protoTron are copies of the 2 address functions of the reference implementation of the planter, with the same order of draws
  const hex = (r: () => number, n: number): string => { let s = ""; for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16); return s; };
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const protoTron = (r: () => number): string => {
    const payload = [0x41, ...Array.from({ length: 20 }, () => Math.floor(r() * 256))];
    const sha = (b: Buffer | number[]): Buffer => createHash("sha256").update(Buffer.from(b)).digest();
    const full = Buffer.from([...payload, ...sha(sha(payload)).subarray(0, 4)]);
    let n = BigInt("0x" + full.toString("hex")), out = "";
    while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
    return out;
  };
  let fail: string | null = null;
  const note = (m: string): void => { fail ??= m; };
  const rs = mulberry32(20261110), rt = mulberry32(20261110), re = mulberry32(20261110), pt = mulberry32(20261110), pe = mulberry32(20261110);
  for (let i = 0; i < 1000; i++) {
    const s = makeSegwitAddress(rs), t = makeTronAddress(rt), e = makeEthAddress(re);
    if (!isBitcoinAddress(s)) note(`segwit address ${i} fails isBitcoinAddress: ${s}`);
    if (!isTronAddress(t)) note(`Tron address ${i} fails isTronAddress: ${t}`);
    if (!looksEthereum(e)) note(`Ethereum address ${i} fails looksEthereum: ${e}`);
    const t2 = protoTron(pt), e2 = "0x" + hex(pe, 40);
    if (t !== t2) note(`Tron address ${i} is ${t} and the prototype gives ${t2}`);
    if (e !== e2) note(`Ethereum address ${i} is ${e} and the prototype gives ${e2}`);
  }
  // sha256 gives the digest of Node.js for 100 drawn inputs and for inputs of the lengths at the edges of a block
  const rb = mulberry32(20261110);
  const inputs: Uint8Array[] = Array.from({ length: 100 }, () => Uint8Array.from({ length: Math.floor(rb() * 300) }, () => Math.floor(rb() * 256)));
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) inputs.push(Uint8Array.from({ length: n }, () => Math.floor(rb() * 256)));
  inputs.forEach((b, i) => { if (Buffer.from(sha256(b)).toString("hex") !== createHash("sha256").update(b).digest("hex")) note(`sha256 of input ${i} (${b.length} bytes) differs from Node.js`); });
  record("L9", "1,000 segwit, Tron and Ethereum addresses are valid, and the Tron and Ethereum addresses and sha256 match the prototype and Node.js", fail);
}

// ---------- L11 ----------
{
  let fail: string | null = null;
  const note = (m: string): void => { fail ??= m; };
  const norm = (library?: unknown): GenConfig => normaliseConfig({ ...DEFAULT_CONFIG, ...(library === undefined ? {} : { library }) } as GenConfig);
  // no field, an empty object and a key that is no pattern id all give a result without the field
  for (const [what, cfg] of [["settings without the field", norm()], ["an empty object", norm({})], ["a key that is no pattern id", norm({ "no-such-pattern": { on: true } })]] as const) {
    if ("library" in cfg) note(`${what} give a result that holds the field library`);
  }
  for (const e of labelsOf(PATTERNS, PARTS)) {
    const id = e.id, got = (x: unknown): LibrarySetting | undefined => norm({ [id]: x }).library?.[id];
    // a pattern that is on takes its own rate, a size and a speed of 1 and its own end
    const on = got({ on: true });
    if (JSON.stringify(on) !== JSON.stringify({ on: true, per1k: e.per1k, size: 1, speed: 1, bankSees: e.bankSees })) note(`${id}: { on: true } gives ${JSON.stringify(on)}`);
    if (got({})?.on !== false) note(`${id}: an entry without on gives on ${got({})?.on}`);
    if (got({ per1k: 9 })?.per1k !== 5) note(`${id}: a rate of 9 gives ${got({ per1k: 9 })?.per1k}`);
    if (got({ per1k: -1 })?.per1k !== 0) note(`${id}: a rate of -1 gives ${got({ per1k: -1 })?.per1k}`);
    if (got({ size: 0.1 })?.size !== 0.25) note(`${id}: a size of 0.1 gives ${got({ size: 0.1 })?.size}`);
    if (got({ speed: 7 })?.speed !== 4) note(`${id}: a speed of 7 gives ${got({ speed: 7 })?.speed}`);
    // an end that the pattern does not allow gives the pattern's own end
    const refused = (["source", "cash-out", "both"] as const).find((b) => !e.allowed.includes(b)) ?? "sideways";
    if (got({ bankSees: refused })?.bankSees !== e.bankSees) note(`${id}: bankSees ${refused} gives ${got({ bankSees: refused })?.bankSees}`);
    for (const b of e.allowed) if (got({ bankSees: b })?.bankSees !== b) note(`${id}: bankSees ${b} gives ${got({ bankSees: b })?.bankSees}`);
  }
  // a second call on the result gives the same text as the first
  const once = norm(Object.fromEntries(PATTERNS.map((p) => [p.id, { on: true, per1k: 9, size: 0.1, speed: 7, bankSees: "sideways" }])));
  if (JSON.stringify(normaliseConfig(once)) !== JSON.stringify(once)) note("a second call of normaliseConfig on the result gives other text");
  record("L11", `normaliseConfig keeps, fills and limits the settings of ${PATTERNS.length} library patterns and omits the field where none remain`, fail);
}

// ---------- the 16 data sets: L3, L6, L7, L8, L9 (second half) and L10 ----------
// The data sets are made one at a time and each is read for what the checks need and then let go, so the test never
// holds more than one in memory. The patterns are those of the registry as it stands.
{
  const poolUrl = new URL("../public/wallet_pool.json", import.meta.url), ofacUrl = new URL("../src/lib/lists/ofac.json", import.meta.url);
  const wallets = readWalletPool(JSON.parse(readFileSync(poolUrl, "utf8")));
  // L9: the addresses of the wallet pool and of the OFAC list. The public copy holds another wallet pool, and the list is read only where its file exists.
  const listed = new Set<string>(wallets.map((w) => w.id));
  if (existsSync(ofacUrl)) for (const e of (readJson(ofacUrl) as { bitcoin: { address: string }[] }).bitcoin) listed.add(e.address);

  const allowed = new Map(labelsOf(PATTERNS, PARTS).map((e) => [e.id, e.allowed] as const));
  const canBoth = (p: Pattern): boolean => (allowed.get(p.id) ?? []).includes("both");
  const setting = (p: Pattern, over: Partial<LibrarySetting> = {}): LibrarySetting => ({ on: true, per1k: p.per1k, size: 1, speed: 1, bankSees: p.bankSees, ...over });
  const every = (over: (p: Pattern) => Partial<LibrarySetting>): Record<string, LibrarySetting> => Object.fromEntries(PATTERNS.map((p) => [p.id, setting(p, over(p))]));
  const only = (id: string, over: Partial<LibrarySetting>): Record<string, LibrarySetting> => Object.fromEntries(PATTERNS.filter((p) => p.id === id).map((p) => [p.id, setting(p, over)]));
  const standard = (seed: number, library: Record<string, LibrarySetting>): GenConfig => ({ ...DEFAULT_CONFIG, seed, library });
  const bankType = (k: "privatebank" | "challenger", library: Record<string, LibrarySetting>): GenConfig => ({ ...ARCHETYPES[k].patch({ ...DEFAULT_CONFIG, seed: 20260904 }), library });
  const RANSOM = "ransom-through-a-mixer", PEEL = "stolen-funds-through-a-peel-chain";
  const ends = (end: "both" | "source" | "cash-out") => every((p) => (canBoth(p) ? { bankSees: end } : {}));
  /** Whose money a payment of a step moves: its own customer's, or the case's. A payment of a hand-off or of a chain or split step moves the case's. */
  const paysOf = (use: string, stepId: string): "case" | "own" => { const s = partOf(use).steps.find((x) => x.id === stepId); return s && s.kind === "move" ? s.pays ?? "case" : "case"; };

  // the data sets, in the order of the design (item 19). L6 reads the data sets of the second list in full.
  const specs: { name: string; cfg: () => GenConfig; cap?: number }[] = [
    { name: "A1", cfg: () => standard(20260904, every(() => ({}))) },
    { name: "A2", cfg: () => standard(77, every(() => ({}))) },
    { name: "A3", cfg: () => standard(4242, every(() => ({}))) },
    { name: "B", cfg: () => standard(20260904, ends("both")) },
    { name: "C", cfg: () => standard(20260904, ends("source")) },
    { name: "D", cfg: () => standard(20260904, ends("cash-out")) },
    { name: "E", cfg: () => standard(20260904, every(() => ({}))) },
    { name: "F", cfg: () => standard(20260904, only(RANSOM, { bankSees: "both" })) },
    ...[1, 2, 3, 4, 5].map((seed) => ({ name: `G${seed}`, cfg: () => standard(seed, only(PEEL, { per1k: 5 })) })),
    { name: "H", cfg: () => standard(20260904, every(() => ({ per1k: 5 }))), cap: 1000 },
    { name: "I1", cfg: () => bankType("privatebank", every(() => ({ per1k: 5 }))) },
    { name: "I2", cfg: () => bankType("challenger", every(() => ({ per1k: 5 }))) },
  ];
  const txLinked = new Set(["A1", "A2", "A3", "B", "C", "D", "I1", "I2"]);

  const hashArray = (arr: unknown[]): string => {
    const h = createHash("sha256");
    h.update("[");
    for (let i = 0; i < arr.length; i++) { if (i) h.update(","); h.update(JSON.stringify(arr[i]) ?? "null"); }
    h.update("]");
    return h.digest("hex");
  };

  /** The cells of a CSV text, row by row: a quoted cell may hold a comma, a line break or a doubled quote. */
  const readCsv = (text: string): string[][] => {
    const out: string[][] = [];
    let row: string[] = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; }
      else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); out.push(row); }
    return out;
  };

  const fails: Record<"L3" | "L6" | "L7" | "L8" | "L9" | "L10" | "L12" | "L13", string | null> = { L3: null, L6: null, L7: null, L8: null, L9: null, L10: null, L12: null, L13: null };
  const note = (k: keyof typeof fails, m: string): void => { fails[k] ??= m; };
  // L13 keeps the first message of each of its 5 statements, so that a record shows every statement that fails and not only the first to run
  const first13: (string | null)[] = [null, null, null, null, null];
  const note13 = (n: number, m: string): void => { first13[n - 1] ??= `statement ${n}: ${m}`; };
  const hashes = new Map<string, { txs: string; parties: string; caseLegs: string }>();
  const ransomRows = new Map<string, { parties: Party[]; legs: CaseLeg[] }>();
  const illicit = { cases: 0, withArrivals: 0, illicit: 0 };
  const timing: string[] = [];
  let rowsOnChain = 0, csvRows = 0, casesPlanted = 0, rowsChecked = 0, txsLinked = 0, addresses = 0, capSeen = 0;

  for (const spec of specs) {
    const t0 = Date.now();
    if (spec.cap !== undefined) setRowCap(spec.cap);
    let ds: Dataset;
    try { ds = generate(spec.cfg(), wallets); } finally { setRowCap(LIBRARY_ROW_CAP); }
    const where = spec.name, lib = ds.library;
    if (!lib) { note("L3", `${where}: the data set holds no record of the planter`); continue; }
    const planted = new Map<string, number>();
    for (const c of lib.cases) planted.set(c.pattern, (planted.get(c.pattern) ?? 0) + 1);
    casesPlanted += lib.cases.length;

    // L12: the 2 CSV files read back with as many rows as the data set holds and 3 rows (the first, the middle and the last) with the same values
    for (const [file, text, cols, rows, cell] of [
      ["partiesCsv", partiesCsv(ds), PARTY_COLUMNS, ds.parties, partyCell],
      ["caseLegsCsv", caseLegsCsv(ds), CASE_LEG_COLUMNS, ds.caseLegs, caseLegCell],
    ] as const) {
      const back = readCsv(text);
      if (back.length !== rows.length + 1) { note("L12", `${where} ${file}: ${back.length - 1} rows read back, ${rows.length} in the data set`); continue; }
      if (back[0].join(",") !== cols.map((c) => c.name).join(",")) note("L12", `${where} ${file}: the header row differs from the column list`);
      for (const i of new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])) {
        if (i < 0) continue;
        cols.forEach((c, j) => { const want = cell(rows[i] as never, c.name); const got = back[i + 1][j]; if (got !== (want === null ? "" : String(want))) note("L12", `${where} ${file} row ${i} column ${c.name}: read back "${got}", the data set holds "${want}"`); });
      }
      csvRows += rows.length;
    }

    // L3
    if (["A1", "A2", "A3"].includes(where)) for (const p of PATTERNS) if (!planted.get(p.id)) note("L3", `${where}: ${p.id} planted no case`);
    if (["B", "C", "D"].includes(where)) for (const p of PATTERNS) if (canBoth(p) && !planted.get(p.id)) note("L3", `${where}: ${p.id} planted no case`);

    // L6, the first part: each row and each planted pattern of a library key satisfies its specification
    ds.parties.forEach((r, i) => { const m = checkRecord(r as unknown as Record<string, unknown>, PARTY_FIELDS, `${where} parties[${i}]`); if (m) note("L6", m); });
    ds.caseLegs.forEach((r, i) => { const m = checkRecord(r as unknown as Record<string, unknown>, CASE_LEG_FIELDS, `${where} caseLegs[${i}]`); if (m) note("L6", m); });
    rowsChecked += ds.parties.length + ds.caseLegs.length;
    const libTx = new Map<number, Tx>();
    for (const t of ds.txs) if (typeof t.typology === "string" && t.typology.startsWith("lib.")) libTx.set(t.id, t);
    const first = new Map<number, number>(), last = new Map<number, number>();
    for (const t of libTx.values()) { first.set(t.patternId, Math.min(first.get(t.patternId) ?? Infinity, t.day)); last.set(t.patternId, Math.max(last.get(t.patternId) ?? -1, t.day)); }
    for (const p of ds.patterns) if (typeof p.typology === "string" && p.typology.startsWith("lib.")) {
      const m = checkRecord(p as unknown as Record<string, unknown>, PATTERN_FIELDS, `${where} pattern ${p.id}`);
      if (m) note("L6", m);
      if (!p.library || p.typology !== `lib.${p.library.pattern}.${p.library.end}`) note("L6", `${where} pattern ${p.id}: the field library does not match the key ${p.typology}`);
      if (txLinked.has(where)) {
        if (p.startDay !== first.get(p.id)) note("L6", `${where} pattern ${p.id}: startDay ${p.startDay} is not the day ${first.get(p.id)} of its first transaction`);
        if (p.endDay !== last.get(p.id)) note("L6", `${where} pattern ${p.id}: endDay ${p.endDay} is not the day ${last.get(p.id)} of its last transaction`);
        if (!p.accounts.includes(p.main)) note("L6", `${where} pattern ${p.id}: its main account ${p.main} is not one of its accounts`);
      }
    }

    if (txLinked.has(where)) {
      // L6, the second part: each row that the bank sees names its transaction, and each library transaction is named once
      const named = new Map<number, number>();
      for (const r of ds.caseLegs) {
        if (r.tx !== null) named.set(r.tx, (named.get(r.tx) ?? 0) + 1);
        const tag = `${where} case ${r.caseId} payment ${r.seq}`;
        if (r.seenBy === "bank" && r.amount > 0) {
          const t = r.tx === null ? undefined : libTx.get(r.tx);
          if (!t) note("L6", `${tag}: the amount ${r.amount} names no transaction`);
          else if (t.caseId !== r.caseId || t.day !== r.day || t.minute !== r.minute || Math.abs(t.amount - r.amount) > 1e-9) note("L6", `${tag}: the row (day ${r.day}, minute ${r.minute}, ${r.amount}) differs from transaction ${t.id} (case ${t.caseId}, day ${t.day}, minute ${t.minute}, ${t.amount})`);
        } else if (r.tx !== null) note("L6", `${tag}: a row with no amount, or that the bank does not see, names transaction ${r.tx}`);
      }
      for (const id of libTx.keys()) if (named.get(id) !== 1) note("L6", `${where}: library transaction ${id} is named ${named.get(id) ?? 0} times`);
      txsLinked += libTx.size;
      // L6, the third part: a replay of the rows of each case, from what each chosen customer held, leaves no party more than 1 penny below 0
      const accountOf = new Map<string, number>();
      for (const q of ds.parties) if (q.account !== null) accountOf.set(`${q.caseId}|${q.key}`, q.account);
      const byCase = new Map<number, CaseLeg[]>();
      for (const r of ds.caseLegs) (byCase.get(r.caseId) ?? byCase.set(r.caseId, []).get(r.caseId)!).push(r);
      for (const [cid, rs] of byCase) {
        rs.sort((a, b) => a.seq - b.seq);
        const held = new Map<string, number>();
        for (const [k, acc] of accountOf) if (k.startsWith(`${cid}|`)) { const a = ds.accounts[acc]; held.set(k.slice(String(cid).length + 1), pen(Math.max(0, a.initialBalance + a.overdraftLimit))); }
        for (const r of rs) {
          const a = pen(r.amount);
          if (a === 0) continue;
          // an own payment of a customer that no account fills (an end that the bank does not see) raises the funds of its receiver and lowers no one's
          if (paysOf(r.part, r.step) === "case" || accountOf.has(`${cid}|${r.from}`)) {
            const v = (held.get(r.from) ?? 0) - a;
            held.set(r.from, v);
            if (v < -1) { note("L6", `${where} case ${cid} payment ${r.seq} (${r.part}.${r.step}): ${r.from} holds ${v / 100}`); break; }
          }
          held.set(r.to, (held.get(r.to) ?? 0) + a);
        }
      }
      // L6, the last part: the rails of a bank type
      if (where === "I1") for (const t of libTx.values()) if (t.rail === "CASH") note("L6", `I1: library transaction ${t.id} is on the cash rail`);
      if (where === "I2") for (const t of libTx.values()) if (t.rail === "CASH" && t.method !== "partner-counter") note("L6", `I2: library transaction ${t.id} on the cash rail has the method ${t.method}`);
    }

    // L7
    hashes.set(where, { txs: hashArray(ds.txs), parties: hashArray(ds.parties), caseLegs: hashArray(ds.caseLegs) });
    if (where === "F" || where === "B") ransomRows.set(where, { parties: ds.parties.filter((q) => q.pattern === RANSOM), legs: ds.caseLegs.filter((r) => r.pattern === RANSOM) });

    // L8: the label of the Bitcoin that arrives at the bank in each case of G1 to G5
    if (where.startsWith("G")) {
      const arrivals = new Map<number, Tx[]>();
      for (const t of libTx.values()) if (t.type === "CRYPTO_IN") (arrivals.get(t.caseId) ?? arrivals.set(t.caseId, []).get(t.caseId)!).push(t);
      for (const c of lib.cases) {
        illicit.cases++;
        const ts = arrivals.get(c.caseId);
        if (!ts?.length) continue;
        illicit.withArrivals++;
        if (ts.every((t) => t.crypto?.label === "illicit")) illicit.illicit++;
      }
    }

    // L9, second half: no generated address of a party is in the wallet pool or on the OFAC list, and each is valid for its chain
    for (const q of ds.parties) if (q.address !== null) {
      addresses++;
      const ok = q.chain === "bitcoin" ? isBitcoinAddress(q.address) : q.chain === "ethereum" ? looksEthereum(q.address) : q.chain === "tron" ? isTronAddress(q.address) : false;
      if (!ok) note("L9", `${where} case ${q.caseId} ${q.key}: ${q.chain} address ${q.address} is not valid for its chain`);
      if (listed.has(q.address)) note("L9", `${where} case ${q.caseId} ${q.key}: ${q.address} is an address of the wallet pool or of the OFAC list`);
    }

    // L13, statement 2: no row with a chain names a party of the same case whose chain or whose address format is another one
    if (txLinked.has(where)) {
      const partyOf = new Map<string, Party>();
      for (const q of ds.parties) partyOf.set(`${q.caseId}|${q.key}`, q);
      const formatOk = (chain: string, a: string): boolean => (chain === "bitcoin" ? isBitcoinAddress(a) : chain === "ethereum" ? looksEthereum(a) : chain === "tron" ? isTronAddress(a) : false);
      for (const r of ds.caseLegs) {
        if (r.chain === null) continue;
        rowsOnChain++;
        for (const k of [r.from, r.to]) {
          const q = partyOf.get(`${r.caseId}|${k}`);
          if (!q) continue;
          if (q.chain !== null && q.chain !== r.chain) note13(2, `${where} case ${r.caseId} payment ${r.seq}: the payment is on ${r.chain} and ${k} is on ${q.chain}`);
          if (q.address !== null && !formatOk(r.chain, q.address)) note13(2, `${where} case ${r.caseId} payment ${r.seq}: the payment is on ${r.chain} and the address of ${k} has another format`);
        }
      }
    }

    // L10
    if (where === "H") {
      const wanted = Math.max(1, Math.round((5 * ds.accounts.length) / 1000));
      const rows = new Map<string, number>(), kept = new Map<string, number>();
      for (const r of ds.caseLegs) rows.set(r.pattern, (rows.get(r.pattern) ?? 0) + 1);
      for (const c of lib.cases) kept.set(c.pattern, (kept.get(c.pattern) ?? 0) + 1);
      for (const s of lib.skipped) kept.set(s.pattern, (kept.get(s.pattern) ?? 0) + s.cases);
      if (new Set(lib.capped).size !== lib.capped.length) note("L10", `H: capped names a pattern twice (${lib.capped.join(", ")})`);
      for (const p of PATTERNS) {
        if ((rows.get(p.id) ?? 0) > 1000) note("L10", `H: ${p.id} holds ${rows.get(p.id)} rows of caseLegs`);
        const stopped = (kept.get(p.id) ?? 0) < wanted;
        if (stopped !== lib.capped.includes(p.id)) note("L10", `H: ${p.id} planted or skipped ${kept.get(p.id) ?? 0} of ${wanted} cases and capped ${lib.capped.includes(p.id) ? "names" : "does not name"} it`);
      }
      for (const id of lib.capped) if (!PATTERNS.some((p) => p.id === id)) note("L10", `H: capped names ${id}, which is no pattern`);
      capSeen = lib.capped.length;
      if (!capSeen) note("L10", "H: no pattern reached the cap of 1,000 rows, so the check proves nothing");
    }
    timing.push(`${where} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }

  // L7: A1 and E are the same data set made twice, and the cases of the ransom pattern do not depend on which other patterns are on
  const a1 = hashes.get("A1"), e = hashes.get("E");
  if (!a1 || !e) note("L7", "A1 or E was not made");
  else for (const f of ["txs", "parties", "caseLegs"] as const) if (a1[f] !== e[f]) note("L7", `A1 and E give different hashes of ${f}`);
  const rf = ransomRows.get("F"), rb = ransomRows.get("B");
  if (!rf || !rb) note("L7", "F or B was not made");
  else {
    // a party is the same apart from the case number and the account of a party whose planted pattern was removed (null in one of the 2)
    const strip = (x: object, drop: string[]): string => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => !drop.includes(k))));
    if (rf.parties.length !== rb.parties.length) note("L7", `F holds ${rf.parties.length} parties of ${RANSOM} and B holds ${rb.parties.length}`);
    else rf.parties.forEach((q, i) => {
      const o = rb.parties[i];
      if (strip(q, ["caseId", "account"]) !== strip(o, ["caseId", "account"])) note("L7", `party ${q.key}: F and B differ (${strip(q, ["caseId"])} against ${strip(o, ["caseId"])})`);
      else if (q.account !== null && o.account !== null && q.account !== o.account) note("L7", `party ${q.key}: F gives the account ${q.account} and B gives ${o.account}`);
    });
    // a payment is the same apart from the case number, the amount that moved and the transaction id
    if (rf.legs.length !== rb.legs.length) note("L7", `F holds ${rf.legs.length} payments of ${RANSOM} and B holds ${rb.legs.length}`);
    else rf.legs.forEach((r, i) => { if (strip(r, ["caseId", "amount", "tx"]) !== strip(rb.legs[i], ["caseId", "amount", "tx"])) note("L7", `payment ${r.seq} of case ${i}: F and B differ (${strip(r, ["caseId", "amount", "tx"])} against ${strip(rb.legs[i], ["caseId", "amount", "tx"])})`); });
  }

  // L7, the second statement: for each of the 12 patterns, the cases of the pattern alone and the cases of the pattern with all 12 on have the same day, minute, payer, payee and planned amount in each row.
  // The bank has 1,000 accounts and each pattern a rate of 5, so each pattern plants 5 cases and the 13 data sets are made in a few seconds.
  const t7 = Date.now();
  let fail7b: string | null = null;
  const note7b = (m: string): void => { fail7b ??= `second statement: ${m}`; };
  let pairs7 = 0, rows7 = 0;
  {
    const small = (library: Record<string, LibrarySetting>): GenConfig => ({ ...DEFAULT_CONFIG, seed: 20260904, accounts: 1000, library });
    const rowsOf = (ds: Dataset, id: string): { caseId: number; rows: CaseLeg[] }[] => {
      const byCase = new Map<number, CaseLeg[]>();
      for (const r of ds.caseLegs) if (r.pattern === id) (byCase.get(r.caseId) ?? byCase.set(r.caseId, []).get(r.caseId)!).push(r);
      return (ds.library?.cases ?? []).filter((c) => c.pattern === id).map((c) => ({ caseId: c.caseId, rows: (byCase.get(c.caseId) ?? []).sort((x, y) => x.seq - y.seq) }));
    };
    const dsAll = generate(small(every(() => ({ per1k: 5 }))), wallets);
    for (const p of PATTERNS) {
      const mine = rowsOf(generate(small(only(p.id, { per1k: 5 })), wallets), p.id), theirs = rowsOf(dsAll, p.id);
      if (mine.length < 3) note7b(`${p.id}: ${mine.length} cases alone, fewer than 3`);
      if (mine.length !== theirs.length) { note7b(`${p.id}: ${mine.length} cases alone and ${theirs.length} with all 12 on`); continue; }
      mine.forEach((a, i) => {
        const b = theirs[i];
        pairs7++;
        if (a.rows.length !== b.rows.length) { note7b(`${p.id} case ${i + 1}: ${a.rows.length} rows alone and ${b.rows.length} with all 12 on`); return; }
        a.rows.forEach((r, j) => {
          const o = b.rows[j];
          rows7++;
          for (const f of ["day", "minute", "from", "to", "planned"] as const) if (r[f] !== o[f]) note7b(`${p.id} case ${i + 1} payment ${r.seq}: ${f} is ${r[f]} alone and ${o[f]} with all 12 on`);
        });
      });
    }
  }
  timing.push(`L7 pairs ${((Date.now() - t7) / 1000).toFixed(1)} s`);

  // L8: the label of a wallet that pays the bank at the cash-out end is "illicit" unless a draw is below the chance that the trail was lost, which is 1 less
  // the product of (1 less hides.chance) over the hiding parts. The only hiding part of the pattern is peel-chain, whose hides.chance is 0.05 in its file,
  // so the expected share of cases with the label "illicit" is 1 - 0.05 = 0.95. A case counts where it has an arriving payment, and counts as illicit where each arriving payment carries the label.
  const share = illicit.withArrivals ? illicit.illicit / illicit.withArrivals : 0;
  const expected = PATTERNS.find((p) => p.id === PEEL)?.parts.hiding.reduce((a, id) => { const h = PARTS.get(id); return a * (1 - (h && h.kind === "hiding" ? h.hides.chance : 0)); }, 1) ?? 0;
  if (Math.abs(expected - 0.95) > 1e-9) note("L8", `the files give the expected share ${expected}, and the check expects 0.95`);
  if (illicit.cases !== 100) note("L8", `G1 to G5 planted ${illicit.cases} cases, and the check expects 100`);
  if (Math.abs(share - 0.95) > 0.07) note("L8", `the share of cases with the label "illicit" is ${share.toFixed(3)} (${illicit.illicit} of ${illicit.withArrivals}), more than 0.07 from 0.95`);

  record("L3", `each pattern plants a case in A1 to A3, and each pattern with 2 customer ends in B to D (${casesPlanted} cases in ${specs.length} data sets)`, fails.L3);
  record("L6", `${rowsChecked} rows fit the dictionary, ${txsLinked} library transactions match their rows, the replay of each case holds, windows and rails are right`, fails.L6);
  record("L7", `A1 and E give the same hashes, the rows of the ransom pattern in F and B differ in the named fields only, and ${pairs7} cases of ${PATTERNS.length} patterns (${rows7} rows) keep their day, minute, payer, payee and planned amount whether the pattern is alone or all ${PATTERNS.length} are on`, [fails.L7, fail7b].filter((m) => m !== null).join(" | ") || null);
  record("L8", `${illicit.illicit} of ${illicit.withArrivals} cases of G1 to G5 have the label "illicit" on arriving Bitcoin (expected share 0.95 within 0.07)`, fails.L8);
  record("L9", `${addresses} generated addresses of parties are valid for their chain and are no address of the wallet pool or of the OFAC list`, fails.L9);
  record("L10", `H reaches the cap of 1,000 rows (${capSeen} patterns stopped) and each stopped pattern is named in the record`, fails.L10);
  record("L12", `the CSV files of the parties and of the planned payments read back with the same number of rows and the same values in 3 rows each (${csvRows} rows over ${specs.length} data sets)`, fails.L12);
  // L13, statement 1: in 200 plans of each pattern no payment with a chain names a party of another chain or a wallet without a chain
  // L13, statement 5: over the same plans, the groups of parties that hold no chain on a payment with a chain are the 4 services of the table of the design on uses and chains
  const SERVICES = new Set([
    "stolen-funds-through-bridge-and-mixers|bridge-hop.span", "investment-scam-to-stablecoin|swap-bridge-swap.aggregator",
    "investment-scam-to-stablecoin|high-risk-exchange-pass.venue", "stolen-funds-through-defi-to-mules|privacy-coin-hop.swapper",
  ]);
  const chainless = new Set<string>();
  let plansChecked = 0;
  for (const p of PATTERNS) for (let seed = 1; seed <= 200; seed++) {
    const plan = draw(p, seed), byKey = new Map(plan.parties.map((q) => [q.key, q] as const));
    plansChecked++;
    for (const l of plan.legs) {
      if (l.chain === null) continue;
      for (const k of [l.from, l.to]) {
        const q = byKey.get(k);
        if (!q) { note13(1, `${p.id} seed ${seed}: payment ${l.seq} names ${k}, which is no party of the plan`); continue; }
        if (q.chain !== null && q.chain !== l.chain) note13(1, `${p.id} seed ${seed}: payment ${l.seq} is on ${l.chain} and ${k} is on ${q.chain}`);
        if (q.chain === null && q.kind === "wallet") note13(1, `${p.id} seed ${seed}: payment ${l.seq} names the wallet ${k}, which has no chain`);
        if (q.chain === null && !q.cust) chainless.add(`${p.id}|${q.group}`);
      }
    }
  }
  for (const s of SERVICES) if (!chainless.has(s)) note13(5, `${s.split("|")[1]} in ${s.split("|")[0]} always holds a chain, though the design leaves it without one`);
  for (const s of chainless) if (!SERVICES.has(s)) note13(5, `${s.split("|")[1]} in ${s.split("|")[0]} holds no chain on a payment with a chain and is not one of the 4 services`);
  // L13, statement 3: the validator refuses 3 changed copies of the part bridge-hop in the pattern that names it
  const bridgePattern = PATTERNS.find((p) => p.parts.hiding.includes("bridge-hop"));
  const refusals: Record<string, boolean> = {};
  if (!bridgePattern) note13(3, "no pattern names the part bridge-hop");
  else {
    const bridge = plain(PARTS.get("bridge-hop")) as { parties: { id: string; kind?: string; chain?: string }[]; steps: { id: string; via?: string }[] };
    const copies: [string, (b: typeof bridge) => void][] = [
      ["check 11", (b) => { b.parties.find((q) => q.id === "span")!.kind = "wallet"; }],
      ["check 12", (b) => { const q = b.parties.find((x) => x.id === "span")!; q.chain = "bitcoin"; q.kind = "dex"; }],
      ["check 13", (b) => { b.steps.find((s) => s.id === "lock")!.via = "bank-crypto"; }],
    ];
    for (const [what, change] of copies) {
      const copy = plain(bridge) as typeof bridge;
      change(copy);
      const res = validatePattern(plain(bridgePattern), new Map([...PARTS, ["bridge-hop", copy as unknown as Part]]), known);
      refusals[what] = !res.ok && res.errors.some((e) => e.includes(`(${what})`));
      if (!refusals[what]) note13(3, `the validator does not refuse the copy of bridge-hop for ${what}${res.ok ? "" : ` (${res.errors[0]})`}`);
    }
  }
  // L13, statement 4: cutShortOf on the stored case of the bridge pattern
  const storedBridge = readJson(new URL("stolen-funds-through-bridge-and-mixers.json", goldenDir)) as { plan: Plan };
  const second = storedBridge.plan.legs.filter((l) => l.part === "mixer~2" && l.step === "deposit").map((l) => l.seq);
  const cutWithout = cutShortOf(storedBridge.plan.legs, new Set(storedBridge.plan.legs.map((l) => l.seq).filter((s) => !second.includes(s))));
  const cutWith = cutShortOf(storedBridge.plan.legs, new Set(storedBridge.plan.legs.map((l) => l.seq)));
  if (second.length === 0) note13(4, "the stored case holds no payment of the step deposit of the use mixer~2");
  if (!cutWithout) note13(4, "cutShortOf is false without the payments of the step deposit of the use mixer~2");
  if (cutWith) note13(4, "cutShortOf is true with every payment");
  record("L13", `${plansChecked} plans and ${rowsOnChain} rows with a chain name no party of another chain, the 4 services of the design are the only parties without a chain, the validator refuses 3 changed copies of bridge-hop, and cutShortOf answers for ${second.length} payments of mixer~2`, first13.filter((m) => m !== null).join(" | ") || null);

  // L14: the marks of a library payment. One data set of its own, the standard bank at seed number 20260904 with each pattern at a rate of 5
  // and at both ends where labelsOf allows it, whose library payments it compares with its ordinary payments. It is let go when the check ends.
  {
    const t14 = Date.now();
    const ds = generate(standard(20260904, every((p) => ({ per1k: 5, ...(canBoth(p) ? { bankSees: "both" as const } : {}) }))), wallets);
    const fails14: string[] = [];
    const at = (t: { day: number; minute: number }): number => t.day * 1440 + t.minute;
    const isLib = (t: Tx): boolean => typeof t.typology === "string" && t.typology.startsWith("lib.");
    const isOrd = (t: Tx): boolean => t.patternId < 0 && t.type !== "INITIAL";
    const groupOf = (t: Tx): string => `${t.orig >= 0 && t.dest >= 0 ? "between" : t.orig >= 0 ? "out" : "in"} ${t.rail} ${t.method}`;
    const lib = ds.txs.filter(isLib), ord = ds.txs.filter(isOrd);
    // statements 1 and 2: in each of 5 groups, the largest share of library payments at one minute is at most 3%, and the gap between the curves
    // of library and ordinary payments is at most 1.63 * sqrt(1/n + 1/N)
    const GROUPS = ["between FPS fps", "in FPS fps", "in CASH counter", "out FPS fps", "out CRYPTO crypto"];
    const curve = (ts: Tx[]): number[] => { const h = new Array<number>(1440).fill(0); for (const t of ts) h[t.minute]++; return h; };
    let topMax = 0;
    for (const g of GROUPS) {
      const a = lib.filter((t) => groupOf(t) === g), b = ord.filter((t) => groupOf(t) === g);
      if (!a.length || !b.length) { fails14.push(`statement 1: ${g} holds ${a.length} library and ${b.length} ordinary payments`); continue; }
      const ha = curve(a), hb = curve(b), top = Math.max(...ha) / a.length;
      let ca = 0, cb = 0, gap = 0;
      for (let m = 0; m < 1440; m++) { ca += ha[m] / a.length; cb += hb[m] / b.length; gap = Math.max(gap, Math.abs(ca - cb)); }
      const bound = 1.63 * Math.sqrt(1 / a.length + 1 / b.length);
      topMax = Math.max(topMax, top);
      if (!(top <= 0.03)) fails14.push(`statement 1: ${g}, largest share at one minute ${(100 * top).toFixed(1)}% of ${a.length}, above 3%`);
      if (!(gap <= bound)) fails14.push(`statement 2: ${g}, gap ${gap.toFixed(3)} above the bound ${bound.toFixed(3)} (n ${a.length}, N ${b.length})`);
    }
    // statement 3: the rows of each case, in the order of their numbers, have times that never decrease, the rows of payments that did not happen included
    const byCase = new Map<number, { seq: number; t: number }[]>();
    for (const r of ds.caseLegs) (byCase.get(r.caseId) ?? byCase.set(r.caseId, []).get(r.caseId)!).push({ seq: r.seq, t: at(r) });
    let backwards = 0;
    for (const rs of byCase.values()) { rs.sort((x, y) => x.seq - y.seq); if (rs.some((r, i) => i > 0 && r.t < rs[i - 1].t)) backwards++; }
    if (backwards) fails14.push(`statement 3: ${backwards} of ${byCase.size} cases have a row whose time is earlier than the time of the row before it`);
    // the runs of the answer key: the planned amounts, in pennies, of the rows of one use and one step in one case whose amount is above 0
    const runs = new Map<string, number[]>();
    for (const r of ds.caseLegs) if (r.amount > 0 && r.step !== "handoff") { const k = `${r.caseId}|${r.part}|${partIdOf(r.part)}.${r.step}`; (runs.get(k) ?? runs.set(k, []).get(k)!).push(pen(r.planned)); }
    const stepOfRun = (k: string): string => k.split("|")[2];
    // statement 4: no run of 3 or more payments of a step with the split rising is a ladder, where payment k is within k pennies of k times the first
    const rising = new Set<string>();
    for (const p of PARTS.values()) for (const s of p.steps) if (s.kind === "move" && s.split === "rising") rising.add(`${p.id}.${s.id}`);
    let risingRuns = 0, ladders = 0;
    for (const [k, v] of runs) { if (!rising.has(stepOfRun(k)) || v.length < 3) continue; risingRuns++; if (v.every((x, i) => Math.abs(x - (i + 1) * v[0]) <= i + 1)) ladders++; }
    if (ladders) fails14.push(`statement 4: ${ladders} of ${risingRuns} runs of 3 or more payments of the steps ${[...rising].join(", ")} are a ladder`);
    // statement 5: no run of 2 or more payments of the 3 steps that split unevenly since library version 2026-11.3 has one planned amount
    const UNEVEN = new Set(["exchange-to-bank-account.trade", "high-risk-exchange-pass.trade", "dex-swap.swapIn"]);
    let unevenRuns = 0, oneAmount = 0;
    for (const [k, v] of runs) { if (!UNEVEN.has(stepOfRun(k)) || v.length < 2) continue; unevenRuns++; if (v.every((x) => x === v[0])) oneAmount++; }
    if (oneAmount) fails14.push(`statement 5: ${oneAmount} of ${unevenRuns} runs of 2 or more payments of the steps ${[...UNEVEN].join(", ")} have one planned amount`);
    // statement 6: pairs of consecutive payments by one payer to one payee at most 3 days apart have one amount no more often among library payments than among ordinary ones
    const pairs = (ts: Tx[]): { n: number; same: number; share: number } => {
      const by = new Map<string, Tx[]>();
      for (const t of ts) { if (t.orig < 0) continue; const k = `${t.orig}|${t.dest >= 0 ? "a" + t.dest : t.cpRef ?? t.wallet ?? "?"}`; (by.get(k) ?? by.set(k, []).get(k)!).push(t); }
      let n = 0, same = 0;
      for (const list of by.values()) { list.sort((x, y) => at(x) - at(y)); for (let i = 1; i < list.length; i++) { if (at(list[i]) - at(list[i - 1]) > 3 * 1440) continue; n++; if (pen(list[i].amount) === pen(list[i - 1].amount)) same++; } }
      return { n, same, share: n ? same / n : 0 };
    };
    const pl = pairs(lib), po = pairs(ord);
    if (!(pl.share <= po.share)) fails14.push(`statement 6: library pairs with one amount ${(100 * pl.share).toFixed(2)}% (${pl.same} of ${pl.n}) against ordinary ${(100 * po.share).toFixed(2)}% (${po.same} of ${po.n})`);
    // statement 7: no library payment to a payee already paid has a reason
    const withReason = lib.filter((t) => t.payee && t.newPayee === false && t.payee.reason).length;
    if (withReason) fails14.push(`statement 7: ${withReason} library payments to a payee already paid have a reason`);
    // statement 8: the outside accounts that customers pay by Faster Payments, CHAPS or SWIFT, counted once for each case and reference from the first
    // payment in order of time and of id, are personal within 3 standard deviations of the shares of an ordinary new payee of the first payer's segment
    const firstPay = new Map<string, Tx>();
    for (const t of [...lib].sort((x, y) => at(x) - at(y) || x.id - y.id)) {
      if (t.orig < 0 || t.dest >= 0 || !t.payee || !(t.rail === "FPS" || t.rail === "CHAPS" || t.rail === "INTL") || !t.cpRef || t.cpRef.startsWith("VASP-")) continue;
      const k = `${t.caseId}|${t.cpRef}`;
      if (!firstPay.has(k)) firstPay.set(k, t);
    }
    let personal = 0, expected = 0, variance = 0;
    for (const t of firstPay.values()) {
      const seg = ds.accounts[t.orig].segment, p = seg === "retail" || seg === "private" ? 0.75 : 0.2;
      expected += p; variance += p * (1 - p);
      if (t.payee!.accountType === "personal") personal++;
    }
    const z = (personal - expected) / Math.sqrt(variance);
    if (!(Math.abs(z) <= 3)) fails14.push(`statement 8: ${personal} of ${firstPay.size} outside accounts are personal, ${expected.toFixed(1)} expected, ${z.toFixed(2)} standard deviations from it`);
    timing.push(`L14 ${((Date.now() - t14) / 1000).toFixed(1)} s`);
    record("L14", `in the standard bank with every pattern at a rate of 5, the largest share of library payments at one minute is ${(100 * topMax).toFixed(1)}% in 5 groups, each gap between the curves is within its bound, ${byCase.size} cases keep their order, ${ladders} of ${risingRuns} rising runs are a ladder, ${oneAmount} of ${unevenRuns} runs of 3 uneven steps have one amount, ${(100 * pl.share).toFixed(2)}% of library pairs have one amount against ${(100 * po.share).toFixed(2)}% of ordinary pairs, ${withReason} payments to a payee already paid have a reason and ${personal} of ${firstPay.size} outside accounts are personal against ${expected.toFixed(1)} expected`, fails14.join(" | ") || null);
  }
  console.log(`data sets: ${timing.join(", ")}`);
}

const bad = results.filter((r) => r.fail !== null);
console.log(`qa-library: ${results.length - bad.length} of ${results.length} checks passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (bad.length) process.exit(1);
