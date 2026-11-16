/* The registry of the pattern library: every part file and pattern file, imported by name and checked once when the
   module loads. A file that fails a check stops the module with an error that names the file and the field. */

import { validatePart, validatePattern } from "./validate";
import type { Part, Pattern } from "./types";
import references from "./references.json";

import bankCryptoSale from "./parts/bank-crypto-sale.json";
import exchangeHack from "./parts/exchange-hack.json";
import mixer from "./parts/mixer.json";
import otcDeskPayout from "./parts/otc-desk-payout.json";
import peelChain from "./parts/peel-chain.json";
import ransomPayment from "./parts/ransom-payment.json";

import ransomThroughAMixer from "./library/ransom-through-a-mixer.json";
import stolenFundsThroughAPeelChain from "./library/stolen-funds-through-a-peel-chain.json";

/** The source ids that references.json holds, which check 6 of the validator uses. */
const KNOWN: ReadonlySet<string> = new Set(references.sources.map((s) => s.id));

const PART_FILES: Record<string, unknown> = {
  "bank-crypto-sale": bankCryptoSale, "exchange-hack": exchangeHack, mixer, "otc-desk-payout": otcDeskPayout,
  "peel-chain": peelChain, "ransom-payment": ransomPayment,
};
const PATTERN_FILES: Record<string, unknown> = {
  "ransom-through-a-mixer": ransomThroughAMixer, "stolen-funds-through-a-peel-chain": stolenFundsThroughAPeelChain,
};

const errors: string[] = [];
const parts = new Map<string, Part>();
for (const [name, json] of Object.entries(PART_FILES)) {
  const res = validatePart(json, KNOWN);
  if (!res.ok) { errors.push(...res.errors); continue; }
  if (res.value.id !== name) errors.push(`${res.value.id}: id: the file parts/${name}.json holds another id`);
  parts.set(res.value.id, res.value);
}
const patterns: Pattern[] = [];
for (const [name, json] of Object.entries(PATTERN_FILES)) {
  const res = validatePattern(json, parts, KNOWN);
  if (!res.ok) { errors.push(...res.errors); continue; }
  if (res.value.id !== name) errors.push(`${res.value.id}: id: the file library/${name}.json holds another id`);
  patterns.push(res.value);
}
if (errors.length) throw new Error(`The pattern library holds a file that fails a check:\n${errors.join("\n")}`);
patterns.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Every part of the library, by id. */
export const PARTS: ReadonlyMap<string, Part> = parts;
/** Every pattern of the library, in the order of their ids. */
export const PATTERNS: readonly Pattern[] = patterns;
/** The part with this id, or undefined. */
export const partOf = (id: string): Part | undefined => parts.get(id);
/** The pattern with this id, or undefined. */
export const patternOf = (id: string): Pattern | undefined => patterns.find((p) => p.id === id);
