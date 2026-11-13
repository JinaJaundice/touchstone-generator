// Smoke test for the "laundering rides on existing relationships" setting
// (ridesExistingLinks, off as shipped; docs/METHOD.md 2.5). On the default bank
// at the default seed, the setting on must: plant the same number of layered
// patterns; make their legs known payments, domestic, sized like the payer's
// usual transfers; and record no placement for them. And the setting must
// travel in a share link. Off, nothing changes: smoke-twin's forty stored
// accounts and smoke-bench's scoreboard are the proof of that.
//   npx esbuild scripts/smoke-hidden.ts --bundle --platform=node --format=esm --outfile=.tmp/hidden.mjs && node .tmp/hidden.mjs
import { readFileSync } from "node:fs";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { DEFAULT_CONFIG, normaliseConfig } from "../src/lib/gen/config";
import { decodeBank, encodeBank } from "../src/lib/gen/archetypes";
import { TYPICAL_TRANSFER } from "../src/lib/gen/world";
import type { Dataset, WalletRef } from "../src/lib/gen/types";

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failures++; };
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const LAYERED = new Set(["stack", "scatter_gather", "gather_scatter", "bipartite", "cycle"]);

const wallets: WalletRef[] = readWalletPool(JSON.parse(readFileSync(new URL("../public/wallet_pool.json", import.meta.url), "utf8")));

function measure(ds: Dataset) {
  const layered = new Map<number, string>();
  for (const p of ds.patterns) if (LAYERED.has(p.typology)) layered.set(p.id, p.typology);
  const legs = ds.txs.filter((t) => t.type === "TRANSFER" && t.orig >= 0 && t.dest >= 0 && layered.has(t.patternId));
  const placements = ds.txs.filter((t) => (t.type === "CASH_IN" || t.type === "INCOME") && layered.has(t.patternId)).length;
  const newPayee = legs.filter((t) => t.newPayee).length / Math.max(1, legs.length);
  const abroad = legs.filter((t) => t.country !== "GB").length / Math.max(1, legs.length);
  const sizeRatio = legs.reduce((s, t) => s + t.amount / TYPICAL_TRANSFER[ds.accounts[t.orig].segment], 0) / Math.max(1, legs.length);
  const members = new Set<number>(); for (const p of ds.patterns) if (layered.has(p.id)) for (const a of p.accounts) members.add(a);
  return { instances: layered.size, legs: legs.length, placements, newPayee, abroad, sizeRatio, members: members.size };
}

const t0 = performance.now();
const off = generate(DEFAULT_CONFIG, wallets);
const t1 = performance.now();
const on = generate({ ...DEFAULT_CONFIG, ridesExistingLinks: true }, wallets);
const t2 = performance.now();
console.log(`made the default bank twice: setting off ${Math.round(t1 - t0)} ms, on ${Math.round(t2 - t1)} ms`);
const a = measure(off), b = measure(on);
check(on.accounts.length === off.accounts.length, `the same accounts (${on.accounts.length})`);
check(b.instances === a.instances, `the same number of layered patterns planted (${b.instances} against ${a.instances})`);
check(b.legs > 0 && a.legs > 0, `legs on both runs (${b.legs} against ${a.legs})`);
check(b.placements === 0 && a.placements > 0, `no placement recorded for a layered pattern with the setting on (${b.placements}; off records ${a.placements})`);
check(b.newPayee < 0.02 && a.newPayee > 0.3, `legs are known payments with the setting on (${pct(b.newPayee)} new payees against ${pct(a.newPayee)} off)`);
check(b.abroad <= a.abroad + 0.01, `legs stay in the country with the setting on (${pct(b.abroad)} abroad against ${pct(a.abroad)} off)`);
check(b.sizeRatio < a.sizeRatio && b.sizeRatio < 2, `legs sized like the payer's usual transfers (${b.sizeRatio.toFixed(2)}x the payer's typical transfer against ${a.sizeRatio.toFixed(2)}x off)`);
check(b.members >= a.members * 0.8, `about as many member accounts (${b.members} against ${a.members})`);
const link = encodeBank({ ...DEFAULT_CONFIG, ridesExistingLinks: true });
const back = decodeBank(link);
check(!!back && back.ridesExistingLinks === true && normaliseConfig(back).ridesExistingLinks === true, "the setting travels in a share link and survives the normaliser");
const legacy = normaliseConfig({ ...DEFAULT_CONFIG, ridesExistingLinks: undefined } as unknown as typeof DEFAULT_CONFIG);
check(!legacy.ridesExistingLinks, "a saved bank without the setting reads as off");
console.log(failures ? `\n${failures} FAILED` : "\nall ok");
process.exit(failures ? 1 : 0);
