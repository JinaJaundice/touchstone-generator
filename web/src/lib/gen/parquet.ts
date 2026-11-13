/* Parquet export of the data set: the transactions and the accounts, with the
   same columns and the same meaning as the CSV files on the Make data page.
   Parquet is the column file format a bank's data team loads into a data
   warehouse, so a data set made here can be run through a real monitoring
   system without a conversion step. The writer is loaded only when a file is
   asked for, so the page itself carries none of its weight. */

import type { Account, Dataset, Tx } from "./types";

export type ParquetType = "INT32" | "DOUBLE" | "STRING" | "BOOLEAN";
export interface ParquetColumn { name: string; type: ParquetType; nullable: boolean }

/** the transaction columns, in the order of the CSV file */
export const TX_COLUMNS: ParquetColumn[] = [
  { name: "id", type: "INT32", nullable: false },
  { name: "day", type: "INT32", nullable: false },
  { name: "date", type: "STRING", nullable: false },
  { name: "minute", type: "INT32", nullable: false },
  { name: "type", type: "STRING", nullable: false },
  { name: "rail", type: "STRING", nullable: false },
  { name: "method", type: "STRING", nullable: false },
  { name: "status", type: "STRING", nullable: false },
  { name: "amount", type: "DOUBLE", nullable: false },
  { name: "currency", type: "STRING", nullable: false },
  { name: "orig", type: "INT32", nullable: false },
  { name: "dest", type: "INT32", nullable: false },
  { name: "cpRef", type: "STRING", nullable: true },
  { name: "wallet", type: "STRING", nullable: true },
  { name: "walletClass", type: "STRING", nullable: true },
  { name: "bankOrig", type: "STRING", nullable: false },
  { name: "bankDest", type: "STRING", nullable: false },
  { name: "country", type: "STRING", nullable: false },
  { name: "newPayee", type: "BOOLEAN", nullable: false },
  { name: "newPayer", type: "BOOLEAN", nullable: false },
  { name: "recentCredentialChange", type: "BOOLEAN", nullable: false },
  { name: "destSegment", type: "STRING", nullable: true },
  { name: "balOrigAfter", type: "DOUBLE", nullable: false },
  { name: "balDestAfter", type: "DOUBLE", nullable: false },
  { name: "session_channel", type: "STRING", nullable: true },
  { name: "session_deviceId", type: "STRING", nullable: true },
  { name: "session_newDevice", type: "BOOLEAN", nullable: true },
  { name: "session_ipCountry", type: "STRING", nullable: true },
  { name: "session_vpn", type: "BOOLEAN", nullable: true },
  { name: "session_remoteAccess", type: "BOOLEAN", nullable: true },
  { name: "session_callActive", type: "BOOLEAN", nullable: true },
  { name: "session_seconds", type: "INT32", nullable: true },
  { name: "payee_cop", type: "STRING", nullable: true },
  { name: "payee_accountType", type: "STRING", nullable: true },
  { name: "payee_accountAgeDays", type: "INT32", nullable: true },
  { name: "payee_reason", type: "STRING", nullable: true },
  { name: "payee_cryptoExchange", type: "BOOLEAN", nullable: true },
  { name: "card_mcc", type: "INT32", nullable: true },
  { name: "card_merchant", type: "STRING", nullable: true },
  { name: "card_threeDS", type: "STRING", nullable: true },
  { name: "card_declineReason", type: "STRING", nullable: true },
  { name: "card_settledDay", type: "INT32", nullable: true },
  { name: "crypto_chain", type: "STRING", nullable: true },
  { name: "crypto_label", type: "STRING", nullable: true },
  { name: "crypto_predicted", type: "STRING", nullable: true },
  { name: "crypto_confidence", type: "DOUBLE", nullable: true },
  { name: "crypto_counterparty", type: "STRING", nullable: true },
  { name: "crypto_travelRule", type: "STRING", nullable: true },
  { name: "crypto_ownershipProven", type: "BOOLEAN", nullable: true },
  { name: "patternId", type: "INT32", nullable: false },
  { name: "typology", type: "STRING", nullable: true },
  { name: "family", type: "STRING", nullable: true },
  { name: "role", type: "STRING", nullable: true },
  { name: "caseId", type: "INT32", nullable: false },
];

