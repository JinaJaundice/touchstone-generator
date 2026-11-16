/* The behaviour class of a wallet. The wallet pool file and a screening tool name a class in the words of a tool, and
   the rail uses its own 8 wallet classes. generate.ts exports classOf again, and the planter of the pattern library
   uses it without importing generate.ts. */

import type { WalletClass } from "./types";

/** Map the behaviour class that the wallet pool gives an address onto the classes the rail uses. A class of "government criminal blacklist" is not a listing, so it maps to unknown; "sanctioned" is kept for an address on the OFAC list. */
export function classOf(type: string): WalletClass {
  switch (type) {
    case "centralized exchange": return "exchange";
    case "tumbler": case "money laundering": return "mixer";
    case "darknet market": case "blackmail": case "cyber-security service": return "darknet";
    case "gambling": return "gambling";
    case "individual wallet": case "P2P financial service": case "P2P financial infrastructure": return "personal";
    default: return "unknown";
  }
}
