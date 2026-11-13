/* A short fingerprint of a data set: eight hex characters from a hash over
   the transactions (day, minute, payer, payee, amount), so two data sets can
   be told apart at a glance and a run can be tied to the data it ran on.
   Every make draws a new seed unless the seed is pinned, and the fingerprint
   is the proof on the page that the transactions are new. */

import type { Dataset } from "./types";

export function fingerprint(ds: Pick<Dataset, "txs">): string {
  // FNV-1a over a stride of the log, so the largest data set costs a few milliseconds
  const step = Math.max(1, Math.floor(ds.txs.length / 200_000));
  let h = 0x811c9dc5;
  const mix = (n: number) => { h ^= n & 0xff; h = Math.imul(h, 0x01000193); h ^= (n >>> 8) & 0xff; h = Math.imul(h, 0x01000193); h ^= (n >>> 16) & 0xff; h = Math.imul(h, 0x01000193); h ^= (n >>> 24) & 0xff; h = Math.imul(h, 0x01000193); };
  mix(ds.txs.length);
  for (let i = 0; i < ds.txs.length; i += step) {
    const t = ds.txs[i];
    mix(t.day); mix(t.minute); mix(t.orig + 4096); mix(t.dest + 4096); mix(Math.round(t.amount * 100));
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
