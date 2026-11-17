/* A generated transaction, rendered the way it would read in the bank's own
   messaging format: an ISO 20022 credit transfer for a bank payment, the card
   scheme's field list for a card payment, a teller or machine record for
   cash, and a Bitcoin transfer with its travel-rule exchange for crypto.
   Every value comes straight from the record: the date and the UK clock time
   from the data set's calendar, the merchant category, how the card was used
   and whether 3-D Secure ran, the currency a payment abroad pays in, the
   session the customer paid from and the payee's name check. The message
   identifiers are the record ids, and the account numbers are made from the
   account id. The point is to let a reader see, field by field, that the
   transactions are complete records with the structure of real payment records, and that they change
   from one make to the next. */

import type { Account, Dataset, Tx } from "./types";
import { patternShort } from "./types";
import { stampOf } from "./calendar";
import sources from "./sources.json";

export interface MessageLine { tag: string; value: string }
export interface Message {
  /** the format the lines follow */
  format: string;
  /** one line naming the message */
  title: string;
  lines: MessageLine[];
  /** what Touchstone knows and the bank would not, as one sentence without its full stop */
  truth: string;
  /** where the record came from */
  provenance: string;
}

const MCC_NAME = sources.mcc.names as Record<string, string>;
const gbp = (n: number) => n.toFixed(2);
const RAIL: Record<string, string> = { FPS: "Faster Payments", BACS: "Bacs", CHAPS: "CHAPS", CARD: "card", CASH: "cash", INTL: "SWIFT", CRYPTO: "Bitcoin", INTERNAL: "internal" };
const CLEARING: Record<string, string> = { FPS: "GBFPS", BACS: "GBBAC", CHAPS: "GBCHP" };
const METHOD: Record<string, string> = {
  fps: "a single immediate payment", "standing-order": "a standing order", "forward-dated": "a payment set up for a date", "direct-debit": "a Direct Debit collected by the biller",
  "bacs-credit": "a Bacs credit in a bulk run", chaps: "CHAPS, same day", swift: "SWIFT, through a correspondent bank",
};
const ENTRY: Record<string, string> = { "card-chip": "051 chip and PIN", "card-contactless": "071 contactless", "card-online": "812 card not present, online", "card-magstripe": "901 magnetic stripe" };
const THREE_DS: Record<string, string> = { authenticated: "authenticated", "exempt-low-value": "exempt, low value (SCA-RTS Art 16)", "exempt-recurring": "exempt, recurring", "not-attempted": "not attempted by the merchant", "not-applicable": "not applicable, card present" };
const COP: Record<string, string> = { match: "match", "close-match": "close match", "no-match": "no match", unavailable: "check unavailable" };
const TRAVEL: Record<string, string> = { complete: "complete", "not-required": "not required", "requested-received": "asked for and received", "requested-not-received": "asked for and not received" };
/** A stable account number shape from the account id: sort code and number, the same every time. */
const acct = (a: Account) => `${String(20 + (a.id % 80)).padStart(2, "0")}-${String((a.id * 7) % 100).padStart(2, "0")}-${String((a.id * 13) % 100).padStart(2, "0")} ${String(10_000_000 + a.id * 4_099).slice(-8)}`;
const bic = (bank: string) => `${bank.replace(/[^A-Z]/gi, "").toUpperCase().padEnd(4, "X").slice(0, 4)}GB2L`;
/** A masked card number from the account id, the same every time. */
const pan = (a: Account) => `5399 ${String(1000 + (a.id * 37) % 9000)}** **** ${String(1000 + (a.id * 53) % 9000)}`;
const yes = (b: boolean) => b ? "yes" : "no";

function party(ds: Dataset, i: number, t: Tx, side: "orig" | "dest"): { name: string; account: string; agent: string } {
  if (i >= 0) { const a = ds.accounts[i]; return { name: a.customerId, account: acct(a), agent: bic(a.bank) }; }
  if (i <= -1000 && t.wallet) return { name: `wallet ${t.wallet.slice(0, 10)}…`, account: t.wallet, agent: "on-chain" };
  const abroad = t.country !== "GB" ? `a bank in ${t.country}` : "a UK bank";
  if (side === "orig") return { name: t.type === "INCOME" ? `payer outside the bank (${t.cpRef ?? "unnamed"})` : "outside the bank", account: "not held here", agent: abroad };
  return { name: t.type === "SPEND" ? `merchant ${t.card?.merchant ?? t.cpRef ?? ""}`.trim() : `beneficiary outside the bank (${t.cpRef ?? "unnamed"})`, account: "not held here", agent: abroad };
}

