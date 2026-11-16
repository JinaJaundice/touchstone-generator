/* The data dictionary: every field the generator writes and every value a
   label can take, with what it means. docs/DATA_DICTIONARY.md is written
   from this file by scripts/write-dictionary.ts, and scripts/qa-gen.ts checks
   every record of every data set in its matrix against it, so the document,
   the validator and the data cannot drift apart. */

import { FAMILY_LABEL, FAMILY_OWNER, TYPOLOGY_FAMILY, TYPOLOGY_LABEL, type Family, type Typology } from "./types";
import labelsFile from "./patterns/labels.json";

export type FieldType = "int" | "number" | "string" | "bool" | "enum" | "object" | "array";
export interface FieldSpec {
  name: string;
  type: FieldType;
  meaning: string;
  /** allowed values with their meaning, for an enum */
  values?: Record<string, string>;
  nullable?: boolean;
  /** truth: for marking and the files; no rule reads it */
  truth?: boolean;
  /** when the field is set (when it is null otherwise) */
  when?: string;
  /** a record may leave the field out; where it holds the field, the field is checked as any other */
  optional?: boolean;
}

export const LEG_ROLE: Record<string, string> = {
  placement: "money arriving in a laundering pattern, as cash paid in or as a credit from outside the bank",
  funding: "the customer's own money arriving before a payment of a sanctions or fraud pattern, which is no step of the crime",
  layering: "money moving between two accounts inside a laundering pattern",
  integration: "money leaving a laundering pattern for somewhere outside the bank",
  "victim-payment": "a push payment a scam victim made to the criminal's account",
  "account-drain": "a payment out of a taken-over account, made by the criminal",
  "card-test": "a small payment a criminal makes to check stolen card details work",
  "card-spend": "a payment or withdrawal on a stolen, lost or copied card",
  "mule-receipt": "money from a victim or a scheme arriving in a mule account",
  "mule-forward": "a mule passing money on: to another account, abroad or into crypto",
  "cash-out": "a mule or launderer taking money out in cash",
  "collector-forward": "a mule network's collector sending the pooled money on",
  "first-party-build": "a credit a first-party fraudster pays in to build a history",
  "first-party-take": "a first-party fraudster taking the balance and the overdraft",
  "tainted-receipt": "bitcoin from a wallet labelled illicit, sold into the account",
  "structured-purchase": "a crypto transfer kept just under the GBP 800 information line",
  "mixer-payment": "a crypto transfer to an address classed as a mixer",
  "offramp-forward": "crypto proceeds sent on by bank transfer",
  "sanctions-exposure": "a transfer to an address on the OFAC list",
};

export const ACCOUNT_ROLE: Record<string, string> = {
  launderer: "an account a laundering or crypto pattern runs through",
  victim: "a customer who lost money to a fraud; never suspicious",
  mule: "an account that received a fraud's proceeds and passed them on",
  collector: "the account a mule network pools its money into",
  "first-party": "a customer defrauding the bank with their own account",
  exposed: "a customer who paid an address on the sanctions list",
};

/** The key of each planted pattern of the library, with its label and the family of its end, from patterns/labels.json. */
export const LIBRARY_KEYS: { key: string; label: string; family: Family }[] =
  labelsFile.patterns.flatMap((p) => p.keys.map((k) => ({ key: k.key, label: k.label, family: k.family as Family })));

const TYPOLOGY_VALUES = Object.fromEntries([
  ...(Object.keys(TYPOLOGY_LABEL) as Typology[]).map((t) => [t, `${TYPOLOGY_LABEL[t]} (${FAMILY_LABEL[TYPOLOGY_FAMILY[t]].toLowerCase()})`]),
  ...LIBRARY_KEYS.map((k) => [k.key, `${k.label} (${FAMILY_LABEL[k.family].toLowerCase()})`]),
]);
const FAMILY_VALUES = Object.fromEntries((Object.keys(FAMILY_LABEL) as Family[]).map((f) => [f, `${FAMILY_LABEL[f]}, owned by ${FAMILY_OWNER[f]}`]));

