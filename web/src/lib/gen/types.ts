/* The data model the generator writes and every plug-in reads.

   The transaction record is a superset of the AMLGentex tx_log (step,
   amount, nameOrig, nameDest, banks, days in bank, phone changes, balances,
   isSAR, alertID, modelType), so anything trained or tuned on that
   benchmark reads this file unchanged. On top of it sit the facts a UK
   bank's monitoring and fraud systems read (the register of sources):
   the rail and how the payment was made on it, the calendar, the session the
   customer paid from, the payee and its name check, the card and its merchant,
   the crypto counterparty and the travel-rule exchange. The truth (the pattern,
   its family, the leg's role) travels on the record for marking and for the
   files, and no rule may read it: the design gate fails the build when rule
   code names a truth field. Every field and every label value is defined in
   docs/DATA_DICTIONARY.md, and scripts/qa-gen.ts checks each data set
   against that dictionary. */

export type Rail = "FPS" | "BACS" | "CHAPS" | "CARD" | "CASH" | "INTL" | "CRYPTO" | "INTERNAL";

export type TxType =
  | "TRANSFER"   // account to account
  | "INCOME"     // from outside the data set (salary, benefits, sales, a credit from another bank)
  | "SPEND"      // to a merchant or a biller
  | "CASH_IN"    // cash paid in at a counter
  | "CASH_OUT"   // cash taken out at a machine or a counter
  | "CRYPTO_OUT" // bitcoin bought with the customer's pounds and sent to a wallet
  | "CRYPTO_IN"  // bitcoin received from a wallet and sold into the account
  | "INITIAL";   // the opening balance

/** How the payment was made on its rail. */
export type Method =
  | "fps"             // a single immediate Faster Payment
  | "standing-order"  // a Faster Payment the customer set up to repeat
  | "forward-dated"   // a Faster Payment set up in advance for a date
  | "direct-debit"    // collected by a biller through Bacs
  | "bacs-credit"     // paid in bulk through Bacs (wages, pensions, benefits, supplier runs)
  | "chaps"           // same-day high value, working days, 6am to 5.40pm
  | "swift"           // international, through a correspondent bank
  | "card-chip"       // card present, chip and PIN
  | "card-contactless"// card present, contactless (up to GBP 100)
  | "card-online"     // card not present
  | "card-magstripe"  // card present, magnetic stripe (abroad, where chip is not read)
  | "atm"             // cash machine
  | "counter"         // branch counter
  | "partner-counter" // a partner counter such as the Post Office
  | "crypto"          // on-chain, through the bank's crypto service
  | "internal"        // book entry (opening balance)
  ;

/** Who holds the account: a personal customer, a small firm, a corporate, or a private client (a wealthy individual). */
export type Segment = "retail" | "sme" | "corporate" | "private";
/** How the customer was taken on: in a branch, or online without meeting them. */
export type Channel = "branch" | "digital";
export type Tier = 1 | 2 | 3;

/* Every planted shape, grouped by the dial that plants it. The family (below)
   says which control owns it; the dial group is only how the builder plants. */
export type AmlTypology =
  | "fan_in" | "fan_out" | "cycle" | "bipartite" | "stack" | "random"
  | "scatter_gather" | "gather_scatter"
  | "structuring" | "smurfing" | "deposit_send" | "behaviour_change" | "single_large"
  | "passthrough" | "cash_out" | "over_invoicing" | "dormant_reactivation";
export type FraudTypology =
  | "scam_purchase" | "scam_investment" | "scam_romance" | "scam_advance_fee"
  | "scam_invoice" | "scam_ceo" | "scam_impersonation_bank" | "scam_impersonation_other"
  | "ato_credentials" | "ato_sim_swap" | "ato_remote_access"
  | "card_remote" | "card_lost_stolen" | "card_counterfeit"
  | "bust_out" | "mule_herd";
