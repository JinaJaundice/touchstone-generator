import { Fragment, useMemo, useState } from "react";
import { useGenStore as useStore } from "../lib/genStore";
import { BankBuilder } from "./BankBuilder";
import { patternFamily, patternShort, type Tx } from "../lib/gen/types";
import { caseView, libraryIdOf, listCases, pickCase } from "../lib/gen/caseView";
import { FlowLedger, ledgerCounts } from "../lib/flow";
import { Button, Card, Disclosure, Doc, Empty, NextStep, PageHead, Pill, Section, Seg, StatBand, Working, type ContentsItem } from "../lib/ui";
import { BarList, FAMILY_ORDER, FAMILY_WORD, LogHistogram, familyTone } from "../lib/viz";
import { METHOD_SHORT, RAIL_LABEL, dayLabel, fmtGbp, fmtGbpShort, fmtInt, fmtMinute, fmtPct, plural } from "../lib/format";
import { accountsParquet, txParquet } from "../lib/gen/parquet";
import { accountsCsv, caseLegsCsv, partiesCsv, txCsv } from "../lib/gen/csv";
import { messageText, renderMessage } from "../lib/gen/message";
import { makeCalendar } from "../lib/gen/calendar";

/* Make data on two levels (docs/UX_RESEARCH.md). Level one: choose a bank
   type, read what you get, make it, then read what you got and go on to Test
   rules. Level two: every other dial, the exact values, the risk assessment,
   the rails and amounts, the transaction log, the downloads. */

const CONTENTS: ContentsItem[] = [
  { id: "type", n: "1", title: "Choose a bank type" },
  { id: "get", n: "2", title: "What you get" },
  { id: "adjust", n: "3", title: "Adjust the bank" },
  { id: "made", n: "4", title: "What you got" },
];