export const TX_FIELDS: FieldSpec[] = [
  { name: "id", type: "int", meaning: "the record's number, in time order from 0" },
  { name: "day", type: "int", meaning: "the day, 0 to days - 1; day 0 is the data set's day0 date" },
  { name: "minute", type: "int", meaning: "the minute of the day in UK clock time, 0 to 1439" },
  { name: "type", type: "enum", meaning: "what the money did", values: {
    TRANSFER: "account to account, here or at another bank", INCOME: "a credit from outside the data set", SPEND: "a payment to a merchant or a biller",
    CASH_IN: "cash paid in", CASH_OUT: "cash taken out", CRYPTO_OUT: "bitcoin bought with pounds and sent to a wallet", CRYPTO_IN: "bitcoin received from a wallet and sold into the account", INITIAL: "an opening balance" } },
  { name: "rail", type: "enum", meaning: "the payment system", values: {
    FPS: "Faster Payments", BACS: "Bacs (Direct Debit and Bacs Direct Credit)", CHAPS: "CHAPS", CARD: "a card scheme", CASH: "cash", INTL: "SWIFT, abroad", CRYPTO: "the Bitcoin chain, through the bank's crypto service", INTERNAL: "an entry inside the bank" } },
  { name: "method", type: "enum", meaning: "how the payment was made on its rail", values: {
    fps: "a single immediate Faster Payment", "standing-order": "a repeating Faster Payment", "forward-dated": "a Faster Payment set up for a date",
    "direct-debit": "collected by a biller through Bacs, on a working day", "bacs-credit": "paid in bulk through Bacs, on a working day", chaps: "CHAPS, on a working day from 6am to 5.40pm",
    swift: "SWIFT, in the payee's currency", "card-chip": "card present, chip and PIN", "card-contactless": "card present, contactless, up to GBP 100",
    "card-online": "card not present", "card-magstripe": "card present, magnetic stripe", atm: "a cash machine, up to GBP 500 a day", counter: "a branch counter",
    "partner-counter": "a partner counter such as the Post Office", crypto: "on-chain", internal: "an entry inside the bank" } },
  { name: "status", type: "enum", meaning: "whether money moved", values: { settled: "the payment went through", declined: "a card authorisation was refused; no money moved" } },
  { name: "amount", type: "number", meaning: "the value in pounds, two decimal places, above zero" },
  { name: "currency", type: "string", meaning: "the currency the payee receives: GBP, or the payee's currency on a SWIFT payment (ISO 4217)" },
  { name: "orig", type: "int", meaning: "the paying account's id, or -2 for money from outside the data set" },
  { name: "dest", type: "int", meaning: "the receiving account's id, -1 for money leaving the data set, or a wallet slot (-1000 or below), one slot per address" },
  { name: "cpRef", type: "string", nullable: true, meaning: "a stable id for the counterparty outside the data set: a merchant, a biller, an employer, a payee at another bank, or a wallet address", when: "the counterparty is outside the data set and is not cash" },
  { name: "wallet", type: "string", nullable: true, meaning: "the counterparty wallet's full Bitcoin address", when: "rail is CRYPTO" },
  { name: "walletClass", type: "enum", nullable: true, meaning: "the class the rail uses for the wallet: the wallet pool's behaviour class mapped onto the rail's classes, or sanctioned for an OFAC-listed address", when: "rail is CRYPTO",
    values: { exchange: "classed as an exchange", personal: "classed as a self-hosted or peer-to-peer wallet", mixer: "classed as a tumbler", darknet: "classed as a darknet market, extortion or cyber service", gambling: "classed as gambling", sanctioned: "on the OFAC list", unknown: "any other class" } },
  { name: "bankOrig", type: "string", meaning: "the payer's bank: Bank A to F for an account here, external, or wallet" },
  { name: "bankDest", type: "string", meaning: "the payee's bank, the same way" },
  { name: "country", type: "string", meaning: "the counterparty's jurisdiction (ISO 3166 alpha-2); the merchant's country for a card payment; GB for a domestic leg" },
  { name: "newPayee", type: "bool", meaning: "the first payment from this payer to this payee" },
  { name: "newPayer", type: "bool", meaning: "the first credit into this account from this payer: a customer here, a wallet, or a payer at another bank. An established customer's regular payers (pay, pension, invoices, their own wallet) count as seen before the period with the chance their own rate gives. Always false for cash paid in, which has no payer" },
  { name: "recentCredentialChange", type: "bool", meaning: "the payer changed a password, phone number or email, added a device, or had a SIM swap in the 48 hours before" },
  { name: "destSegment", type: "enum", nullable: true, meaning: "the receiving account's segment, where it is an account here", values: { retail: "a personal customer", sme: "a small firm", corporate: "a corporate", private: "a private client" } },
  { name: "balOrigAfter", type: "number", meaning: "the payer's balance after the payment (0 for money from outside)" },
  { name: "balDestAfter", type: "number", meaning: "the payee's balance after the payment (0 for money leaving)" },
  { name: "session", type: "object", nullable: true, meaning: "the session the customer paid from", when: "type is CRYPTO_OUT, or type is TRANSFER and method is fps, chaps or swift, or type is SPEND and method is fps" },
  { name: "payee", type: "object", nullable: true, meaning: "the payee of a push payment", when: "type is TRANSFER, or type is SPEND and method is fps" },
  { name: "card", type: "object", nullable: true, meaning: "the card payment's facts", when: "rail is CARD" },
  { name: "crypto", type: "object", nullable: true, meaning: "the crypto leg's facts", when: "rail is CRYPTO" },
  { name: "patternId", type: "int", truth: true, meaning: "the planted pattern this leg belongs to, or -1" },
  { name: "typology", type: "enum", truth: true, nullable: true, meaning: "the crime pattern", values: TYPOLOGY_VALUES },
  { name: "family", type: "enum", truth: true, nullable: true, meaning: "which control owns the pattern", values: FAMILY_VALUES },
  { name: "role", type: "enum", truth: true, nullable: true, meaning: "what this leg is inside its pattern", values: LEG_ROLE },
  { name: "caseId", type: "int", truth: true, meaning: "the case the pattern belongs to (a scam and the mule accounts it paid are one case), or -1" },
];