export type CryptoTypology = "offramp_layering" | "travel_rule_structuring" | "mixer_exposure" | "sanctioned_counterparty";
/** The receiving side of a fraud case: the mule accounts a scam or a takeover pays. Planted with its case, never on its own. */
export type DerivedTypology = "mule_account";
export type Typology = AmlTypology | FraudTypology | CryptoTypology | DerivedTypology;

/** Which control owns a planted pattern: transaction monitoring (money laundering), fraud, both (mules), crypto monitoring, or sanctions screening. */
export type Family = "aml" | "mule" | "fraud" | "crypto" | "sanctions";

/** What one leg of a planted pattern is. The truth for marking; no rule reads it. */
export type LegRole =
  | "placement" | "layering" | "integration"
  | "victim-payment" | "account-drain" | "card-test" | "card-spend"
  | "mule-receipt" | "mule-forward" | "cash-out" | "collector-forward"
  | "first-party-build" | "first-party-take"
  | "tainted-receipt" | "structured-purchase" | "mixer-payment" | "offramp-forward"
  | "sanctions-exposure" | "funding";

/** A customer's role in a planted pattern. */
export type AccountRole = "launderer" | "victim" | "mule" | "collector" | "first-party" | "exposed";

export type NormalModel = "single" | "fan_in" | "fan_out" | "forward" | "mutual" | "periodical";

/** The wallet classes the crypto rail uses. "sanctioned" is kept for an address on the OFAC list and nothing else. */
export type WalletClass = "exchange" | "personal" | "mixer" | "darknet" | "gambling" | "sanctioned" | "unknown";

/** The session a customer paid from, for a payment they started themselves (online, mobile, telephone or branch). */
export interface SessionFacts {
  channel: "mobile" | "online" | "telephone" | "branch";
  /** the device the session ran on */
  deviceId: string;
  /** the device was first seen on this customer within the last seven days */
  newDevice: boolean;
  /** the country the session's IP address resolves to */
  ipCountry: string;
  /** the session came through a VPN or a proxy */
  vpn: boolean;
  /** a remote access tool was running on the device (screen sharing such as AnyDesk or TeamViewer) */
  remoteAccess: boolean;
  /** the customer was on a phone call while paying (read by the bank's app from the device) */
  callActive: boolean;
  /** seconds from log-in to confirming the payment */
  seconds: number;
}

/** The payee of a push payment. */
export interface PayeeFacts {
  /** the Confirmation of Payee result when the payee was set up; null for a payee the customer had already paid */
  cop: "match" | "close-match" | "no-match" | "unavailable" | null;
  /** the kind of account the payment went to */
  accountType: "personal" | "business";
  /** days since the receiving account was opened, where the bank can know it (an account at this bank, or a shared industry signal); null otherwise */
  accountAgeDays: number | null;
  /** the payment reason the customer picked; null where none was asked (a payee already paid, a standing order) */
  reason: "friends-family" | "goods-services" | "bill" | "own-account" | "investment" | "invoice" | "tax-or-fine" | "other" | null;
  /** the payee's account belongs to a UK crypto exchange the bank recognises from its sort code and account number (banks keep such a list to apply their limits, register S52) */
  cryptoExchange: boolean;
}

/** A card payment. */
export interface CardFacts {
  /** the merchant category code (ISO 18245) */
  mcc: number;
  /** the merchant's id, stable across payments to the same merchant */
  merchant: string;
  /** 3-D Secure on a card-not-present payment; not-applicable when the card was present */
  threeDS: "authenticated" | "exempt-low-value" | "exempt-recurring" | "not-attempted" | "not-applicable";
  /** why an authorisation was declined; null when approved */
  declineReason: "insufficient-funds" | "invalid-details" | "card-blocked" | null;
  /** the day the payment settles (a working day after authorisation); balances move at authorisation */
  settledDay: number;
}