/** The session and payee facts a fraud system reads, where the record has them. */
function sessionLines(t: Tx): [string, string][] {
  const out: [string, string][] = [];
  if (t.session) {
    const s = t.session;
    out.push(["Session / channel", s.channel], ["Session / device", `${s.deviceId}${s.newDevice ? ", first seen in the last seven days" : ""}`],
      ["Session / IP country", `${s.ipCountry}${s.vpn ? ", through a VPN or proxy" : ""}`], ["Session / remote access tool running", yes(s.remoteAccess)],
      ["Session / phone call in progress", yes(s.callActive)], ["Session / seconds from log-in to confirm", String(s.seconds)]);
  }
  if (t.payee) {
    const p = t.payee;
    out.push(["Payee / Confirmation of Payee", p.cop ? COP[p.cop] : "not asked (a payee already paid)"], ["Payee / account type", p.accountType],
      ["Payee / account age", p.accountAgeDays === null ? "not known to the bank" : `${p.accountAgeDays} days`], ["Payee / reason given", p.reason ?? "not asked"],
      ["Payee / a crypto exchange on the bank's list", yes(p.cryptoExchange)]);
  }
  if (t.recentCredentialChange) out.push(["Note", "password, phone, email, SIM or device changed in the last 48 hours"]);
  return out;
}