export const SESSION_FIELDS: FieldSpec[] = [
  { name: "channel", type: "enum", meaning: "where the customer paid from", values: { mobile: "the mobile app", online: "online banking", telephone: "telephone banking", branch: "a branch" } },
  { name: "deviceId", type: "string", meaning: "the device the session ran on" },
  { name: "newDevice", type: "bool", meaning: "the device was first seen on this customer within the last seven days" },
  { name: "ipCountry", type: "string", meaning: "the country the session's IP address resolves to" },
  { name: "vpn", type: "bool", meaning: "the session came through a VPN or a proxy" },
  { name: "remoteAccess", type: "bool", meaning: "a remote access tool was running on the device" },
  { name: "callActive", type: "bool", meaning: "the customer was on a phone call while paying" },
  { name: "seconds", type: "int", meaning: "seconds from log-in to confirming the payment" },
];
export const PAYEE_FIELDS: FieldSpec[] = [
  { name: "cop", type: "enum", nullable: true, meaning: "the Confirmation of Payee result when the payee was set up; null for a payee already paid, a payment abroad or a Direct Debit",
    values: { match: "the name matched", "close-match": "a close match (the real name was shown), or the account type did not match", "no-match": "the name did not match", unavailable: "the check could not run" } },
  { name: "accountType", type: "enum", meaning: "the kind of account the payment went to", values: { personal: "a personal account", business: "a business account" } },
  { name: "accountAgeDays", type: "int", nullable: true, meaning: "days since the receiving account opened, where the bank can know it" },
  { name: "reason", type: "enum", nullable: true, meaning: "the payment reason the customer picked for a new payee",
    values: { "friends-family": "paying friends or family", "goods-services": "paying for goods or services", bill: "a bill", "own-account": "moving money to my own account", investment: "an investment", invoice: "a supplier's invoice", "tax-or-fine": "a tax bill or a fine", other: "something else" } },
  { name: "cryptoExchange", type: "bool", meaning: "the payee's account belongs to a UK crypto exchange the bank recognises (register S52)" },
];
export const CARD_FIELDS: FieldSpec[] = [
  { name: "mcc", type: "int", meaning: "the merchant category code (ISO 18245)" },
  { name: "merchant", type: "string", meaning: "the merchant's id, the same across payments to it" },
  { name: "threeDS", type: "enum", meaning: "3-D Secure on a card-not-present payment",
    values: { authenticated: "the cardholder authenticated", "exempt-low-value": "exempt as GBP 25 or less", "exempt-recurring": "a recurring or merchant-initiated payment", "not-attempted": "the merchant did not ask", "not-applicable": "the card was present" } },
  { name: "declineReason", type: "enum", nullable: true, meaning: "why an authorisation was refused", values: { "insufficient-funds": "not enough money", "invalid-details": "the card details were wrong", "card-blocked": "the card was stopped" } },
  { name: "settledDay", type: "int", meaning: "the working day the payment settles; balances move at authorisation" },
];
export const CRYPTO_FIELDS: FieldSpec[] = [
  { name: "chain", type: "enum", meaning: "the chain the wallet is on", values: { bitcoin: "Bitcoin mainnet" } },
  { name: "label", type: "enum", meaning: "the counterparty wallet's label", values: { illicit: "the wallet pool labels it illicit", licit: "the wallet pool labels it licit", unknown: "the wallet pool gives no label, or the wallet is a customer's own", listed: "the address is on OFAC's list" } },
  { name: "predicted", type: "string", nullable: true, meaning: "the behaviour class that the wallet pool gives the wallet. The pool file states how its classes were made" },
  { name: "confidence", type: "number", nullable: true, meaning: "the confidence that the wallet pool gives that class, 0 to 1" },
  { name: "counterparty", type: "enum", meaning: "what the counterparty is", values: { exchange: "another firm's wallet", "self-hosted": "a self-hosted wallet", service: "a service with no firm behind it (a mixer, a market, a listed address)" } },
  { name: "travelRule", type: "enum", meaning: "the travel-rule exchange (MLR Part 7A)",
    values: { complete: "the information went with the transfer", "not-required": "below the GBP 800 line, or the customer's own wallet", "requested-received": "the bank asked its customer for it and got it", "requested-not-received": "the bank asked and it never came" } },
  { name: "ownershipProven", type: "bool", nullable: true, meaning: "for a self-hosted wallet, whether the customer proved they control it" },
];