function download(name: string, text: string | ArrayBuffer, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** The text a host page may replace. Each default is the text of the generator page, and the working app passes its own. */
export interface GenerateText {
  next: { href: string; title: string; line: string };
  nextSentence: string;
  downloadNote: string;
}

const DEFAULT_TEXT: GenerateText = {
  next: { href: "https://github.com/JinaJaundice/touchstone-generator#the-labels", title: "Apply your own rules to this data", line: "Download the files, drop the label columns, run your rules or your model, and mark the result against the labels." },
  nextSentence: "the downloads are at the end of it",
  downloadNote: "The transaction file carries every column of the AMLGentex tx_log, and more.",
};

export function Generate({ text }: { text?: Partial<GenerateText> } = {}) {
  const copy = { ...DEFAULT_TEXT, ...text };
  const s = useStore();
  const ds = s.dataset;
  const [logFilter, setLogFilter] = useState<"random" | "all" | "pattern" | "fraud" | "crypto">("random");
  const [draw, setDraw] = useState(0);
  /** the row opened as a message: the transaction as it would read in the bank's messaging format */
  const [picked, setPicked] = useState<number | null>(null);
  const message = useMemo(() => (ds && picked !== null && ds.txs[picked] ? renderMessage(ds.txs[picked], ds) : null), [ds, picked]);
  const cal = useMemo(() => ds ? makeCalendar(ds.config.period ?? 1, ds.config.days) : null, [ds]);

  const sample = useMemo(() => {
    if (!ds) return [] as Tx[];
    if (logFilter === "random") {
      // thirty rows drawn at random from the whole log, a new draw on every press: the under-the-hood view of what was made
      const live = ds.txs.length;
      const seen = new Set<number>();
      const out: Tx[] = [];
      let guard = 0;
      while (out.length < Math.min(30, live) && guard++ < 10000) {
        const i = Math.floor(Math.random() * live);
        if (seen.has(i) || ds.txs[i].type === "INITIAL") continue;
        seen.add(i); out.push(ds.txs[i]);
      }
      return out.sort((a, b) => a.day - b.day || a.minute - b.minute);
    }
    const pick = (t: Tx) => logFilter === "all" ? t.type !== "INITIAL" : logFilter === "pattern" ? t.patternId >= 0 : logFilter === "fraud" ? t.family === "fraud" : t.rail === "CRYPTO";
    const out: Tx[] = [];
    for (const t of ds.txs) { if (pick(t)) { out.push(t); if (out.length >= 30) break; } }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draw is the button that asks for another thirty
  }, [ds, logFilter, draw]);

  const amounts = useMemo(() => {
    if (!ds) return { all: [] as number[], marked: [] as number[] };
    const all: number[] = [], marked: number[] = [];
    const step = Math.max(1, Math.floor(ds.txs.length / 40000));
    for (let i = 0; i < ds.txs.length; i += step) { const t = ds.txs[i]; if (t.type !== "INITIAL") all.push(t.amount); }
    for (const t of ds.txs) if (t.patternId >= 0) marked.push(t.amount);
    return { all, marked };
  }, [ds]);

  const typRows = useMemo(() => ds ? Object.entries(ds.summary.byTypology).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.instances - a.instances) : [], [ds]);
  const caseList = useMemo(() => (ds ? listCases(ds) : []), [ds]);
  const caseCount = caseList.length;
  const shownCase = useMemo(() => pickCase(caseList), [caseList]);
  const shownView = useMemo(() => (ds && shownCase ? caseView(ds, shownCase.caseId) : null), [ds, shownCase]);
  const shownCounts = useMemo(() => (shownView && shownView.parties.some((p) => p.part !== null) ? ledgerCounts(shownView) : null), [shownView]);
  const libraryCases = ds?.summary.library?.cases ?? 0;
  const cust = (i: number, t?: Tx) => i === -2 ? (t?.type === "INCOME" ? "outside (credit)" : "outside") : i === -1 ? (t?.type === "SPEND" ? "merchant" : t?.type === "CASH_OUT" ? "cash" : "outside") : i <= -1000 ? (t?.wallet ? t.wallet.slice(0, 10) + "…" : "wallet") : ds?.accounts[i]?.customerId ?? String(i);

  return (
    <Doc contents={CONTENTS}>
      <PageHead title="Build the bank, then make the data"
        sub="Pick a bank type, read what you get, make the data. Every other dial is one row down. Every make draws a new seed number, so no two data sets are alike; pin the seed number to repeat one exactly." />

      <BankBuilder />

      <Section id="made" n="4" title={ds ? "What you got" : "What you got"} sub={ds ? `${ds.config.name}, seed number ${ds.config.seed}${s.genMs !== null ? `, made in ${(s.genMs / 1000).toFixed(1)} seconds` : ""}. Every planted transaction is labelled with its crime pattern. The rest of this section is the data set in detail; ${copy.nextSentence}.` : "Appears here once the data is made."}>
        {ds ? (
          <>
            <StatBand items={[
              { label: "accounts", value: fmtInt(ds.summary.accounts), sub: `${fmtInt(ds.summary.newAccounts)} opened during the run` },
              { label: "transactions", value: fmtInt(ds.summary.txs), sub: `${ds.summary.days} days, ${fmtGbpShort(ds.summary.totalValue)} moved` },
              { label: "crime patterns planted", value: fmtInt(ds.summary.patterns), sub: `${Object.keys(ds.summary.byTypology).length} kinds of pattern${libraryCases > 0 ? `, ${plural(libraryCases, "library case")}` : ""}` },
              { label: "accounts used for laundering", value: fmtInt(ds.summary.sarAccounts), sub: fmtPct(ds.summary.sarAccounts / ds.summary.accounts, 1) + " of all accounts", tone: "missed" },
              { label: "fraud victims and mules", value: fmtInt(ds.summary.fraudAccounts), tone: "noise" },
            ]} />
            <Card title="A planted case, drawn">
              {shownView && cal ? (
                <>
                  <p className="faint" style={{ marginTop: 0 }}>{shownView.title}, case {shownView.caseId}, one of {fmtInt(caseCount)} planted cases. It has {plural(shownView.rows.length, "payment")} between {plural(shownView.parties.length, "party", "parties")} and moved {fmtGbp(shownView.value)}.{shownCounts && ` The ledger draws ${fmtInt(shownCounts.drawn)} of its payments in ${plural(shownCounts.columns, "column")} and folds the other ${fmtInt(shownCounts.folded)} into buttons that open each long step.`}</p>
                  <FlowLedger view={shownView} shown={null} cal={cal} />
                </>
              ) : <p style={{ marginTop: 0 }}>No crime pattern was planted in this data set.</p>}
              <p><a className="link" href="#/data/patterns">See every pattern and step through a case</a></p>
            </Card>
            <Disclosure id="patterns" title="The planted crime patterns" sub="each kind, how many were planted, and the accounts, transactions and value they carry" count={`${fmtInt(ds.summary.patterns)} patterns`}>
              <div className="tbl-wrap" tabIndex={0}>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Crime pattern</th><th className="num">Planted</th><th className="num">Accounts</th><th className="num">Transactions</th><th className="num">Value</th></tr></thead>
                  <tbody>
                    {typRows.map((r) => (
                      <tr key={r.key}><td><FamilyDot k={r.key} /><a className="link" href={"#/data/patterns/" + (libraryIdOf(r.key) ?? r.key)}>{patternShort(r.key)}</a></td><td className="num val">{r.instances}</td><td className="num val">{r.accounts}</td><td className="num val">{r.txs}</td><td className="num val">{fmtGbpShort(r.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="legend">{FAMILY_ORDER.filter((f) => typRows.some((r) => patternFamily(r.key) === f)).map((f) => <span key={f}><span className={`dot ${familyTone(f)}`} />{FAMILY_WORD[f]}</span>)}</div>
            </Disclosure>
            <Disclosure id="shape" title="Rails and amounts" sub="how the transactions split by rail, and where the planted ones sit among all the amounts" count={`${Object.keys(ds.summary.byRail).length} rails`}>
              <div className="grid cols-2">
                <Card title="Transactions by rail">
                  <BarList rows={Object.entries(ds.summary.byRail).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: RAIL_LABEL[k] ?? k, total: v }))} format={fmtInt} />
                </Card>
                <Card title="Amounts: all transactions against the planted ones" foot={`Each step to the right is ten times the amount. The typical transaction is ${fmtGbp(ds.summary.amountPercentiles.p50)}; 99 in 100 are under ${fmtGbp(ds.summary.amountPercentiles.p99)}.`}>
                  <LogHistogram all={amounts.all} marked={amounts.marked} />
                  <div className="legend"><span><i className="sw" style={{ background: "var(--slate-fill)", opacity: .45 }} />all transactions, sampled</span><span><i className="sw" style={{ background: "var(--gold-fill)" }} />planted transactions</span></div>
                </Card>
              </div>
            </Disclosure>
            <Disclosure id="log" title="The transaction log, under the hood" sub="thirty rows at random, or the first thirty of a kind; the full log is in the download" count="30 rows">
              <p className="faint" style={{ marginTop: 0, marginBottom: 8 }}>Seed number <span className="val">{ds.config.seed}</span>, fingerprint <span className="val">{s.fingerprint ?? "…"}</span>. A new make gives new rows unless the seed number is pinned.</p>
              <div className="btn-row" style={{ marginTop: 0, marginBottom: 10 }}><Seg size="sm" label="Which transactions to show" value={logFilter} onChange={setLogFilter} options={[{ key: "random", label: "Thirty at random" }, { key: "pattern", label: "Planted transactions" }, { key: "fraud", label: "Fraud" }, { key: "crypto", label: "Crypto" }, { key: "all", label: "Everything" }]} />{logFilter === "random" && <Button small onClick={() => setDraw((d) => d + 1)}>Another thirty</Button>}</div>
              <div className="tbl-wrap" tabIndex={0}>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Day</th><th>Time</th><th>Type</th><th>Rail</th><th>From</th><th>To</th><th className="num">Amount</th><th>Country</th><th>Flags</th><th>Planted crime</th><th><span className="sr-only">Open as a message</span></th></tr></thead>
                  <tbody>
                    {sample.map((t) => (
                      <Fragment key={t.id}>
                      <tr>
                        <td className="val">{cal ? dayLabel(cal.date(t.day), cal.weekday(t.day)) : t.day + 1}</td><td className="val">{fmtMinute(t.minute)}</td><td>{t.type.toLowerCase().replace("_", " ")}</td><td>{RAIL_LABEL[t.rail] ?? t.rail}{METHOD_SHORT[t.method] ? <span className="faint">, {METHOD_SHORT[t.method]}</span> : null}{t.rail === "INTL" && t.currency !== "GBP" ? <span className="faint"> in {t.currency}</span> : null}</td>
                        <td className="val">{cust(t.orig, t)}</td><td className="val">{cust(t.dest, t)}</td><td className="num val">{fmtGbp(t.amount)}</td><td className="val">{t.country}</td>
                        <td className="flags">{t.status === "declined" && <Pill tone="noise">declined</Pill>}{t.newPayee && <Pill>first payment</Pill>}{t.session?.newDevice && <Pill tone="noise">new device</Pill>}{t.session?.callActive && <Pill tone="noise">on a call</Pill>}{t.session?.remoteAccess && <Pill tone="noise">remote access</Pill>}{(t.payee?.cop === "no-match" || t.payee?.cop === "close-match") && <Pill tone="noise">name {t.payee.cop === "no-match" ? "no match" : "close match"}</Pill>}{t.recentCredentialChange && <Pill tone="noise">details changed</Pill>}{t.card?.mcc && <Pill>MCC {t.card.mcc}</Pill>}{t.crypto && t.crypto.label === "illicit" && <Pill tone="missed">wallet labelled illicit</Pill>}{t.crypto?.label === "listed" && <Pill tone="missed">on OFAC's list</Pill>}</td>
                        <td>{t.typology ? <Pill tone="missed">{patternShort(t.typology)}</Pill> : <span className="faint">ordinary</span>}</td>
                        <td><button type="button" className="link-btn" onClick={() => setPicked(picked === t.id ? null : t.id)} aria-expanded={picked === t.id}>{picked === t.id ? "Close" : "Message"}</button></td>
                      </tr>
                      {picked === t.id && message && (
                        <tr className="message-row"><td colSpan={11}>
                <div className="message" aria-live="polite">
                  <div className="message-head">
                    <div><b>{message.title}</b><span className="faint"> · {message.format}</span></div>
                    <div className="btn-row" style={{ margin: 0 }}>
                      <button type="button" className="link-btn" onClick={() => { void navigator.clipboard?.writeText(messageText(message)); }}>Copy as text</button>
                      <button type="button" className="link-btn" onClick={() => setPicked(null)}>Close</button>
                    </div>
                  </div>
                  <dl className="message-fields">
                    {message.lines.map((l) => <div key={l.tag}><dt>{l.tag}</dt><dd className="val">{l.value}</dd></div>)}
                  </dl>
                  <p className="message-foot"><span>Touchstone knows, the bank would not: <b>{message.truth}</b>.</span><span className="faint">{message.provenance}</span></p>
                </div>
                        </td></tr>
                      )}
                      </Fragment>
                    ))}
                    {sample.length === 0 && <tr><td colSpan={11}><Empty>Nothing matches this filter in the current data set.</Empty></td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="faint" style={{ marginTop: 8 }}>Message opens a row as it would read in the bank's own format. A payment reads as an ISO 20022 credit transfer, a card payment as the card scheme's fields, cash as a teller record, crypto as an on-chain transfer. Every value is the record's own.</p>
            </Disclosure>
            <Disclosure id="download" title="Download the files" sub="transactions and accounts as a CSV file or a Parquet file, the planted patterns, and the settings that make this data set again" count={libraryCases > 0 ? "8 files" : "6 files"}>
              <div className="dl-list">
                <button type="button" className="dl" onClick={() => download(`touchstone-transactions-${ds.config.seed}.csv`, txCsv(ds), "text/csv")}><b>Transactions</b><span>a CSV file, {fmtInt(ds.txs.length)} rows, every field including which ones are planted crime</span></button>
                <button type="button" className="dl" onClick={() => download(`touchstone-accounts-${ds.config.seed}.csv`, accountsCsv(ds), "text/csv")}><b>Accounts</b><span>a CSV file, {fmtInt(ds.accounts.length)} rows with segment, tier, declared activity and which ones are planted crime</span></button>
                <button type="button" className="dl" onClick={async () => download(`touchstone-transactions-${ds.config.seed}.parquet`, await txParquet(ds), "application/vnd.apache.parquet")}><b>Transactions as Parquet</b><span>the same {fmtInt(ds.txs.length)} rows and columns as a Parquet file, the column format a data team loads into a warehouse</span></button>
                <button type="button" className="dl" onClick={async () => download(`touchstone-accounts-${ds.config.seed}.parquet`, await accountsParquet(ds), "application/vnd.apache.parquet")}><b>Accounts as Parquet</b><span>the same {fmtInt(ds.accounts.length)} rows and columns as a Parquet file</span></button>
                <button type="button" className="dl" onClick={() => download(`touchstone-patterns-${ds.config.seed}.json`, JSON.stringify(ds.patterns, null, 1), "application/json")}><b>Planted crime patterns</b><span>a JSON file, {fmtInt(ds.patterns.length)} patterns with members, period and value</span></button>
                <button type="button" className="dl" onClick={() => download(`touchstone-settings-${ds.config.seed}.json`, JSON.stringify(ds.config, null, 2), "application/json")}><b>Settings</b><span>a JSON file with everything needed to make this exact data set again</span></button>
                {libraryCases > 0 && (
                  <>
                    <button type="button" className="dl" onClick={() => download(`touchstone-case-payments-${ds.config.seed}.csv`, caseLegsCsv(ds), "text/csv")}><b>Case payments</b><span>a CSV file, {fmtInt(ds.summary.library?.legs ?? 0)} rows, each planned payment of each library case, in order</span></button>
                    <button type="button" className="dl" onClick={() => download(`touchstone-parties-${ds.config.seed}.csv`, partiesCsv(ds), "text/csv")}><b>Parties</b><span>a CSV file, {fmtInt(ds.parties.length)} rows, each party of each library case</span></button>
                  </>
                )}
              </div>
              <p className="faint" style={{ marginTop: 10 }}>{copy.downloadNote}</p>
              {libraryCases > 0 && <p className="faint" style={{ marginTop: 4 }}>The payments outside the bank's records belong to planted cases only. They are no record of a whole chain.</p>}
            </Disclosure>
            <NextStep href={copy.next.href} title={copy.next.title} line={copy.next.line} />
          </>
        ) : <Working label={s.generating ? `Making the data: ${s.generating.stage}` : "No data yet"} />}
      </Section>
    </Doc>
  );
}

function FamilyDot({ k }: { k: string }) {
  return <span className={`dot ${familyTone(patternFamily(k))}`} style={{ marginRight: 8 }} />;
}