export function renderMessage(t: Tx, ds: Dataset): Message {
  const period = ds.config.period ?? 1;
  const id = `TS-${ds.config.seed}-${period}-${t.id}`;
  const when = stampOf(period, ds.config.days, t.day, t.minute);
  const dateOf = (day: number) => stampOf(period, ds.config.days, day, 0).slice(0, 10);
  const from = party(ds, t.orig, t, "orig"), to = party(ds, t.dest, t, "dest");
  const truth = t.patternId >= 0 ? `This payment was planted${t.role ? ` in the role of ${t.role.replace(/-/g, " ")}` : ""} as part of ${t.typology == null ? "a crime pattern" : patternShort(t.typology)} (pattern ${t.patternId})` : "This transaction is ordinary activity outside any planted pattern";
  const provenance = `Generated by Touchstone · seed number ${ds.config.seed} · period ${period} · generator ${ds.generator ?? "unstamped"} · record ${t.id} of ${ds.txs.length}`;
  const lines = (xs: [string, string][]) => xs.map(([tag, value]) => ({ tag, value }));

  if (t.type === "INITIAL") {
    return { format: "Opening balance", title: `Opening balance on ${to.name}`, truth, provenance, lines: lines([
      ["Account", to.account], ["Holder", to.name], ["Balance brought forward", `GBP ${gbp(t.amount)}`], ["As at", dateOf(t.day)],
    ]) };
  }
  if (t.rail === "CARD") {
    const c = t.card;
    return { format: "ISO 8583 card authorisation (the scheme's field numbers)", title: `Card payment of GBP ${gbp(t.amount)}${t.status === "declined" ? ", declined" : ""}`, truth, provenance, lines: lines([
      ["MTI", "0100 authorisation request"], ["DE 2 Primary account number", t.orig >= 0 ? pan(ds.accounts[t.orig]) : "none"], ["DE 3 Processing code", "000000 purchase"],
      ["DE 4 Amount, transaction", `${gbp(t.amount)} GBP`], ["DE 7 Transmission date and time", when],
      ["DE 18 Merchant category", c ? `${c.mcc} ${MCC_NAME[String(c.mcc)] ?? ""}`.trim() : "not recorded"],
      ["DE 22 Point of service entry", ENTRY[t.method] ?? t.method], ["DE 39 Response", t.status === "declined" ? `declined (${c?.declineReason?.replace(/-/g, " ") ?? "no reason"})` : "00 approved"],
      ["DE 43 Card acceptor", `${c?.merchant ?? "merchant"}, ${t.country}`], ["DE 49 Currency", "826 GBP"],
      ["3-D Secure", c ? THREE_DS[c.threeDS] : "not recorded"], ["Settles on", c ? dateOf(c.settledDay) : "not recorded"],
      ["Cardholder", from.name], ["Cardholder's bank", from.agent],
      ...(t.recentCredentialChange ? [["Note", "password, phone, email, SIM or device changed in the last 48 hours"] as [string, string]] : []),
    ]) };
  }
  if (t.rail === "CASH") {
    const deposit = t.type === "CASH_IN";
    return { format: "Teller or machine record", title: `${deposit ? "Cash paid in" : "Cash taken out"}, GBP ${gbp(t.amount)}`, truth, provenance, lines: lines([
      ["Transaction", deposit ? "cash deposit" : "cash withdrawal"], ["Account", deposit ? to.account : from.account], ["Holder", deposit ? to.name : from.name],
      ["Amount", `GBP ${gbp(t.amount)}`], ["Date and time", when],
      ["Channel", t.method === "atm" ? `cash machine${t.country !== "GB" ? ` in ${t.country}` : ""}` : t.method === "partner-counter" ? "a partner counter (the Post Office)" : "branch counter"],
      ["Cash line", `GBP ${gbp(ds.config.cashThreshold)} (MLR 2017 reg 14)`], ["Balance after", `GBP ${gbp(deposit ? t.balDestAfter : t.balOrigAfter)}`],
    ]) };
  }
  if (t.rail === "CRYPTO") {
    const out = t.type === "CRYPTO_OUT", k = t.crypto;
    return { format: "Bitcoin transfer with the travel-rule exchange (MLR 2017 Part 7A)", title: `${out ? "Bitcoin bought and sent to a wallet" : "Bitcoin received and sold"}, GBP ${gbp(t.amount)}`, truth, provenance, lines: lines([
      ["Network", "Bitcoin"], ["Direction", out ? "pounds converted and sent to a wallet" : "received from a wallet, sold and credited"],
      ["Wallet address", t.wallet ?? "none"], ["Counterparty", k ? k.counterparty.replace(/-/g, " ") : "not recorded"],
      ["Label in the wallet pool", k ? k.label : "not recorded"], ["Behaviour class in the wallet pool", k?.predicted ? `${k.predicted}, confidence ${(k.confidence ?? 0).toFixed(2)}` : "none"],
      ["Value", `GBP ${gbp(t.amount)} equivalent`], ["Timestamp", when],
      ["Travel-rule information", k ? TRAVEL[k.travelRule] : "not recorded"], ["Customer proved the wallet is theirs", k?.ownershipProven === null || k?.ownershipProven === undefined ? "not asked" : yes(k.ownershipProven)],
      ["Information line", `GBP ${gbp(ds.config.travelRuleThreshold)} (MLR 2017 reg 64C)`],
      ...sessionLines(t),
    ]) };
  }
  // a bank payment: Faster Payments, Bacs, CHAPS or across a border, as an ISO 20022 credit transfer
  const intl = t.rail === "INTL";
  return { format: `ISO 20022 pacs.008 credit transfer over ${RAIL[t.rail] ?? t.rail}`, title: `${t.type === "INCOME" ? "Credit received" : t.type === "SPEND" ? "Payment to a biller" : "Payment"} of GBP ${gbp(t.amount)}${intl && t.currency !== "GBP" ? `, paid in ${t.currency}` : ""}`, truth, provenance, lines: lines([
    ["GrpHdr / MsgId", id], ["GrpHdr / CreDtTm", when], ["GrpHdr / NbOfTxs", "1"],
    ["GrpHdr / SttlmInf / SttlmMtd", intl ? "INDA, settled at the correspondent bank" : "CLRG, through the clearing system"],
    ...(intl ? [] : [["GrpHdr / SttlmInf / ClrSys / Cd", CLEARING[t.rail] ?? t.rail] as [string, string]]),
    ["How it was made", METHOD[t.method] ?? t.method],
    ["CdtTrfTxInf / PmtId / EndToEndId", `E2E-${t.id}`], ["CdtTrfTxInf / IntrBkSttlmAmt", `GBP ${gbp(t.amount)}`], ["CdtTrfTxInf / IntrBkSttlmDt", dateOf(t.day)],
    ...(intl ? [["CdtTrfTxInf / InstdAmt / Ccy", `${t.currency}, the payee's currency`] as [string, string]] : []),
    ["CdtTrfTxInf / ChrgBr", intl ? "SHAR" : "SLEV"],
    ["Dbtr / Nm", from.name], ["DbtrAcct / Id", from.account], ["DbtrAgt / FinInstnId / BICFI", from.agent],
    ["Cdtr / Nm", to.name], ["CdtrAcct / Id", to.account], ["CdtrAgt / FinInstnId / BICFI", to.agent], ["CdtrAgt / PstlAdr / Ctry", t.country],
    ["RmtInf / Ustrd", t.newPayee ? "first payment to this beneficiary" : "payment"],
    ...sessionLines(t),
  ]) };
}

/** The message as plain text, one field a line, for copying. */
export function messageText(m: Message): string {
  const w = Math.max(...m.lines.map((l) => l.tag.length));
  return [`${m.title}`, `${m.format}`, "", ...m.lines.map((l) => `${l.tag.padEnd(w)}  ${l.value}`), "", `Touchstone knows what the bank would not. ${m.truth}.`, m.provenance].join("\n");
}