export const EVENT_FIELDS: FieldSpec[] = [
  { name: "account", type: "int", meaning: "the account" },
  { name: "day", type: "int", meaning: "the day" },
  { name: "minute", type: "int", meaning: "the minute" },
  { name: "kind", type: "enum", meaning: "what happened", values: {
    "device-added": "a new device was registered on the account", "password-reset": "the password was reset", "phone-changed": "the phone number on the account changed",
    "email-changed": "the email address changed", "sim-swap": "the mobile network reported the number moved to a new SIM", "notifications-off": "payment alerts were switched off",
    "login-new-location": "a log-in from a place the customer had not logged in from" } },
  { name: "deviceId", type: "string", nullable: true, meaning: "the device involved" },
  { name: "ipCountry", type: "string", meaning: "the country the event came from" },
  { name: "patternId", type: "int", truth: true, meaning: "the planted pattern the event belongs to, or -1" },
  { name: "typology", type: "enum", truth: true, nullable: true, meaning: "the crime pattern", values: TYPOLOGY_VALUES },
];

export const ACCOUNT_FIELDS: FieldSpec[] = [
  { name: "id", type: "int", meaning: "the account's number" },
  { name: "customerId", type: "string", meaning: "the customer reference, CUST-000001 and on" },
  { name: "bank", type: "string", meaning: "the bank the account is at, Bank A to F" },
  { name: "segment", type: "enum", meaning: "who holds the account", values: { retail: "a personal customer", sme: "a small firm", corporate: "a corporate", private: "a private client" } },
  { name: "tier", type: "int", meaning: "the identity-check tier, 1 (lightest) to 3 (full due diligence)" },
  { name: "age", type: "int", meaning: "age in years for a person, years trading for a firm" },
  { name: "income", type: "number", meaning: "monthly take-home pay, or monthly turnover for a firm" },
  { name: "declaredMonthlyOut", type: "number", meaning: "what the customer said at onboarding they would send out a month" },
  { name: "country", type: "string", meaning: "the customer's home country" },
  { name: "openedDay", type: "int", meaning: "the day the account opened; negative means before the period" },
  { name: "quietDaysBefore", type: "int", meaning: "days before day 0 since the account last moved money; above 0 means dormant" },
  { name: "initialBalance", type: "number", meaning: "the balance at the start" },
  { name: "overdraftLimit", type: "number", meaning: "the arranged overdraft in pounds; 0 for none" },
  { name: "deviceId", type: "string", meaning: "the customer's device at the start; mule rings share one" },
  { name: "addressId", type: "string", meaning: "a household id; people at one address share it" },
  { name: "wallet", type: "string", nullable: true, meaning: "the customer's own self-hosted Bitcoin wallet, a made segwit address" },
  { name: "pep", type: "bool", meaning: "a politically exposed person or a close associate" },
  { name: "cashBusiness", type: "bool", meaning: "a firm that takes most of its money in cash" },
  { name: "channel", type: "enum", meaning: "how the customer was taken on", values: { branch: "met in a branch", digital: "online, without meeting them" } },
  { name: "hasCard", type: "bool", meaning: "holds a card with the bank" },
  { name: "isSar", type: "bool", truth: true, meaning: "the account launders money (a launderer, a mule, a collector or a first-party fraudster)" },
  { name: "isFraud", type: "bool", truth: true, meaning: "the account is in a fraud or a mule pattern (a victim, a mule or a first-party fraudster)" },
  { name: "fraudRole", type: "enum", truth: true, nullable: true, meaning: "the account's role in fraud", values: { victim: "a victim", mule: "a mule", "first-party": "a first-party fraudster" } },
  { name: "patterns", type: "array", truth: true, meaning: "the planted patterns the account is in" },
  { name: "daysInBank", type: "int", meaning: "days the account has been open at the end of the period (the AMLGentex field)" },
  { name: "phoneChanges", type: "int", meaning: "phone changes on record at the end of the period (the AMLGentex field)" },
];

