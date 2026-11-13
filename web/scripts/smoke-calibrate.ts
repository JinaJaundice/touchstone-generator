// Smoke test for setting the dials from a bank's figures: the template reads
// back and applies every figure; shares written as percentages read the same
// as fractions; segments given as counts normalise; a country pool set moves
// the other pools to fill the rest; an unknown key is reported, never
// silently dropped; the activity dial inverts the builder's estimate; and
// the calibrated bank generates.
//   npx esbuild scripts/smoke-calibrate.ts --bundle --platform=node --format=esm --outfile=.tmp/calibrate.mjs && node .tmp/calibrate.mjs
import { readFileSync } from "node:fs";
import { generate, readWalletPool } from "../src/lib/gen/generate";
import { DEFAULT_CONFIG } from "../src/lib/gen/config";
import { estimate } from "../src/lib/gen/archetypes";
import type { WalletRef } from "../src/lib/gen/types";
import { calibrate, figuresTemplate, readFigures } from "../src/lib/gen/calibrate";

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failures++; };
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

const base = DEFAULT_CONFIG;
const tpl = readFigures(figuresTemplate(base));
check(tpl.ok, "the template reads as figures");
if (tpl.ok) {
  const c = calibrate(tpl.figures, base);
  check(c.ignored.length === 0, `the template carries no figure without a dial (ignored: ${c.ignored.join("; ") || "none"})`);
  check(c.applied.length >= 20, `${c.applied.length} figures applied from the template`);
  check(c.config.customers.digitalShare === base.customers.digitalShare && c.config.products.cards === base.products.cards, "the template's figures reproduce the bank they were written from");
}

{
  const a = calibrate({ takenOnOnline: 0.4, politicallyExposed: 0.5 }, base);
  const b = calibrate({ takenOnOnline: 40, politicallyExposed: 0.5 }, base);
  check(near(a.config.customers.digitalShare, 0.4) && near(b.config.customers.digitalShare, 0.4), "a share reads the same written as 0.4 or as 40");
  check(near(a.config.customers.pepShare, 0.5), "a share of 0.5 stays a fraction (it is not read as 0.5%)");
}

{
  const c = calibrate({ segments: { retail: 9200, sme: 700, corporate: 100 } }, base);
  const s = c.config.segments;
  check(near(s.retail, 0.92, 1e-3) && near(s.sme, 0.07, 1e-3) && near(s.corporate, 0.01, 1e-3) && near(s.private, 0, 1e-9), `segments given as counts normalise: ${JSON.stringify(s)}`);
  const d = calibrate({ segments: { sme: 0.2 } }, base);
  check(near(d.config.segments.sme, 0.2) && near(d.config.segments.retail + d.config.segments.sme + d.config.segments.corporate + d.config.segments.private, 1), "a single segment share moves personal to fill the rest");
}

{
  const c = calibrate({ abroadToFatfListed: 0.1 }, base);
  const m = c.config.geography.corridorMix;
  check(near(m.highRisk, 0.1) && near(m.eea + m.other + m.corridor + m.highRisk, 1), `a country pool set to 10% leaves the mix adding to one: ${JSON.stringify(m)}`);
  const ratio = base.geography.corridorMix.eea / base.geography.corridorMix.corridor;
  check(near(m.eea / m.corridor, ratio, 1e-9), "the other pools keep their proportions");
}

{
  const c = calibrate({ takenOnOnline: 0.3, averageBalance: 1200, cashServices: "kiosk" } as never, base);
  check(c.ignored.some((x) => x.includes("averageBalance")) && c.ignored.some((x) => x.includes("cashServices")), `unknown or bad figures are reported: ${c.ignored.join("; ")}`);
  check(c.applied.length === 1, "and the good figure still applies");
}

{
  const target = 0.9;
  const c = calibrate({ transactionsPerAccountPerDay: target }, base);
  const est = estimate(c.config);
  const perDay = est.txs / (c.config.accounts * c.config.days);
  check(near(perDay, target, 0.12), `transactions per account per day ${target} sets activity ${c.config.activity}x, and the builder's estimate gives ${perDay.toFixed(2)} a day`);
  const hi = calibrate({ transactionsPerAccountPerDay: 5 }, base);
  check(hi.config.activity === 2 && hi.notes.some((n) => n.includes("outside")), "a figure beyond the dial's range is clamped and noted");
}

{
  const c = calibrate({ accounts: 1000, days: 30, bankType: "buildingsociety", cashServices: "partner", paymentsAbroadOffered: false, withALinkedWallet: 0 }, base);
  check(c.config.archetype === "buildingsociety" && c.config.products.cashServices === "partner" && c.config.products.international === false, "the bank type, the cash services and payments abroad apply");
  const wallets: WalletRef[] = readWalletPool(JSON.parse(readFileSync(new URL("../public/wallet_pool.json", import.meta.url), "utf8")));
  const ds = generate(c.config, wallets);
  check(ds.accounts.length === 1000 && ds.txs.length > 0, `the calibrated bank generates: ${ds.accounts.length} accounts, ${ds.txs.length} transactions (${ds.summary.byRail.INTL ?? 0} on the international rail, from planted crime only)`);
}

console.log(failures ? `\n${failures} FAILED` : "\nall ok");
process.exit(failures ? 1 : 0);