/** A crypto leg, on the chain its wallet is on. */
export interface CryptoFacts {
  chain: "bitcoin";
  /** the wallet pool's label for the counterparty wallet, or "listed" for an address on the OFAC list */
  label: "illicit" | "licit" | "unknown" | "listed";
  /** the behaviour class that the wallet pool gives the wallet, with its confidence; null for a listed address */
  predicted: string | null;
  confidence: number | null;
  /** what the counterparty is: another firm's wallet, a self-hosted wallet, or a service with no firm behind it */
  counterparty: "exchange" | "self-hosted" | "service";
  /** the travel-rule exchange for this transfer (MLR Part 7A) */
  travelRule: "complete" | "not-required" | "requested-received" | "requested-not-received";
  /** for a self-hosted wallet, whether the customer proved they control it; null otherwise */
  ownershipProven: boolean | null;
}

export interface Account {
  id: number;
  customerId: string;
  bank: string;
  segment: Segment;
  tier: Tier;
  age: number;
  /** monthly income after tax for a person; monthly turnover for a business */
  income: number;
  /** what the customer said at onboarding they would send out a month */
  declaredMonthlyOut: number;
  country: string;
  /** day the account opened; negative means before the period */
  openedDay: number;
  /** days before the period's first day that the account last moved money; 0 for an active account. A dormant account has a long gap. */
  quietDaysBefore: number;
  initialBalance: number;
  /** the arranged overdraft in GBP; 0 for none. Ordinary spending may dip into it */
  overdraftLimit: number;
  /** the device the customer uses at the start of the period; mule rings share one */
  deviceId: string;
  /** a household id; people at one address share it (a family), and so do mule rings that give one address */
  addressId: string;
  /** a linked wallet address for crypto-active customers (a self-hosted Bitcoin wallet) */
  wallet: string | null;
  /** a politically exposed person, or their close associate: the customer needs enhanced checks */
  pep: boolean;
  /** a business that takes most of its money in cash (a shop, a restaurant, a taxi firm): its cash deposits are ordinary */
  cashBusiness: boolean;
  /** how the customer was taken on */
  channel: Channel;
  /** whether the customer holds a debit or credit card with the bank */
  hasCard: boolean;
  /** truth, filled after generation */
  isSar: boolean;
  isFraud: boolean;
  fraudRole: "victim" | "mule" | "first-party" | null;
  patterns: number[];
  /* the AMLGentex behaviour fields, as they stand at the end of the period */
  daysInBank: number;
  phoneChanges: number;
}

export interface Tx {
  id: number;
  day: number;
  minute: number;
  type: TxType;
  rail: Rail;
  method: Method;
  /** a declined card authorisation moves no money */
  status: "settled" | "declined";
  amount: number;
  /** the currency the payee receives; GBP except on a payment abroad */
  currency: string;
  /** account id, or -2 for money from outside the data set */
  orig: number;
  /** account id, or -1 for money leaving the data set, or a wallet slot (-1000 - index) */
  dest: number;
  /** a stable id for the counterparty outside the data set (a merchant, a biller, an employer, a payee at another bank, a wallet); null when both sides are accounts here */
  cpRef: string | null;
  /** filled for crypto legs: the counterparty wallet's full address */
  wallet: string | null;
  walletClass: WalletClass | null;
  bankOrig: string;
  bankDest: string;
  /** jurisdiction of the counterparty (the merchant's country for a card payment); GB for a domestic leg */
  country: string;
  /** first payment from this payer to this payee */
  newPayee: boolean;
  /** the first credit into this account from this payer (a customer here, a wallet, or an outside payer); false for cash paid in, which has no payer */
  newPayer: boolean;
  /** the customer changed a password, phone number or email, or added a device, in the last 48 hours */
  recentCredentialChange: boolean;
  /** the counterparty's segment where it is an account in the data set; null for money from or to outside */
  destSegment: Segment | null;
  balOrigAfter: number;
  balDestAfter: number;
  session: SessionFacts | null;
  payee: PayeeFacts | null;
  card: CardFacts | null;
  crypto: CryptoFacts | null;
  /* truth. -1 and null on every ordinary transaction; no rule reads these */
  patternId: number;
  typology: Typology | null;
  family: Family | null;
  role: LegRole | null;
  /** the case a pattern belongs to: a scam and the mule accounts it paid are two patterns of one case */
  caseId: number;
}