export const PATTERN_FIELDS: FieldSpec[] = [
  { name: "id", type: "int", truth: true, meaning: "the pattern's number" },
  { name: "typology", type: "enum", truth: true, meaning: "the crime pattern", values: TYPOLOGY_VALUES },
  { name: "family", type: "enum", truth: true, meaning: "which control owns it", values: FAMILY_VALUES },
  { name: "caseId", type: "int", truth: true, meaning: "the case it is part of" },
  { name: "accounts", type: "array", truth: true, meaning: "the accounts in it" },
  { name: "roles", type: "object", truth: true, meaning: "each account's role in it", values: ACCOUNT_ROLE },
  { name: "main", type: "int", truth: true, meaning: "the account the pattern centres on" },
  { name: "startDay", type: "int", truth: true, meaning: "the first day" },
  { name: "endDay", type: "int", truth: true, meaning: "the last day" },
  { name: "txCount", type: "int", truth: true, meaning: "its transactions" },
  { name: "total", type: "number", truth: true, meaning: "their value" },
  { name: "story", type: "string", truth: true, meaning: "the phrase a reviewer would use" },
  { name: "sources", type: "array", truth: true, meaning: "the entries of the register of sources that the shape comes from" },
  { name: "library", type: "object", truth: true, optional: true, meaning: "the crime pattern of the library that this planted pattern is, as its id in pattern and its end in end, source or cash-out", when: "the pattern comes from the pattern library" },
];

export const PARTY_FIELDS: FieldSpec[] = [
  { name: "caseId", type: "int", truth: true, meaning: "the case the party is in" },
  { name: "key", type: "string", truth: true, meaning: "the party's key in the case, made from the part, the party and the number of the member" },
  { name: "group", type: "string", truth: true, meaning: "the key without the number of the member, which the flow view uses to draw a run of wallets as one column" },
  { name: "pattern", type: "string", truth: true, meaning: "the id of the crime pattern of the library" },
  { name: "part", type: "string", truth: true, meaning: "the id of the part that the party belongs to" },
  { name: "end", type: "enum", truth: true, meaning: "the end of the pattern that the party is on", values: { source: "where the money comes from", hiding: "where the trail is hidden", "cash-out": "where the money is taken out" } },
  { name: "kind", type: "string", truth: true, meaning: "the kind of party, or outside-account for a customer on an end that the bank does not see" },
  { name: "label", type: "string", truth: true, meaning: "the party's label from the file of its part" },
  { name: "account", type: "int", truth: true, nullable: true, meaning: "the account that fills the party", when: "the bank sees the end of the party and the planted pattern of that end remains" },
  { name: "chain", type: "string", truth: true, nullable: true, meaning: "the chain of a party on a chain", when: "the party is on a chain" },
  { name: "address", type: "string", truth: true, nullable: true, meaning: "the address that the generator made for a party on a chain", when: "the party is on a chain" },
];