/** the account columns, in the order of the CSV file; `patterns` is the pattern ids joined with | as in the CSV */
export const ACCOUNT_COLUMNS: ParquetColumn[] = [
  { name: "id", type: "INT32", nullable: false },
  { name: "customerId", type: "STRING", nullable: false },
  { name: "bank", type: "STRING", nullable: false },
  { name: "segment", type: "STRING", nullable: false },
  { name: "tier", type: "INT32", nullable: false },
  { name: "age", type: "INT32", nullable: false },
  { name: "income", type: "DOUBLE", nullable: false },
  { name: "declaredMonthlyOut", type: "DOUBLE", nullable: false },
  { name: "country", type: "STRING", nullable: false },
  { name: "openedDay", type: "INT32", nullable: false },
  { name: "quietDaysBefore", type: "INT32", nullable: false },
  { name: "initialBalance", type: "DOUBLE", nullable: false },
  { name: "overdraftLimit", type: "DOUBLE", nullable: false },
  { name: "deviceId", type: "STRING", nullable: false },
  { name: "addressId", type: "STRING", nullable: false },
  { name: "wallet", type: "STRING", nullable: true },
  { name: "pep", type: "BOOLEAN", nullable: false },
  { name: "cashBusiness", type: "BOOLEAN", nullable: false },
  { name: "channel", type: "STRING", nullable: false },
  { name: "hasCard", type: "BOOLEAN", nullable: false },
  { name: "isSar", type: "BOOLEAN", nullable: false },
  { name: "isFraud", type: "BOOLEAN", nullable: false },
  { name: "fraudRole", type: "STRING", nullable: true },
  { name: "daysInBank", type: "INT32", nullable: false },
  { name: "phoneChanges", type: "INT32", nullable: false },
  { name: "patterns", type: "STRING", nullable: false },
];

type Cell = number | string | boolean | null;

/** one account row as the CSV file writes it */
export function accountCell(a: Account, name: string): Cell {
  const v = (a as unknown as Record<string, unknown>)[name];
  if (Array.isArray(v)) return v.join("|");
  return (v ?? null) as Cell;
}

/** one transaction row as the CSV file writes it: a fact inside a record (the session, the payee, the card, the crypto leg) is a column named record_field; the date comes from the data set's calendar */
export function txCell(t: Tx, name: string, day0?: string): Cell {
  if (name === "date") return day0 ? new Date(Date.parse(day0 + "T00:00:00Z") + t.day * 86_400_000).toISOString().slice(0, 10) : null;
  const k = name.indexOf("_");
  if (k > 0) {
    const inner = (t as unknown as Record<string, Record<string, unknown> | null>)[name.slice(0, k)];
    return (inner?.[name.slice(k + 1)] ?? null) as Cell;
  }
  return ((t as unknown as Record<string, unknown>)[name] ?? null) as Cell;
}

function columns<T>(rows: T[], cols: ParquetColumn[], cell: (row: T, name: string) => Cell) {
  return cols.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, data: rows.map((r) => cell(r, c.name)) }));
}

async function write(cols: { name: string; type: ParquetType; nullable: boolean; data: Cell[] }[], ds: Dataset, table: string): Promise<ArrayBuffer> {
  const { parquetWriteBuffer } = await import("hyparquet-writer");
  return parquetWriteBuffer({
    columnData: cols,
    kvMetadata: [
      { key: "touchstone.table", value: table },
      { key: "touchstone.seed", value: String(ds.config.seed) },
      { key: "touchstone.bank", value: ds.config.name },
      { key: "touchstone.days", value: String(ds.config.days) },
      { key: "touchstone.note", value: "Generated data. No customer data was used. A row with a pattern id is planted crime." },
    ],
  });
}

/** the transactions as a Parquet file */
export const txParquet = (ds: Dataset) => write(columns(ds.txs, TX_COLUMNS, (t, n) => txCell(t, n, ds.day0)), ds, "transactions");
/** the accounts as a Parquet file */
export const accountsParquet = (ds: Dataset) => write(columns(ds.accounts, ACCOUNT_COLUMNS, accountCell), ds, "accounts");
