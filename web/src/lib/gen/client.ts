import type { Dataset, GenConfig, WalletRef } from "./types";
import { readWalletPool } from "./generate";

export type GenProgress = { stage: string; done: number; total: number };

let poolPromise: Promise<{ wallets: WalletRef[]; about: string | null; generated: boolean | null }> | null = null;

/** The wallet pool file that grounds the crypto rail, read once, with the text in which the file states its own origin. */
export function loadWalletPoolFile(): Promise<{ wallets: WalletRef[]; about: string | null; generated: boolean | null }> {
  if (!poolPromise) {
    poolPromise = fetch("./wallet_pool.json")
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => ({ wallets: readWalletPool(j), about: typeof j.about === "string" ? j.about : null, generated: j.source === "generated" }))
      .catch(() => ({ wallets: [] as WalletRef[], about: null, generated: null }));
  }
  return poolPromise;
}

export function loadWalletPool(): Promise<WalletRef[]> {
  return loadWalletPoolFile().then((f) => f.wallets);
}

export function runGenerator(config: GenConfig, onProgress?: (p: GenProgress) => void): Promise<{ dataset: Dataset; ms: number }> {
  return loadWalletPoolFile().then(({ wallets, about }) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    // the records arrive in slices (worker.ts says why) and are joined here in order
    const txs: Dataset["txs"] = [];
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.kind === "progress") onProgress?.(m);
      else if (m.kind === "txs") { for (const t of m.txs) txs.push(t); }
      else if (m.kind === "done") {
        worker.terminate();
        if (txs.length !== m.count) { reject(new Error(`${txs.length} of ${m.count} records arrived from the generator`)); return; }
        resolve({ dataset: { ...m.dataset, txs }, ms: m.ms });
      }
      else if (m.kind === "error") { worker.terminate(); reject(new Error(m.message)); }
    };
    worker.onerror = (e) => { worker.terminate(); reject(e); };
    worker.postMessage({ config, wallets, about });
  }));
}