export const CASE_LEG_FIELDS: FieldSpec[] = [
  { name: "caseId", type: "int", truth: true, meaning: "the case the payment is in" },
  { name: "seq", type: "int", truth: true, meaning: "the number of the payment in the case, in the order of its time" },
  { name: "pattern", type: "string", truth: true, meaning: "the id of the crime pattern of the library" },
  { name: "part", type: "string", truth: true, meaning: "the id of the part that the payment belongs to" },
  { name: "step", type: "string", truth: true, meaning: "the id of the step of the part that the payment belongs to" },
  { name: "day", type: "int", truth: true, meaning: "the day on which the payment happens" },
  { name: "minute", type: "int", truth: true, meaning: "the minute of the day on which the payment happens" },
  { name: "from", type: "string", truth: true, meaning: "the key of the party that pays" },
  { name: "to", type: "string", truth: true, meaning: "the key of the party that receives" },
  { name: "via", type: "string", truth: true, meaning: "how the money moves: a rail of the bank, chain for a payment on a chain, or off-record for a payment that no one records" },
  { name: "asset", type: "string", truth: true, meaning: "the asset that moves" },
  { name: "chain", type: "string", truth: true, nullable: true, meaning: "the chain of a payment on a chain", when: "the payment is on a chain" },
  { name: "planned", type: "number", truth: true, meaning: "the amount of the payment in pounds in the first price, before any transaction was written" },
  { name: "amount", type: "number", truth: true, meaning: "the amount that moved in pounds, or 0 where the payment did not happen" },
  { name: "seenBy", type: "enum", truth: true, meaning: "who records the payment", values: { bank: "the bank's own records", chain: "the public chain", none: "no one" } },
  { name: "tx", type: "int", truth: true, nullable: true, meaning: "the id of the transaction", when: "the bank wrote the payment" },
  { name: "say", type: "string", truth: true, meaning: "the sentence of the step that the payment belongs to" },
];

/** Check one object against a list of specs. Returns the first problem, or null. */
export function checkRecord(rec: Record<string, unknown>, specs: FieldSpec[], where: string): string | null {
  const names = new Set(specs.map((f) => f.name));
  for (const k of Object.keys(rec)) if (!names.has(k)) return `${where}: field "${k}" is not in the data dictionary`;
  for (const f of specs) {
    const v = rec[f.name];
    if (v === undefined) { if (f.optional) continue; return `${where}: field "${f.name}" is missing`; }
    if (v === null) { if (!f.nullable) return `${where}: field "${f.name}" is null and may not be`; continue; }
    switch (f.type) {
      case "int": if (typeof v !== "number" || !Number.isInteger(v)) return `${where}: "${f.name}" = ${String(v)} should be a whole number`; break;
      case "number": if (typeof v !== "number" || !Number.isFinite(v)) return `${where}: "${f.name}" = ${String(v)} should be a number`; break;
      case "string": if (typeof v !== "string" || v.length === 0) return `${where}: "${f.name}" should be text`; break;
      case "bool": if (typeof v !== "boolean") return `${where}: "${f.name}" is not true or false`; break;
      case "enum": if (!f.values || !(String(v) in f.values)) return `${where}: "${f.name}" = "${String(v)}" is outside the values the dictionary defines`; break;
      case "array": if (!Array.isArray(v)) return `${where}: "${f.name}" should be a list`; break;
      case "object": if (typeof v !== "object") return `${where}: "${f.name}" should be a record`; break;
    }
  }
  return null;
}
