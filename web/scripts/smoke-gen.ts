// Smoke test for the generator: run the default configuration in Node and
// print the summary. Bundled by esbuild because Node does not resolve
// extensionless TypeScript imports.
//   npx esbuild scripts/smoke-gen.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke.mjs && node .tmp/smoke.mjs
import { readFileSync } from "node:fs";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { DEFAULT_CONFIG } from "../src/lib/gen/config";
import type { WalletRef } from "../src/lib/gen/types";

const wallets: WalletRef[] = readWalletPool(JSON.parse(readFileSync(new URL("../public/wallet_pool.json", import.meta.url), "utf8")));
const t0 = performance.now();
const cfg = { ...DEFAULT_CONFIG, accounts: Number(process.argv[2] ?? DEFAULT_CONFIG.accounts) };
const ds = generate(cfg, wallets, (stage, done, total) => { if (done === 0 || done === total) console.log(`  ${stage} ${done}/${total}`); });
console.log(`generated in ${Math.round(performance.now() - t0)} ms`);
const s = ds.summary;
console.log(JSON.stringify({ accounts: s.accounts, txs: s.txs, patterns: s.patterns, sar: s.sarAccounts, fraud: s.fraudAccounts, newAccounts: s.newAccounts, crypto: s.cryptoAccounts, totalValue: s.totalValue, pct: s.amountPercentiles }, null, 1));
console.log("by type", s.byType);
console.log("by rail", s.byRail);
console.log("by typology");
for (const [k, v] of Object.entries(s.byTypology)) console.log(`  ${k.padEnd(26)} inst ${String(v.instances).padStart(3)} accts ${String(v.accounts).padStart(4)} txs ${String(v.txs).padStart(5)} total ${v.total.toLocaleString()}`);
const sar = ds.txs.filter((t) => t.patternId >= 0).length;
console.log(`pattern txs ${sar} of ${ds.txs.length} (${(100 * sar / ds.txs.length).toFixed(2)}%)`);
const neg = ds.accounts.filter((a, i) => ds.txs.some((t) => t.orig === i && t.balOrigAfter < -0.01)).length;
console.log(`accounts that went negative: ${neg}`);
const np = ds.txs.filter((t) => t.type === "TRANSFER");
console.log(`transfers ${np.length}, first payments ${np.filter((t) => t.newPayee).length}, international ${np.filter((t) => t.country !== "GB").length}`);
const bytes = JSON.stringify(ds).length;
console.log(`json size ${(bytes / 1e6).toFixed(1)} MB`);
// The wallet pool text: a fourth argument starts grounding.wallets, and without one the default sentence does.
const small = { ...DEFAULT_CONFIG, accounts: 200 };
const aboutText = "A test description of the wallet pool.";
const withAbout = generate(small, wallets, undefined, aboutText).grounding.wallets;
const without = generate(small, wallets).grounding.wallets;
const checks: [string, boolean][] = [
  ["grounding.wallets starts with the text passed as poolAbout", withAbout.startsWith(aboutText)],
  ["grounding.wallets starts with the default sentence when no text is passed", without.startsWith("The caller passed no description of the wallet pool.")],
];
for (const [name, ok] of checks) console.log(`${ok ? "ok" : "FAIL"}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
