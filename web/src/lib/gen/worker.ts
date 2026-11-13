/* The generator runs off the main thread so a 10,000-account book does not
   freeze the page. Messages in: a config and the wallet pool. Messages out:
   progress, the transactions in slices, then the rest of the dataset.

   The transactions go in slices because one message cannot carry them all at
   the largest bank: each record carries its session, payee, card and crypto
   facts, and a single postMessage of 2.4 million of them fails with "Data
   cannot be cloned, out of memory" (found 23 September 2026). */

import { generate } from "./generate";
import type { GenConfig, WalletRef } from "./types";

/** Records per message: small enough to clone at the largest bank, few enough messages to be quick. */
export const TX_SLICE = 200_000;

self.onmessage = (e: MessageEvent<{ config: GenConfig; wallets: WalletRef[]; about?: unknown }>) => {
  const { config, wallets, about } = e.data;
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  try {
    const started = performance.now();
    const ds = generate(config, wallets, (stage, done, total) => post({ kind: "progress", stage, done, total }), typeof about === "string" ? about : undefined);
    const txs = ds.txs;
    for (let i = 0; i < txs.length; i += TX_SLICE) {
      post({ kind: "progress", stage: "handing over the records", done: i, total: txs.length });
      post({ kind: "txs", txs: txs.slice(i, i + TX_SLICE) });
    }
    post({ kind: "done", dataset: { ...ds, txs: [] }, count: txs.length, ms: Math.round(performance.now() - started) });
  } catch (err) {
    post({ kind: "error", message: String(err) });
  }
};
