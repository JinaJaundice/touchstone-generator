// Smoke test for the Parquet export. Generates the default data set, writes
// the transactions and the accounts as Parquet, reads both back with the
// hyparquet reader, and checks row for row against the data set: the counts,
// every column on a sample of rows, the amount total, the nulls, and the
// seed number in the file's metadata. Also prints the file sizes against CSV.
//   npx esbuild scripts/smoke-parquet.ts --bundle --platform=node --format=esm --outfile=.tmp/parquet.mjs && node .tmp/parquet.mjs
import { readFileSync } from "node:fs";
import { parquetMetadata, parquetReadObjects } from "hyparquet";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { DEFAULT_CONFIG } from "../src/lib/gen/config";
import type { WalletRef } from "../src/lib/gen/types";
import { ACCOUNT_COLUMNS, TX_COLUMNS, accountCell, accountsParquet, txCell, txParquet } from "../src/lib/gen/parquet";

const wallets: WalletRef[] = readWalletPool(JSON.parse(readFileSync(new URL("../public/wallet_pool.json", import.meta.url), "utf8")));
const ds = generate(DEFAULT_CONFIG, wallets);
console.log(`data set: ${ds.accounts.length} accounts, ${ds.txs.length} txs`);

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failures++; };
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);

const t0 = performance.now();
const txBuf = await txParquet(ds);
const accBuf = await accountsParquet(ds);
console.log(`written in ${Math.round(performance.now() - t0)} ms: transactions ${(txBuf.byteLength / 1e6).toFixed(2)} MB, accounts ${(accBuf.byteLength / 1e3).toFixed(0)} kB`);

// the CSV for size comparison, built the way the page builds it
const csvBytes = ds.txs.reduce((s, t) => s + TX_COLUMNS.map((c) => String(txCell(t, c.name, ds.day0) ?? "")).join(",").length + 1, 0);
console.log(`the transaction CSV would be about ${(csvBytes / 1e6).toFixed(2)} MB; Parquet is ${(100 * txBuf.byteLength / csvBytes).toFixed(0)}% of it`);

// transactions
const txMeta = parquetMetadata(txBuf);
const kv = Object.fromEntries((txMeta.key_value_metadata ?? []).map((k) => [k.key, k.value]));
check(kv["touchstone.seed"] === String(ds.config.seed) && kv["touchstone.table"] === "transactions", `metadata carries the seed number (${kv["touchstone.seed"]}) and the table name`);
check(Number(txMeta.num_rows) === ds.txs.length, `metadata row count ${txMeta.num_rows} equals ${ds.txs.length}`);
const names = txMeta.schema.slice(1).map((s) => s.name);
check(names.join(",") === TX_COLUMNS.map((c) => c.name).join(","), `columns in the CSV order (${names.length})`);
const txRows = await parquetReadObjects({ file: txBuf });
check(txRows.length === ds.txs.length, `read back ${txRows.length} transaction rows`);
let bad = 0, checked = 0;
for (let i = 0; i < ds.txs.length; i += i < 50 || i > ds.txs.length - 50 ? 1 : 997) {
  for (const c of TX_COLUMNS) { checked++; if (!same(txRows[i][c.name], txCell(ds.txs[i], c.name, ds.day0))) { bad++; if (bad <= 3) console.log(`   row ${i} ${c.name}: file ${String(txRows[i][c.name])} vs data ${String(txCell(ds.txs[i], c.name, ds.day0))}`); } }
}
check(bad === 0, `${checked} cells on sampled rows match the data set (first 50, last 50, every 997th)`);
const sumFile = txRows.reduce((s, r) => s + (r.amount as number), 0), sumData = ds.txs.reduce((s, t) => s + t.amount, 0);
check(Math.abs(sumFile - sumData) < 1e-3, `amount total matches: ${sumFile.toFixed(2)} in the file, ${sumData.toFixed(2)} in the data`);
const nullWallets = txRows.filter((r) => r.wallet === null || r.wallet === undefined).length, dataNullWallets = ds.txs.filter((t) => t.wallet === null).length;
check(nullWallets === dataNullWallets && nullWallets > 0, `nulls survive: ${nullWallets} rows without a wallet in both`);
const planted = txRows.filter((r) => (r.patternId as number) >= 0).length, dataPlanted = ds.txs.filter((t) => t.patternId >= 0).length;
check(planted === dataPlanted, `planted rows: ${planted} in the file, ${dataPlanted} in the data`);
check(txRows.every((r) => typeof r.newPayee === "boolean" && typeof r.amount === "number" && typeof r.day === "number"), "types read back as boolean and number");

// accounts
const accRows = await parquetReadObjects({ file: accBuf });
check(accRows.length === ds.accounts.length, `read back ${accRows.length} account rows`);
bad = 0; checked = 0;
for (let i = 0; i < ds.accounts.length; i += i < 50 ? 1 : 37) {
  for (const c of ACCOUNT_COLUMNS) { checked++; if (!same(accRows[i][c.name], accountCell(ds.accounts[i], c.name))) { bad++; if (bad <= 3) console.log(`   account ${i} ${c.name}: file ${String(accRows[i][c.name])} vs data ${String(accountCell(ds.accounts[i], c.name))}`); } }
}
check(bad === 0, `${checked} account cells match (patterns joined with | as in the CSV)`);
const sars = accRows.filter((r) => r.isSar === true).length;
check(sars === ds.accounts.filter((a) => a.isSar).length && sars > 0, `${sars} laundering accounts flagged in both`);
const accKv = Object.fromEntries((parquetMetadata(accBuf).key_value_metadata ?? []).map((k) => [k.key, k.value]));
check(accKv["touchstone.table"] === "accounts" && accKv["touchstone.seed"] === String(ds.config.seed), "accounts file metadata names its table and the seed number");

console.log(failures ? `\n${failures} FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