/** Something that happened on an account that is not a payment: the security events a fraud system reads. */
export interface AccountEvent {
  account: number;
  day: number;
  minute: number;
  kind: "device-added" | "password-reset" | "phone-changed" | "email-changed" | "sim-swap" | "notifications-off" | "login-new-location";
  /** the device involved, where there is one */
  deviceId: string | null;
  /** the country the event came from */
  ipCountry: string;
  /* truth: -1 on an ordinary event */
  patternId: number;
  typology: Typology | null;
}

/** Money that arrived on an account without a transaction: laundering funds that were already there (the hidden setting, or placement switched off, AMLGentex's convention). Listed so a balance can be followed from the records. */
export interface Adjustment {
  account: number;
  day: number;
  minute: number;
  amount: number;
  patternId: number;
}

export interface PatternInstance {
  id: number;
  typology: Typology;
  family: Family;
  /** the case this pattern is part of; a pattern on its own is its own case */
  caseId: number;
  accounts: number[];
  /** each account's role in the pattern */
  roles: Record<number, AccountRole>;
  main: number;
  startDay: number;
  endDay: number;
  txCount: number;
  total: number;
  /** the phrase a reviewer would use */
  story: string;
  /** the register entries the pattern's shape comes from */
  sources: string[];
}

export interface TypologyConfig {
  enabled: boolean;
  /** instances per 1,000 accounts */
  per1k: number;
  minAccounts: number;
  maxAccounts: number;
}

export interface GenConfig {
  seed: number;
  name: string;
  /** the bank type the configuration started from, if any */
  archetype?: string;
  accounts: number;
  days: number;
  banks: number;
  /** shares of accounts by segment; normalised at run time */
  segments: Record<Segment, number>;
  /** share of accounts opened inside the window */
  newAccountShare: number;
  /** share of personal customers with a linked wallet */
  cryptoActiveShare: number;
  /** who the customers are, beyond the segment split: the customer factor of a business-wide risk assessment */
  customers: {
    /** share of personal and private customers who are politically exposed persons (private clients eight times as often) */
    pepShare: number;
    /** share of customers whose home country is not the UK */
    nonResidentShare: number;
    /** share of small firms that take most of their money in cash */
    cashBusinessShare: number;
    /** share of customers taken on online, without meeting them */
    digitalShare: number;
  };
  /** the country factor: where non-UK customers live, and where payments abroad go; each mix is normalised to one */
  geography: {
    homeMix: CountryMix;
    corridorMix: CountryMix;
  };
  /** the product factor: what the bank offers */
  products: {
    /** share of customers holding a debit or credit card */
    cards: number;
    /** share of personal customers with an arranged overdraft (small firms 1.2 times, private clients half) */
    overdrafts: number;
    /** branch counters and ATMs; a partner network such as the Post Office; or no cash at all */
    cashServices: "branch" | "partner" | "none";
    /** whether the bank sends payments abroad at all */
    international: boolean;
  };
  /** ordinary behaviour */
  activity: number;             // multiplier on income and spend frequency
  normalPer1k: Record<NormalModel, number>;
  internationalShare: number;   // share of transfers that cross a border
  cashShare: number;            // share of spending done in cash
  /** the difficulty knobs, all from AMLGentex's tuning bounds */
  amountOverlap: number;        // 1 = laundering amounts match normal amounts; 0 = four times larger
  burstinessBias: number;       // -4 spread out .. +4 bursty
  durationMean: number;         // days a laundering pattern runs, mean
  durationSd: number;
  marginRatio: number;          // fee skimmed at each layer
  multiPatternShare: number;    // chance a laundering account joins a second pattern
  centralityBias: number;       // 0 = launderers picked at random; 1 = strongly central accounts
  visiblePlacement: boolean;    // record the placement (cash in or unexplained credit) as a transaction
  /** which period of this bank's life the data set covers. The seed number makes the bank (its customers, profiles and payment relationships); the period draws that bank's days of activity and the crime planted in them. Period 1 is the bank's own draw; 2, 3, ... are the periods after it, each reproducible from the seed number and the period. */
  period?: number;
  /** the five layered laundering patterns ride on existing relationships: members are a connected group of the payment graph, legs are sized like the payer's usual transfers and stay domestic, nothing is placed visibly (off as shipped; the fair test for a model that reads who pays whom) */
  ridesExistingLinks?: boolean;
  /** the cash line structurers stay under: GBP 10,000 (MLR reg 14, register S46) */
  cashThreshold: number;
  /** the crypto information line: GBP 800 (MLR 64C(4), register S45) */
  travelRuleThreshold: number;
  aml: Record<AmlTypology, TypologyConfig>;
  fraud: Record<FraudTypology, TypologyConfig>;
  crypto: Record<CryptoTypology, TypologyConfig>;
}

