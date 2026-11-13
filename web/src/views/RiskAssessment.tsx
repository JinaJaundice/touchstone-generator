import { useMemo } from "react";
import type { GenConfig } from "../lib/gen/types";
import { abroadShare, cashFactor } from "../lib/gen/config";
import { estimate } from "../lib/gen/archetypes";
import { Pill } from "../lib/ui";
import { fmtInt, fmtNum, fmtPct } from "../lib/format";

/* The bank as a business-wide risk assessment. The FCA's Financial Crime
   Guide asks a firm to assess the risk from its customers, the countries it
   deals with, its products, its transactions and the channels it serves
   customers through (FCG 2.2.4). This reads those five factors off the
   settings as they stand, so the person building the bank sees it the way
   their own risk assessment would describe it. */

type Reading = "standard" | "raised" | "higher";
const TONE: Record<Reading, "muted" | "noise" | "missed"> = { standard: "muted", raised: "noise", higher: "missed" };
const WORD: Record<Reading, string> = { standard: "standard", raised: "raised", higher: "higher" };

const pct = (v: number) => fmtPct(v);
const pctFine = (v: number) => (v > 0 && v < 0.01 ? `${(100 * v).toFixed(1)}%` : fmtPct(v));

export function RiskAssessment({ cfg }: { cfg: GenConfig }) {
  const est = useMemo(() => estimate(cfg), [cfg]);
  const seg = cfg.segments, cu = cfg.customers, g = cfg.geography, pr = cfg.products;
  const abroad = abroadShare(cfg);
  const cash = cashFactor(cfg);

  const customerReading: Reading = cu.pepShare >= 0.01 || cu.nonResidentShare >= 0.25 || seg.private >= 0.3 || cu.cashBusinessShare >= 0.25 ? "higher"
    : cu.pepShare >= 0.005 || cu.nonResidentShare >= 0.12 || seg.private >= 0.1 || cfg.newAccountShare >= 0.2 ? "raised" : "standard";
  const countryReading: Reading = abroad > 0 && (g.corridorMix.highRisk >= 0.05 || g.homeMix.highRisk >= 0.05) ? "higher"
    : abroad >= 0.15 || (abroad > 0 && g.corridorMix.corridor >= 0.4) ? "raised" : "standard";
  const productReading: Reading = cfg.cryptoActiveShare >= 0.15 || (cash === 1 && cfg.cashShare >= 0.15) ? "higher"
    : cfg.cryptoActiveShare >= 0.08 || (cash > 0 && cfg.cashShare >= 0.1) || pr.overdrafts >= 0.4 ? "raised" : "standard";
  const transactionReading: Reading = cfg.activity >= 1.6 ? "higher" : cfg.activity >= 1.3 ? "raised" : "standard";
  const channelReading: Reading = cu.digitalShare >= 0.9 ? "higher" : cu.digitalShare >= 0.7 ? "raised" : "standard";

  const cashWords = pr.cashServices === "none" ? "no cash services" : pr.cashServices === "partner" ? "cash through a partner counter only" : "cash over branch counters and at ATMs";
  const rows: { factor: string; setting: string; reading: Reading; why: string }[] = [
    {
      factor: "Customers",
      setting: `${pct(seg.retail)} personal customers, ${pct(seg.sme)} small firms, ${pct(seg.corporate)} corporates, ${pct(seg.private)} private clients. ${pctFine(cu.pepShare)} of personal customers are politically exposed. ${pct(cu.nonResidentShare)} live outside the UK. ${pct(cu.cashBusinessShare)} of small firms are cash-based. ${pct(cfg.newAccountShare)} of accounts open during the period.`,
      reading: customerReading,
      why: "Politically exposed persons, customers living abroad, cash-based businesses and a fast-growing customer base each raise the reading.",
    },
    {
      factor: "Countries",
      setting: abroad > 0
        ? `${pct(abroad)} of ordinary payments go abroad: ${pct(g.corridorMix.eea)} to the European Economic Area, ${pct(g.corridorMix.other)} to other lower-risk countries, ${pct(g.corridorMix.corridor)} to remittance corridors (India, Pakistan, Nigeria and their like) and ${pct(g.corridorMix.highRisk)} to countries on the FATF lists. Of the customers living abroad, ${pct(g.homeMix.highRisk)} come from FATF-listed countries.`
        : `No payments abroad. Of the customers living abroad, ${pct(g.homeMix.highRisk)} come from FATF-listed countries.`,
      reading: countryReading,
      why: "Since 30 June 2026 the Money Laundering Regulations require enhanced due diligence for a country on the FATF's call-for-action list. A country under increased monitoring is a risk factor to weigh. Remittance corridors carry a higher reading without being listed.",
    },
    {
      factor: "Products",
      setting: `Current accounts, with cards for ${pct(pr.cards)} of customers and arranged overdrafts for ${pct(pr.overdrafts)} of personal customers. ${cashWords[0].toUpperCase()}${cashWords.slice(1)}${cash > 0 ? `, and ${pct(cfg.cashShare)} of spending in cash` : ""}. ${pr.international ? "Payments abroad are offered" : "No payments abroad"}, and ${pct(cfg.cryptoActiveShare)} of personal customers hold a linked crypto wallet.`,
      reading: productReading,
      why: "Cash and crypto are the products that carry laundering; an overdraft is what a first-party fraudster takes.",
    },
    {
      factor: "Transactions",
      setting: `About ${fmtInt(est.txs)} transactions across ${fmtInt(cfg.accounts)} accounts in ${cfg.days} days, at ${fmtNum(cfg.activity, 1)} times the standard pace. ${fmtInt(est.patterns)} crime patterns planted, so about ${fmtPct(est.baseRate, 1)} of accounts are crime.`,
      reading: transactionReading,
      why: "A busier bank gives a rule more to read and more to get wrong.",
    },
    {
      factor: "Channel",
      setting: `${pct(cu.digitalShare)} of customers taken on online without being met; ${pct(1 - cu.digitalShare)} in a branch or in person. Customers taken on online sit on the lighter identity-check tiers more often.`,
      reading: channelReading,
      why: "Taking a customer on without meeting them is a risk factor in the JMLSG guidance, and where identity fraud enters.",
    },
  ];

  return (
    <div className="bwra" id="bwra">
      <div className="bwra-head">
        <div className="bwra-title">The bank as a risk assessment</div>
        <div className="faint">The five factors a firm's business-wide risk assessment covers, read from the settings above.</div>
      </div>
      <div className="tbl-wrap" tabIndex={0}>
        <table className="tbl bwra-tbl">
          <thead><tr><th>Factor</th><th>The bank as set</th><th>Reading</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.factor}>
                <td className="bwra-factor">{r.factor}</td>
                <td>{r.setting}<div className="faint bwra-why">{r.why}</div></td>
                <td><Pill tone={TONE[r.reading]}>{WORD[r.reading]}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint bwra-source">The five factors are the ones the FCA's Financial Crime Guide asks a firm to assess (FCG 2.2.4). They are the products and services it offers, the jurisdictions it operates in, the types of customer it attracts, the complexity and volume of transactions, and its distribution channels. The readings are Touchstone's plain reading of the settings, for orientation. A bank's own assessment weighs its own evidence.</p>
    </div>
  );
}
