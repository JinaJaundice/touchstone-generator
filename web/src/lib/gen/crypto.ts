/* The crypto patterns, on the Bitcoin rail its wallets come from.

   A crypto-active customer buys and sells bitcoin through the bank's crypto
   service (normal.ts). The counterparty wallet on each leg is an address
   from the wallet pool file (wallet_pool.json), which gives each address a
   label of illicit, licit or unknown and a behaviour class with a confidence.
   So a "mixer" here is an address whose class is tumbler and whose label is
   illicit. The pool file states how its labels and classes were made, and
   each leg carries both. A customer's own wallet is a made segwit address (address.ts).

   Patterns follow the FATF virtual-asset red flags (September 2020) and
   FATF/Egmont on cyber-enabled fraud (register S37): proceeds sold into an
   account from illicit wallets and sent on; transfers kept under the GBP 800
   information line (MLR 64C(4), register S45); a payment to a mixer. A
   transfer to an address on the OFAC list is not a monitoring pattern: it is
   sanctions exposure, owned by screening (family "sanctions"), and its
   address is a real Bitcoin entry on the list, designated before the data's
   first day (register S44). */

import { lognormal, rint, truncNormal } from "../rng";
import { scheduleSteps, sampleBurstiness } from "./scheduler";
import type { World } from "./world";
import type { CryptoTypology, Family } from "./types";
import { TYPOLOGY_FAMILY, TYPOLOGY_LABEL } from "./types";
import { pickMembers } from "./aml";
import ofacList from "../lists/ofac.json";

export function scheduleCrypto(w: World) {
  const n = w.accounts.length;
  for (const key of Object.keys(w.cfg.crypto) as CryptoTypology[]) {
    const tc = w.cfg.crypto[key];
    if (!tc.enabled) continue;
    const count = Math.round(tc.per1k * n / 1000);
    for (let c = 0; c < count; c++) inject(w, key, rint(w.r, tc.minAccounts, tc.maxAccounts));
  }
}

function pickCryptoMain(w: World): number {
  const withWallet = w.accounts.filter((a) => a.wallet && a.quietDaysBefore === 0 && (a.patterns.length === 0 || w.r() < w.cfg.multiPatternShare)).map((a) => a.id);
  if (withWallet.length) return withWallet[rint(w.r, 0, withWallet.length - 1)];
  const [m] = pickMembers(w, 1, { retailOnly: true });
  return m;
}

const SOURCES: Record<CryptoTypology, string[]> = {
  offramp_layering: ["S37", "S36", "S48"], travel_rule_structuring: ["S45", "S37"], mixer_exposure: ["S36", "S48"], sanctioned_counterparty: ["S44", "S36", "S39"],
};