/** shares of the four country pools: the EEA, other lower-risk countries, the UK's remittance corridors, and the FATF lists */
export interface CountryMix { eea: number; other: number; corridor: number; highRisk: number }

export interface WalletRef {
  /** the full address */
  id: string;
  chain: "bitcoin";
  cls: WalletClass;
  /** the label that the pool file gives the address */
  label: "illicit" | "licit" | "unknown";
  /** the behaviour class that the pool file gives the address */
  predicted: string;
  /** the confidence that the pool file gives that class, 0 to 1 */
  conf: number;
}

export interface DatasetSummary {
  accounts: number;
  txs: number;
  days: number;
  patterns: number;
  sarAccounts: number;
  fraudAccounts: number;
  byTypology: Record<string, { instances: number; accounts: number; txs: number; total: number }>;
  byType: Record<string, number>;
  byRail: Record<string, number>;
  byMethod: Record<string, number>;
  amountPercentiles: Record<string, number>;
  totalValue: number;
  newAccounts: number;
  cryptoAccounts: number;
  events: number;
  declined: number;
}

export interface Dataset {
  version: 1;
  /** the generator that made it (generate.ts GENERATOR_VERSION); a seed number repeats a data set only on the same generator */
  generator?: string;
  generatedAt: string;
  config: GenConfig;
  /** the date of day 0 (yyyy-mm-dd), from the calendar in sources.json */
  day0: string;
  accounts: Account[];
  txs: Tx[];
  events: AccountEvent[];
  /** money that arrived without a transaction */
  adjustments: Adjustment[];
  patterns: PatternInstance[];
  wallets: WalletRef[];
  summary: DatasetSummary;
  /** what the wallet pool and the account model of the run rest on */
  grounding: { wallets: string; accounts: string };
}

