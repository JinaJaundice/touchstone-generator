/* The names that a library pattern takes in the generator: for each pattern its title, its short name, the ends that the
   bank can see, and for each such end the key of the planted pattern with its family, label and short name. The entries
   are written to labels.json by scripts/write-references.ts, and check L1 of scripts/qa-library.ts compares the file
   with the entries that this function gives, so the rule for a label is in this one module. */

import type { BankSees, Family, Part, Pattern } from "./types";

/** The key of a planted pattern of a library pattern at one end of it, with the names that the pages show. */
export interface LabelKey { key: string; end: "source" | "cash-out"; family: Family; label: string; short: string }
/** The entry of one library pattern in labels.json. allowed lists the values of bankSees that the pattern can take. */
export interface LabelEntry { id: string; title: string; short: string; allowed: BankSees[]; bankSees: BankSees; per1k: number; keys: LabelKey[] }

/** The most characters of a short name of a key. */
export const SHORT_MAX = 26;

/** Gives one entry for each pattern, in the order of the list. */
export function labelsOf(patterns: readonly Pattern[], parts: ReadonlyMap<string, Part>): LabelEntry[] {
  return patterns.map((p) => {
    const ends: { end: "source" | "cash-out"; part: Part }[] = [];
    for (const [end, id] of [["source", p.parts.source], ["cash-out", p.parts.cashOut]] as const) {
      const part = parts.get(id);
      if (!part) throw new Error(`${p.id}: parts.${end === "source" ? "source" : "cashOut"}: names no part (${id})`);
      if (part.parties.some((q) => q.kind === "customer")) ends.push({ end, part });
    }
    const both = ends.length === 2;
    const allowed: BankSees[] = both ? ["source", "cash-out", "both"] : ends.length === 1 ? [ends[0].end] : [];
    const keys = ends.map(({ end, part }): LabelKey => {
      if (!part.family) throw new Error(`${part.id}: family: is required where the part has a customer party`);
      const tail = both ? ` (${end})` : "";
      return { key: `lib.${p.id}.${end}`, end, family: part.family, label: p.title + tail, short: p.short + tail };
    });
    return { id: p.id, title: p.title, short: p.short, allowed, bankSees: p.bankSees, per1k: p.per1k, keys };
  });
}
