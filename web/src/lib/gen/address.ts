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

/* Ethereum and Tron addresses for the parties of a library case. The format of each is right and the address holds
   nothing. The Tron checksum needs SHA-256, which is written here because the page's own thread cannot call Node.js and
   the browser's own function does not return at once. */

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** The SHA-256 digest of some bytes (FIPS 180-4), as 32 bytes. */
export function sha256(bytes: Uint8Array): Uint8Array {
  const n = bytes.length, padded = new Uint8Array(((n + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[n] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(n / 0x20000000), false);
  view.setUint32(padded.length - 4, (n << 3) >>> 0, false);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  const rotr = (x: number, k: number) => (x >>> k) | (x << (32 - k));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + 4 * i, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  h.forEach((x, i) => ov.setUint32(4 * i, x >>> 0, false));
  return out;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** The Base58 text of some bytes, by long division on the bytes, with a "1" for each leading zero byte. */
function base58(bytes: number[]): string {
  const digits: number[] = [];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) { carry += digits[i] * 256; digits[i] = carry % 58; carry = Math.floor(carry / 58); }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let out = "";
  for (const b of bytes) { if (b === 0) out += "1"; else break; }
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58[digits[i]];
  return out;
}

/** An Ethereum address from the stream: 0x and 40 lower-case hexadecimal digits, one draw for each digit. */
export function makeEthAddress(r: Rng): string {
  let s = "";
  for (let i = 0; i < 40; i++) s += Math.floor(r() * 16).toString(16);
  return "0x" + s;
}

/** A Tron address from the stream: the Base58Check form of the byte 0x41 and 20 drawn bytes, one draw for each byte. */
export function makeTronAddress(r: Rng): string {
  const payload = [0x41, ...Array.from({ length: 20 }, () => Math.floor(r() * 256))];
  const check = sha256(sha256(Uint8Array.from(payload)));
  return base58([...payload, ...check.subarray(0, 4)]);
}