export const TYPOLOGY_LABEL: Record<Typology, string> = {
  fan_in: "Fan-in: many senders into one account",
  fan_out: "Fan-out: one account paying out to many",
  cycle: "Cycle: money that comes back round",
  bipartite: "Bipartite: a group paying another group",
  stack: "Stacked layers: funds passed layer to layer",
  random: "Random: unstructured transfers inside a ring",
  scatter_gather: "Scatter then gather",
  gather_scatter: "Gather then scatter",
  structuring: "Structuring: cash deposits kept under the GBP 10,000 line",
  smurfing: "Smurfing: many small cash placements into one account",
  deposit_send: "Cash in, sent straight on",
  behaviour_change: "Behaviour change: activity far above the account's own history",
  single_large: "One very large transfer against the profile",
  passthrough: "Rapid pass-through: in and out within two days",
  cash_out: "Cash-out: credits taken out in cash at machines and counters",
  over_invoicing: "Over-invoicing: a business pays inflated invoices abroad",
  dormant_reactivation: "A dormant account wakes and passes money through",
  scam_purchase: "Purchase scam: paying for goods that never arrive",
  scam_investment: "Investment scam: payments into a fake investment, rising over weeks",
  scam_romance: "Romance scam: many payments to someone the victim met online",
  scam_advance_fee: "Advance fee scam: a fee to release a prize, a loan or goods",
  scam_invoice: "Invoice and mandate scam: a supplier's bank details changed by a criminal",
  scam_ceo: "CEO fraud: an urgent payment ordered by someone posing as the boss",
  scam_impersonation_bank: "Impersonation of police or bank staff: money moved to a 'safe account'",
  scam_impersonation_other: "Other impersonation: a fake fine, tax bill or refund",
  ato_credentials: "Account takeover: stolen log-in details used from a new device",
  ato_sim_swap: "Account takeover by SIM swap: the phone number moved to the criminal",
  ato_remote_access: "Account takeover by remote access: the victim's own device controlled from outside",
  card_remote: "Card not present: stolen card details spent online after a test payment",
  card_lost_stolen: "Lost or stolen card: spent in shops and at a cash machine before it is stopped",
  card_counterfeit: "Counterfeit card: a copied card used abroad",
  bust_out: "First-party bust-out: a new account builds a history, then takes everything and stops",
  mule_herd: "Mule network under one controller",
  mule_account: "Mule account: receives a fraud's proceeds and passes them on",
  offramp_layering: "Crypto sold into the account from illicit wallets, then sent on",
  travel_rule_structuring: "Crypto transfers kept under the GBP 800 information line",
  mixer_exposure: "Payment to a mixing service",
  sanctioned_counterparty: "Transfer to an address on the OFAC sanctions list",
};

/** Short names for charts where the full label would not fit (at most 26 characters). */
export const TYPOLOGY_SHORT: Record<Typology, string> = {
  fan_in: "Fan-in", fan_out: "Fan-out", cycle: "Cycle", bipartite: "Bipartite", stack: "Stacked layers", random: "Random ring",
  scatter_gather: "Scatter then gather", gather_scatter: "Gather then scatter",
  structuring: "Structuring", smurfing: "Smurfing", deposit_send: "Cash in, sent on", behaviour_change: "Behaviour change",
  single_large: "Single large transfer", passthrough: "Rapid pass-through", cash_out: "Cash-out", over_invoicing: "Over-invoicing",
  dormant_reactivation: "Dormant account wakes",
  scam_purchase: "Purchase scam", scam_investment: "Investment scam", scam_romance: "Romance scam", scam_advance_fee: "Advance fee scam",
  scam_invoice: "Invoice and mandate scam", scam_ceo: "CEO fraud", scam_impersonation_bank: "Police or bank impersonation",
  scam_impersonation_other: "Other impersonation",
  ato_credentials: "Takeover: stolen log-in", ato_sim_swap: "Takeover: SIM swap", ato_remote_access: "Takeover: remote access",
  card_remote: "Card not present", card_lost_stolen: "Lost or stolen card", card_counterfeit: "Counterfeit card",
  bust_out: "First-party bust-out", mule_herd: "Mule network", mule_account: "Mule account",
  offramp_layering: "Off-ramp layering", travel_rule_structuring: "Under the crypto line",
  mixer_exposure: "Payment to a mixer", sanctioned_counterparty: "Sanctioned address",
};

export const TYPOLOGY_FAMILY: Record<Typology, Family> = {
  fan_in: "aml", fan_out: "aml", cycle: "aml", bipartite: "aml", stack: "aml", random: "aml",
  scatter_gather: "aml", gather_scatter: "aml", structuring: "aml", smurfing: "aml",
  deposit_send: "aml", behaviour_change: "aml", single_large: "aml", passthrough: "aml",
  cash_out: "aml", over_invoicing: "aml", dormant_reactivation: "aml",
  scam_purchase: "fraud", scam_investment: "fraud", scam_romance: "fraud", scam_advance_fee: "fraud",
  scam_invoice: "fraud", scam_ceo: "fraud", scam_impersonation_bank: "fraud", scam_impersonation_other: "fraud",
  ato_credentials: "fraud", ato_sim_swap: "fraud", ato_remote_access: "fraud",
  card_remote: "fraud", card_lost_stolen: "fraud", card_counterfeit: "fraud", bust_out: "fraud",
  mule_herd: "mule", mule_account: "mule",
  offramp_layering: "crypto", travel_rule_structuring: "crypto", mixer_exposure: "crypto",
  sanctioned_counterparty: "sanctions",
};

