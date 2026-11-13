/* A customer's own Bitcoin wallet. Counterparty wallets come from
   the wallet pool file (wallet_pool.json); a customer's own self-hosted wallet is
   made here, one per customer, as a native segwit address (BIP 173, version
   0, 20-byte witness program) with a valid checksum. It can be looked up on
   any explorer and holds nothing, which the method says. */

import type { Rng } from "../rng";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= G[i];
  }
  return chk >>> 0;
}
const hrpExpand = (hrp: string) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

/** Regroup 8-bit bytes into 5-bit words, padded. */
function toWords(bytes: number[]): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out.push((acc >>> bits) & 31); }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

/** A valid bech32 (P2WPKH) Bitcoin mainnet address from the stream. */
export function makeSegwitAddress(r: Rng): string {
  const program = Array.from({ length: 20 }, () => Math.floor(r() * 256));
  const data = [0, ...toWords(program)];
  const pm = polymod([...hrpExpand("bc"), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (pm >>> (5 * (5 - i))) & 31);
  return "bc1" + [...data, ...checksum].map((d) => CHARSET[d]).join("");
}
