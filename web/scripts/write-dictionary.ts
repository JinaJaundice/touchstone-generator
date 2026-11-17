// Writes docs/DATA_DICTIONARY.md from src/lib/gen/dictionary.ts: every field
// the generator writes, every value a label can take, and what it means. The
// same specs validate every record in scripts/qa-gen.ts (check D0), so the
// document, the validator and the data cannot drift apart.
//
//   npx esbuild scripts/write-dictionary.ts --bundle --platform=node --format=esm --outfile=.tmp/write-dictionary.mjs && node .tmp/write-dictionary.mjs

import { writeFileSync } from "node:fs";
import { ACCOUNT_FIELDS, ACCOUNT_ROLE, CARD_FIELDS, CASE_LEG_FIELDS, CRYPTO_FIELDS, EVENT_FIELDS, LEG_ROLE, LIBRARY_KEYS, PARTY_FIELDS, PATTERN_FIELDS, PAYEE_FIELDS, SESSION_FIELDS, TX_FIELDS, type FieldSpec } from "../src/lib/gen/dictionary";
import { FAMILY_LABEL, FAMILY_OWNER, TYPOLOGY_FAMILY, TYPOLOGY_LABEL, type Family, type Typology } from "../src/lib/gen/types";
import { GENERATOR_VERSION } from "../src/lib/gen/version";

const cell = (s: string) => s.replace(/\|/g, "\\|");
function table(specs: FieldSpec[]): string {
  const rows = specs.map((f) => {
    const vals = f.values ? Object.entries(f.values).map(([k, v]) => `\`${k}\`: ${v}`).join("; ") : "";
    const kind = `${f.type}${f.nullable ? ", may be null" : ""}${f.optional ? ", optional" : ""}${f.truth ? ", truth" : ""}`;
    return `| \`${f.name}\` | ${kind} | ${cell(f.meaning)}${f.when ? `. Set when ${cell(f.when)}.` : ""}${vals ? `<br>${cell(vals)}` : ""} |`;
  });
  return ["| Field | Kind | Meaning |", "|---|---|---|", ...rows].join("\n");
}

const families = (Object.keys(FAMILY_LABEL) as Family[]).map((f) => `| \`${f}\` | ${FAMILY_LABEL[f]} | ${FAMILY_OWNER[f]} |`);
const libraryKeys = LIBRARY_KEYS.map((k) => `| \`${k.key}\` | ${k.label} | \`${k.family}\` |`);
const typologies = (Object.keys(TYPOLOGY_LABEL) as Typology[]).map((t) => `| \`${t}\` | ${TYPOLOGY_LABEL[t]} | \`${TYPOLOGY_FAMILY[t]}\` |`);

const md = `# The data dictionary

Written by \`web/scripts/write-dictionary.ts\` from \`web/src/lib/gen/dictionary.ts\`
for generator release ${GENERATOR_VERSION}. Do not edit by hand: change the
dictionary module and run the script. In the working repository a check reads
every record of every data set in its matrix against the same definitions and
fails on a field missing, of the wrong kind, or holding a value not listed here.

A field marked **truth** is the answer key. It travels on the record for the
marking and for the files, and no rule may read it.

The transaction file and the account file hold one column for each field of the
tables Transactions and Accounts below. A field of the session, the payee, the
card payment or the crypto payment has a column named after both, such as
\`session_channel\` or \`crypto_label\`. The transaction file also holds the column
\`date\`, which gives the calendar date of \`day\`.

The tables Parties of a planted case and Payments of a planted case describe the
answer key of the crime patterns of the library. A case is one run of such a
pattern, from the source of the money to its cash-out. A part is one piece of the
method of a pattern, such as the source of the money or the cash-out, and a step
is one action within a part. Each of the 2 tables is a table in the data set with
one column for each field. Where the data set holds planted cases of the
library, the download holds a file in CSV form for each of the 2 tables.
Neither has a Parquet file. A data set made with no pattern of the library
switched on holds no row of either table.

## Transactions

One record per payment, card authorisation, cash movement, crypto payment or
opening balance. A declined card authorisation is a record that moved no money.
The date of a day is the data set's calendar: period 1 day 0 is Monday
6 July 2026, and the minute is UK clock time.

${table(TX_FIELDS)}

### The session a customer paid from (\`session\`)

${table(SESSION_FIELDS)}

### The payee of a bank payment (\`payee\`)

${table(PAYEE_FIELDS)}

### A card payment (\`card\`)

${table(CARD_FIELDS)}

### A crypto payment (\`crypto\`)

${table(CRYPTO_FIELDS)}

## Security events

Something that happened on an account that is not a payment.

${table(EVENT_FIELDS)}

## Accounts

${table(ACCOUNT_FIELDS)}

## Planted patterns

${table(PATTERN_FIELDS)}

## Parties of a planted case

One row for each party of each case that a pattern of the library planted. A
party is a customer of the bank or an outside party that takes part in the case,
and it belongs to one part.

${table(PARTY_FIELDS)}

## Payments of a planted case

One row for each planned payment of each case that a pattern of the library
planted. A payment is one movement of money between 2 parties of the case, and
it belongs to one step. A payment that the bank does not record has a row too,
with the amount that the case moved.

${table(CASE_LEG_FIELDS)}

## Labels

### Families: which control owns a pattern

| Family | Name | The control that owns it |
|---|---|---|
${families.join("\n")}

### Crime patterns

| Key | Name | Family |
|---|---|---|
${typologies.join("\n")}

### Crime patterns of the library

The key of a planted pattern of the library is lib, the id of the crime pattern
and the end of it that the bank sees. The family is the family of that end.

| Key | Name | Family |
|---|---|---|
${libraryKeys.join("\n")}

### The role of a payment in its pattern (\`role\` on a transaction)

| Role | Meaning |
|---|---|
${Object.entries(LEG_ROLE).map(([k, v]) => `| \`${k}\` | ${cell(v)} |`).join("\n")}

### A customer's part in a pattern (\`roles\` on a pattern)

| Role | Meaning |
|---|---|
${Object.entries(ACCOUNT_ROLE).map(([k, v]) => `| \`${k}\` | ${cell(v)} |`).join("\n")}
`;
writeFileSync(new URL("../../docs/DATA_DICTIONARY.md", import.meta.url), md);
console.log(`wrote docs/DATA_DICTIONARY.md: ${TX_FIELDS.length + SESSION_FIELDS.length + PAYEE_FIELDS.length + CARD_FIELDS.length + CRYPTO_FIELDS.length + EVENT_FIELDS.length + ACCOUNT_FIELDS.length + PATTERN_FIELDS.length + PARTY_FIELDS.length + CASE_LEG_FIELDS.length} fields, ${typologies.length} crime patterns, ${libraryKeys.length} library keys, ${Object.keys(LEG_ROLE).length} leg roles`);