/** The families, in the order the pages show them, with the control that owns each. */
export const FAMILY_LABEL: Record<Family, string> = {
  aml: "Money laundering", mule: "Mule accounts", fraud: "Fraud", crypto: "Crypto", sanctions: "Sanctions",
};
export const FAMILY_OWNER: Record<Family, string> = {
  aml: "transaction monitoring", mule: "fraud and transaction monitoring together", fraud: "fraud prevention",
  crypto: "crypto transaction monitoring", sanctions: "sanctions screening",
};

/** The sub-type groups a fraud reader sorts by (UK Finance's categories, register S01). */
export const FRAUD_GROUP: Partial<Record<Typology, "Push-payment scam" | "Account takeover" | "Card fraud" | "First-party fraud">> = {
  scam_purchase: "Push-payment scam", scam_investment: "Push-payment scam", scam_romance: "Push-payment scam", scam_advance_fee: "Push-payment scam",
  scam_invoice: "Push-payment scam", scam_ceo: "Push-payment scam", scam_impersonation_bank: "Push-payment scam", scam_impersonation_other: "Push-payment scam",
  ato_credentials: "Account takeover", ato_sim_swap: "Account takeover", ato_remote_access: "Account takeover",
  card_remote: "Card fraud", card_lost_stolen: "Card fraud", card_counterfeit: "Card fraud", bust_out: "First-party fraud",
};

export const AML_TYPOLOGIES: AmlTypology[] = ["fan_in", "fan_out", "cycle", "bipartite", "stack", "random", "scatter_gather", "gather_scatter", "structuring", "smurfing", "deposit_send", "behaviour_change", "single_large", "passthrough", "cash_out", "over_invoicing", "dormant_reactivation"];
export const FRAUD_TYPOLOGIES: FraudTypology[] = ["scam_purchase", "scam_investment", "scam_romance", "scam_advance_fee", "scam_invoice", "scam_ceo", "scam_impersonation_bank", "scam_impersonation_other", "ato_credentials", "ato_sim_swap", "ato_remote_access", "card_remote", "card_lost_stolen", "card_counterfeit", "bust_out", "mule_herd"];
export const CRYPTO_TYPOLOGIES: CryptoTypology[] = ["offramp_layering", "travel_rule_structuring", "mixer_exposure", "sanctioned_counterparty"];
export const ALL_TYPOLOGIES = Object.keys(TYPOLOGY_FAMILY) as Typology[];
export const typologiesOf = (families: Family[]): Typology[] => ALL_TYPOLOGIES.filter((t) => families.includes(TYPOLOGY_FAMILY[t]));

/* Countries, in four pools the bank builder mixes.

   Since 30 June 2026 regulation 33(1)(b) of the Money Laundering Regulations
   requires enhanced due diligence with a person established in a "FATF call for
   action country", a country on the FATF's call-for-action list (regulation
   33(3)(a), as S.I. 2026/621 regulation 19 amended it); before that date either
   list made a high-risk third country. A country on the "increased monitoring"
   list is now a geographical risk factor to weigh (regulation 33(6)(c)). Both
   lists are copied here as
   they stood after the FATF plenary of 17 to 19 June 2026 (Iraq and Bosnia and
   Herzegovina added; Algeria and Namibia removed). Update both after each
   plenary (February, June, October). */
