// Bitcoin address checks for the generator's QA: base58check for legacy
// (1...) and script (3...) addresses, bech32 and bech32m for native segwit
// (bc1...). A truncated or made-up id fails the checksum, so a wallet in the
// data can be looked up on a public explorer only if it passes here.

import { createHash } from "node:crypto";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();

function base58decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c === "1") bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

/** A legacy or script address whose four-byte checksum matches. */
export function isBase58Check(addr: string): boolean {
  const raw = base58decode(addr);
  if (!raw || raw.length !== 25) return false;
  const body = raw.slice(0, 21), check = raw.slice(21);
  const h = sha256(sha256(body));
  return check.every((b, i) => b === h[i]) && (raw[0] === 0x00 || raw[0] === 0x05);
}

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

/** A native segwit address (bech32 for version 0, bech32m for version 1 and up) on Bitcoin mainnet. */
export function isBech32(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a !== addr && addr.toUpperCase() !== addr) return false;
  const pos = a.lastIndexOf("1");
  if (pos < 1 || pos + 7 > a.length || a.length > 90) return false;
  const hrp = a.slice(0, pos);
  if (hrp !== "bc") return false;
  const data: number[] = [];
  for (const c of a.slice(pos + 1)) { const d = CHARSET.indexOf(c); if (d < 0) return false; data.push(d); }
  const pm = polymod([...hrpExpand(hrp), ...data]);
  const version = data[0];
  return version === 0 ? pm === 1 : pm === 0x2bc830a3;
}

/** Any valid Bitcoin mainnet address. */
export const isBitcoinAddress = (a: string): boolean => /^(1|3)/.test(a) ? isBase58Check(a) : /^bc1/i.test(a) ? isBech32(a) : false;

/** A checksummed Ethereum address has the right shape; the checksum itself needs keccak, which the checks below do not need. */
export const looksEthereum = (a: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(a);

/** A Tron address: 34 characters of Base58Check that start with T, whose first byte is 0x41 and whose four-byte checksum matches. */
export function isTronAddress(a: string): boolean {
  if (a.length !== 34 || a[0] !== "T") return false;
  const raw = base58decode(a);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return false;
  const h = sha256(sha256(raw.slice(0, 21)));
  return raw.slice(21).every((b, i) => b === h[i]);
}
