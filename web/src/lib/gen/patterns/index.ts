/* The registry of the pattern library: every part file and pattern file, imported by name and checked once when the
   module loads. A file that fails a check stops the module with an error that names the file and the field. */

import { validatePart, validatePattern } from "./validate";
import type { Part, Pattern } from "./types";
import references from "./references.json";

import bankCryptoSale from "./parts/bank-crypto-sale.json";
import bridgeHop from "./parts/bridge-hop.json";
import cashByCourier from "./parts/cash-by-courier.json";
import cashToCryptoMules from "./parts/cash-to-crypto-mules.json";
import coinjoin from "./parts/coinjoin.json";
import darknetMarketPurchases from "./parts/darknet-market-purchases.json";
import dexSwap from "./parts/dex-swap.json";
import drugProceedsInCrypto from "./parts/drug-proceeds-in-crypto.json";
import exchangeHack from "./parts/exchange-hack.json";
import exchangeToBankAccount from "./parts/exchange-to-bank-account.json";
import flashLoanBurst from "./parts/flash-loan-burst.json";
import gamblingSite from "./parts/gambling-site.json";
import highRiskExchangePass from "./parts/high-risk-exchange-pass.json";
import investmentScamThroughExchange from "./parts/investment-scam-through-exchange.json";
import liquidityPoolCycling from "./parts/liquidity-pool-cycling.json";
import mixer from "./parts/mixer.json";
import muleAccountsChain from "./parts/mule-accounts-chain.json";
import nftWashSale from "./parts/nft-wash-sale.json";
import otcDeskPayout from "./parts/otc-desk-payout.json";
import paymentFirmThirdPartyPayments from "./parts/payment-firm-third-party-payments.json";
import paymentPlatformPayout from "./parts/payment-platform-payout.json";
import peelChain from "./parts/peel-chain.json";
import ponziScheme from "./parts/ponzi-scheme.json";
import privacyCoinHop from "./parts/privacy-coin-hop.json";
import ransomPayment from "./parts/ransom-payment.json";
import sanctionedFundsInStablecoin from "./parts/sanctioned-funds-in-stablecoin.json";
import shellCompanyCashOut from "./parts/shell-company-cash-out.json";
import smurfWallets from "./parts/smurf-wallets.json";
import stablecoinHold from "./parts/stablecoin-hold.json";
import swapBridgeSwap from "./parts/swap-bridge-swap.json";
import victimFedCryptoAtm from "./parts/victim-fed-crypto-atm.json";

import cashIntoCryptoThroughMules from "./library/cash-into-crypto-through-mules.json";
import drugProceedsThroughShellCompanies from "./library/drug-proceeds-through-shell-companies.json";
import investmentScamToStablecoin from "./library/investment-scam-to-stablecoin.json";
import marketPurchasesAndInHouseMixer from "./library/market-purchases-and-in-house-mixer.json";
import ponziCollapse from "./library/ponzi-collapse.json";
import ransomThroughAMixer from "./library/ransom-through-a-mixer.json";
import sanctionedFundsThroughAPaymentFirm from "./library/sanctioned-funds-through-a-payment-firm.json";
import scamVictimAtCryptoMachines from "./library/scam-victim-at-crypto-machines.json";
import stolenFundsThroughAPeelChain from "./library/stolen-funds-through-a-peel-chain.json";
import stolenFundsThroughBridgeAndMixers from "./library/stolen-funds-through-bridge-and-mixers.json";
import stolenFundsThroughDefiToMules from "./library/stolen-funds-through-defi-to-mules.json";
import washSaleAndGamblingToAPlatform from "./library/wash-sale-and-gambling-to-a-platform.json";

/** The source ids that references.json holds, which check 6 of the validator uses. */
const KNOWN: ReadonlySet<string> = new Set(references.sources.map((s) => s.id));

const PART_FILES: Record<string, unknown> = {
  "bank-crypto-sale": bankCryptoSale, "bridge-hop": bridgeHop, "cash-by-courier": cashByCourier,
  "cash-to-crypto-mules": cashToCryptoMules, coinjoin, "darknet-market-purchases": darknetMarketPurchases,
  "dex-swap": dexSwap, "drug-proceeds-in-crypto": drugProceedsInCrypto, "exchange-hack": exchangeHack,
  "exchange-to-bank-account": exchangeToBankAccount, "flash-loan-burst": flashLoanBurst,
  "gambling-site": gamblingSite, "high-risk-exchange-pass": highRiskExchangePass,
  "investment-scam-through-exchange": investmentScamThroughExchange, "liquidity-pool-cycling": liquidityPoolCycling,
  mixer, "mule-accounts-chain": muleAccountsChain, "nft-wash-sale": nftWashSale, "otc-desk-payout": otcDeskPayout,
  "payment-firm-third-party-payments": paymentFirmThirdPartyPayments,
  "payment-platform-payout": paymentPlatformPayout, "peel-chain": peelChain, "ponzi-scheme": ponziScheme,
  "privacy-coin-hop": privacyCoinHop, "ransom-payment": ransomPayment,
  "sanctioned-funds-in-stablecoin": sanctionedFundsInStablecoin, "shell-company-cash-out": shellCompanyCashOut,
  "smurf-wallets": smurfWallets, "stablecoin-hold": stablecoinHold, "swap-bridge-swap": swapBridgeSwap,
  "victim-fed-crypto-atm": victimFedCryptoAtm,
};
const PATTERN_FILES: Record<string, unknown> = {
  "cash-into-crypto-through-mules": cashIntoCryptoThroughMules,
  "drug-proceeds-through-shell-companies": drugProceedsThroughShellCompanies,
  "investment-scam-to-stablecoin": investmentScamToStablecoin,
  "market-purchases-and-in-house-mixer": marketPurchasesAndInHouseMixer, "ponzi-collapse": ponziCollapse,
  "ransom-through-a-mixer": ransomThroughAMixer,
  "sanctioned-funds-through-a-payment-firm": sanctionedFundsThroughAPaymentFirm,
  "scam-victim-at-crypto-machines": scamVictimAtCryptoMachines,
  "stolen-funds-through-a-peel-chain": stolenFundsThroughAPeelChain,
  "stolen-funds-through-bridge-and-mixers": stolenFundsThroughBridgeAndMixers,
  "stolen-funds-through-defi-to-mules": stolenFundsThroughDefiToMules,
  "wash-sale-and-gambling-to-a-platform": washSaleAndGamblingToAPlatform,
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
