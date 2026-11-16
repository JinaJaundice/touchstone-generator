import { ACCOUNT_COLUMNS, CASE_LEG_COLUMNS, PARTY_COLUMNS, TX_COLUMNS, accountCell, caseLegCell, partyCell, txCell } from "./parquet";
import type { Dataset } from "./types";

/* the CSV files carry the same columns in the same order as the Parquet files (lib/gen/parquet.ts), so the two cannot drift apart */
/** One value as a CSV cell: empty for no value, quoted for text, plain for a number or a flag. */
export const csvValue = (v: unknown) => v === null || v === undefined ? "" : typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : String(v);
/** The transactions of a data set as the text of a CSV file, with a header row. */
export function txCsv(ds: Dataset) {
  const rows = ds.txs.map((t) => TX_COLUMNS.map((c) => csvValue(txCell(t, c.name, ds.day0))).join(","));
  return TX_COLUMNS.map((c) => c.name).join(",") + "\n" + rows.join("\n") + "\n";
}
/** The accounts of a data set as the text of a CSV file, with a header row. */
export function accountsCsv(ds: Dataset) {
  const rows = ds.accounts.map((a) => ACCOUNT_COLUMNS.map((c) => csvValue(accountCell(a, c.name))).join(","));
  return ACCOUNT_COLUMNS.map((c) => c.name).join(",") + "\n" + rows.join("\n") + "\n";
}
/** The planned payments of the planted library cases as the text of a CSV file, with a header row. */
export function caseLegsCsv(ds: Dataset) {
  const rows = ds.caseLegs.map((l) => CASE_LEG_COLUMNS.map((c) => csvValue(caseLegCell(l, c.name))).join(","));
  return CASE_LEG_COLUMNS.map((c) => c.name).join(",") + "\n" + rows.join("\n") + "\n";
}
/** The parties of the planted library cases as the text of a CSV file, with a header row. */
export function partiesCsv(ds: Dataset) {
  const rows = ds.parties.map((p) => PARTY_COLUMNS.map((c) => csvValue(partyCell(p, c.name))).join(","));
  return PARTY_COLUMNS.map((c) => c.name).join(",") + "\n" + rows.join("\n") + "\n";
}