function inject(w: World, key: CryptoTypology, size: number) {
  const days = w.cfg.days;
  const main = pickCryptoMain(w);
  const dur = Math.max(2, Math.min(days - 1, Math.round(truncNormal(w.r, w.cfg.durationMean, w.cfg.durationSd, 2, days - 1))));
  const earliest = Math.max(0, w.accounts[main].openedDay + 1);
  const start = Math.min(days - 3, rint(w.r, earliest, Math.max(earliest, days - dur - 1)));
  const end = Math.min(days - 1, start + dur);
  const level = sampleBurstiness(w.r, w.cfg.burstinessBias);
  const story = TYPOLOGY_LABEL[key];
  const family: Family = TYPOLOGY_FAMILY[key];
  const line = w.cfg.travelRuleThreshold;
  const base = { typology: key, family };

  if (key === "offramp_layering") {
    const p = w.newPattern(key, family, [main], main, start, end, story, { sources: SOURCES[key] });
    const k = rint(w.r, 3, 8);
    const steps = scheduleSteps(w.r, start, end, k, level);
    let got = 0;
    steps.forEach((s) => {
      // proceeds arrive from wallets that the pool labels illicit, of the classes a darknet market, an extortion or a tumbler would be
      const ref = w.poolWallet(["darknet", "mixer", "gambling", "unknown"], "illicit");
      const a = lognormal(w.r, line * 2.7, 0.6);
      got += a;
      w.schedule({ day: s, minute: w.minute("day"), from: -2, to: main, amount: a, type: "CRYPTO_IN", wallet: ref?.id ?? null,
        walletClass: ref?.cls ?? "unknown", patternId: p.id, role: "tainted-receipt", caseId: p.caseId, ...base });
    });
    const last = steps[steps.length - 1];
    const others = size > 1 ? pickMembers(w, size - 1) : [];
    others.forEach((o) => w.join(p, o, "launderer"));
    others.forEach((o) => { w.accounts[o].isSar = true; });
    const outs = others.length ? others : [-1];
    outs.forEach((o, i) => w.schedule({ day: Math.min(days - 1, last + rint(w.r, 0, 3) + i), minute: w.minute("day"), from: main, to: o,
      amount: got * 0.88 / outs.length, type: "TRANSFER", patternId: p.id, role: "offramp-forward", caseId: p.caseId, ...base,
      country: o === -1 && w.r() < 0.4 ? w.country("medium") : undefined }));
    return;
  }
  if (key === "travel_rule_structuring") {
    const p = w.newPattern(key, family, [main], main, start, end, story, { sources: SOURCES[key] });
    // a self-hosted wallet that is not the customer's own, or an exchange: the transfers stay just under the information line
    const ref = w.poolWallet(["personal", "unknown"]);
    const k = rint(w.r, 4, 11);
    const steps = scheduleSteps(w.r, start, end, k, level);
    steps.forEach((s) => w.schedule({ day: s, minute: w.minute("day"), from: main, to: ref ? w.slotOf(ref.id) : -1, amount: truncNormal(w.r, line * 0.9, line * 0.05, line * 0.6, line * 0.995),
      type: "CRYPTO_OUT", wallet: ref?.id ?? null, walletClass: ref?.cls ?? "personal", patternId: p.id, role: "structured-purchase", caseId: p.caseId, fund: true, ...base,
      crypto: { counterparty: "self-hosted", travelRule: "not-required", ownershipProven: false } }));
    return;
  }
  if (key === "mixer_exposure") {
    const p = w.newPattern(key, family, [main], main, start, end, story, { sources: SOURCES[key] });
    const ref = w.poolWallet(["mixer"], "illicit") ?? w.poolWallet(["mixer"]);
    const k = rint(w.r, 1, 3);
    const steps = scheduleSteps(w.r, start, end, k, level);
    steps.forEach((s) => w.schedule({ day: s, minute: w.minute("day"), from: main, to: ref ? w.slotOf(ref.id) : -1, amount: lognormal(w.r, line * 3, 0.6),
      type: "CRYPTO_OUT", wallet: ref?.id ?? null, walletClass: "mixer", patternId: p.id, role: "mixer-payment", caseId: p.caseId, fund: true, ...base }));
    return;
  }
  if (key === "sanctioned_counterparty") {
    // a real Bitcoin address on OFAC's list, designated before the data's first day
    const entries = ofacList.bitcoin;
    const e = entries[rint(w.r, 0, entries.length - 1)];
    const p = w.newPattern(key, family, [main], main, start, end, story, { roles: { [main]: "exposed" }, sources: SOURCES[key] });
    const s = scheduleSteps(w.r, start, end, 1, level)[0];
    w.schedule({ day: s, minute: w.minute("day"), from: main, to: w.slotOf(e.address), amount: lognormal(w.r, line * 3.5, 0.5), type: "CRYPTO_OUT",
      wallet: e.address, walletClass: "sanctioned", patternId: p.id, role: "sanctions-exposure", caseId: p.caseId, fund: true, ...base,
      cpRef: e.address, crypto: { counterparty: "service", travelRule: "not-required", ownershipProven: null } });
  }
}