export const FATF_CALL_FOR_ACTION = ["IR", "KP", "MM"];
export const FATF_INCREASED_MONITORING = ["AO", "BO", "BA", "BG", "CM", "CI", "CD", "HT", "IQ", "KE", "KW", "LA", "LB", "MC", "NP", "PG", "SS", "SY", "VE", "VN", "VG", "YE"];
export const HIGH_RISK_COUNTRIES = [...FATF_CALL_FOR_ACTION, ...FATF_INCREASED_MONITORING];
/** the European Economic Area, where most of a UK bank's payments abroad go */
export const EEA_COUNTRIES = ["IE", "FR", "DE", "ES", "NL", "IT", "PT", "PL", "RO", "LT"];
/** other lower-risk trading partners */
export const OTHER_COUNTRIES = ["US", "CA", "AU", "CH", "SG", "JP", "NZ", "NO"];
/** the UK's remittance and trade corridors that carry a higher risk reading without being FATF-listed:
    India, Pakistan and Nigeria are the three largest remittance destinations from the UK (Migration Observatory, 2024) */
export const CORRIDOR_COUNTRIES = ["IN", "PK", "NG", "GH", "BD", "PH", "JM", "ZA", "LK", "AE", "TR"];
export const ORDINARY_COUNTRIES = ["GB", "GB", "GB", "IE", "FR", "DE", "ES", "NL", "US", "PL", "IN", "PK", "NG", "AE", "TR", "PT", "IT"];
export const MEDIUM_RISK_COUNTRIES = CORRIDOR_COUNTRIES;
export const COUNTRY_NAME: Record<string, string> = {
  GB: "the UK", IE: "Ireland", FR: "France", DE: "Germany", ES: "Spain", NL: "the Netherlands", IT: "Italy", PT: "Portugal", PL: "Poland", RO: "Romania", LT: "Lithuania",
  US: "the United States", CA: "Canada", AU: "Australia", CH: "Switzerland", SG: "Singapore", JP: "Japan", NZ: "New Zealand", NO: "Norway",
  IN: "India", PK: "Pakistan", NG: "Nigeria", GH: "Ghana", BD: "Bangladesh", PH: "the Philippines", JM: "Jamaica", ZA: "South Africa", LK: "Sri Lanka", AE: "the UAE", TR: "Turkey",
  IR: "Iran", KP: "North Korea", MM: "Myanmar", AO: "Angola", BO: "Bolivia", BA: "Bosnia and Herzegovina", BG: "Bulgaria", CM: "Cameroon", CI: "Ivory Coast", CD: "DR Congo", HT: "Haiti", IQ: "Iraq", KE: "Kenya", KW: "Kuwait", LA: "Laos", LB: "Lebanon", MC: "Monaco", NP: "Nepal", PG: "Papua New Guinea", SS: "South Sudan", SY: "Syria", VE: "Venezuela", VN: "Vietnam", VG: "the British Virgin Islands", YE: "Yemen",
};
/** The currency a payment abroad arrives in. The euro for the euro area; the US dollar where a corridor bank settles in dollars; the local currency otherwise. */
export const CURRENCY_OF: Record<string, string> = {
  IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", NL: "EUR", IT: "EUR", PT: "EUR", LT: "EUR", PL: "PLN", RO: "RON", BG: "BGN",
  US: "USD", CA: "CAD", AU: "AUD", CH: "CHF", SG: "SGD", JP: "JPY", NZ: "NZD", NO: "NOK",
  IN: "INR", PK: "PKR", NG: "NGN", GH: "GHS", BD: "BDT", PH: "PHP", JM: "JMD", ZA: "ZAR", LK: "LKR", AE: "AED", TR: "TRY",
  MC: "EUR", VG: "USD", VN: "VND", KE: "KES", KW: "KWD", LB: "USD", IQ: "USD", AO: "USD", BO: "USD", BA: "BAM", CM: "XAF", CI: "XOF", CD: "USD", HT: "USD", LA: "USD", NP: "NPR", PG: "PGK", SS: "USD", SY: "USD", VE: "USD", YE: "USD", IR: "USD", KP: "USD", MM: "USD",
};
