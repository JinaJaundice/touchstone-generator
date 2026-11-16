// The ledger of a planted case: who paid whom, step by step, as a ruled table with one line for each payment.
// It reads the case view of lib/gen/caseView.ts and nothing from the working app, so the public copy can carry it.

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DRAWN_COLUMNS, caseSteps, flowColumns, ledgerDotY, memberRef, splitShortAddress, partyName, stepTitle, withinLabel, type CaseView, type FlowLeg, type FlowParty } from "./gen/caseView";
import type { Calendar } from "./gen/calendar";
import { METHOD_SHORT, RAIL_LABEL, dayLabel, fmtGbp, fmtMinute, plural } from "./format";
import { Button, Empty } from "./ui";

export { flowColumns, pickCase } from "./gen/caseView";

/** The words that a row gives for what can see a payment. */
const SEEN_WORD: Record<FlowLeg["seenBy"], string> = { bank: "in the bank's records", chain: "on a chain", none: "off the record" };
/** A step of more than this many payments is folded to its first 3 payments and its last payment. */
const FOLD_OVER = 6;
/** The height of the line in a cell, from the top of the row. */
const LINE_Y = "64%";
/** The height of the dot in a row whose payer and payee share a column, lower so that a label of 2 lines does not meet it. */
const DOT_Y_SHARED = "86%";
/** A ledger narrower than this many pixels is the compact form. */
const COMPACT_UNDER = 560;
/** A ledger at least this many pixels wide is drawn, where it has at most DRAWN_COLUMNS columns and the wrapper holds 330 pixels and this many for each column. */
const DRAWN_FROM = 720;
const DRAWN_COLUMN = 88;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A sentence with a full stop at its end. */
const stop = (s: string) => (s.endsWith(".") ? s : s + ".");

/** The width in pixels of an element, kept up to date while it is on the page. Before a width is known it is 1000. */
function useWidth(ref: { current: HTMLElement | null }, on: boolean): number {
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    setWidth(el.getBoundingClientRect().width);
    const watch = new ResizeObserver((entries) => { const e = entries[entries.length - 1]; if (e) setWidth(e.contentRect.width); });
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref, on]);
  return width;
}

/** The short name that a row shows for a party in a shared column, and the full address for its title. */
function nameOf(p: FlowParty): { text: string; title?: string } {
  return { text: memberRef(p), title: p.address ?? undefined };
}

/** The When cell: the date, and the time in the faint style under it. */
function WhenCell({ leg, cal }: { leg: FlowLeg; cal: Calendar }) {
  return <td>{dayLabel(cal.date(leg.day), cal.weekday(leg.day))}<span className="flow-sub val">{fmtMinute(leg.minute)}</span></td>;
}

/** The rail and the method of a payment in words, such as "Faster Payments, standing order". */
function howText(leg: FlowLeg): string {
  if (leg.how === "off-record") return "A private deal";
  const method = METHOD_SHORT[leg.how];
  return `${RAIL_LABEL[leg.rail] ?? leg.rail}${method ? `, ${method}` : ""}`;
}

/** The How cell: the rail and the method, and who can see the payment under them. */
function HowCell({ leg }: { leg: FlowLeg }) {
  return <td>{howText(leg)}<span className="flow-sub">{SEEN_WORD[leg.seenBy]}</span></td>;
}

/** The Amount cell: the amount, or the words for a declined payment or one that did not happen. */
function AmountCell({ leg }: { leg: FlowLeg }) {
  const none = leg.planned !== null && leg.amount === 0;
  return (
    <td className="num val flow-amount">
      {none ? "did not happen" : fmtGbp(leg.amount)}
      {none && <span className="flow-sub">planned {fmtGbp(leg.planned as number)}</span>}
      {leg.declined && !none && <span className="flow-sub">declined</span>}
    </td>
  );
}

/** A name with its short address, such as "bc1q09…64dk", in an element that does not wrap, so the address never breaks after its dots. */
function NameText({ name }: { name: string }) {
  const { head, address } = splitShortAddress(name);
  return address ? <>{head}<span className="flow-ref">{address}</span></> : <>{name}</>;
}

/** The name of a party for a row of the text form and the compact form, with the full address for its title. */
function PartyName({ p, mid }: { p: FlowParty; mid?: boolean }) {
  const name = partyName(p);
  return <span title={p.address ?? undefined}><NameText name={mid ? name.charAt(0).toLowerCase() + name.slice(1) : name} /></span>;
}

/** One payment of the drawn form: the line from the payer's column to the payee's column. A party with no column draws no line. */
function DrawnRow({ leg, cols, at, byKey, cal }: { leg: FlowLeg; cols: ReturnType<typeof flowColumns>; at: Map<string, number>; byKey: Map<string, FlowParty>; cal: Calendar }) {
  const n = cols.length;
  const fi = at.get(leg.from);
  const ti = at.get(leg.to);
  const pct = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const from = byKey.get(leg.from);
  const to = byKey.get(leg.to);
  const both = fi !== undefined && ti !== undefined;
  // where the payer and the payee share a column no line runs between columns, so the dot sits low enough to clear a label of 2 lines
  const y = ledgerDotY(fi, ti, LINE_Y, DOT_Y_SHARED);
  return (
    <tr>
      <WhenCell leg={leg} cal={cal} />
      <HowCell leg={leg} />
      {cols.map((c, i) => {
        const pays = i === fi;
        const gets = i === ti;
        let name: { text: string; title?: string } | null = null;
        if ((pays || gets) && from && to) {
          if (pays && gets) {
            // One column holds both ends and no arrow can show the direction, so the words say who pays whom.
            // The label is empty for a party with no reference, and the dot and the text for a screen reader remain.
            name = { text: withinLabel(from, to), title: [from.address, to.address].filter(Boolean).join(" to ") || undefined };
          } else if (c.count > 1) name = nameOf(pays ? from : to);
        }
        return (
          <td className="flow-cell" key={c.key}>
            {i === 0 && (
              <svg className="flow-draw" aria-hidden="true" style={{ width: `calc(${n} * 100%)` }}>
                {both && fi !== ti && <line className={"flow-line seen-" + leg.seenBy} x1={pct(fi)} x2={pct(ti)} y1={y} y2={y} />}
                {fi !== undefined && <svg x={pct(fi)} y={y} overflow="visible"><circle className="flow-end" r="2.5" /></svg>}
                {both && fi !== ti && (
                  <svg x={pct(ti)} y={y} overflow="visible">
                    <path className="flow-end" d={ti > fi ? "M-8,-3.5 L0,0 L-8,3.5 Z" : "M8,-3.5 L0,0 L8,3.5 Z"} />
                  </svg>
                )}
              </svg>
            )}
            {pays && <span className="sr-only">pays{to ? " " + partyName(to) : ""} </span>}
            {gets && <span className="sr-only">is paid by{from ? " " + partyName(from) : ""}</span>}
            {name && name.text && <span className="flow-name" title={name.title}>{name.text}</span>}
          </td>
        );
      })}
      <AmountCell leg={leg} />
    </tr>
  );
}

/** The words for a payment that has the same party on both sides: the funds change hands at that party. */
function sameParty(leg: FlowLeg, p: FlowParty) {
  const name = partyName(p);
  return <>{leg.how === "off-record" ? "The funds change hands at " : "A payment within "}<span title={p.address ?? undefined}><NameText name={name.charAt(0).toLowerCase() + name.slice(1)} /></span></>;
}

/** One payment of the text form. */
function TextRow({ leg, byKey, cal }: { leg: FlowLeg; byKey: Map<string, FlowParty>; cal: Calendar }) {
  const from = byKey.get(leg.from);
  const to = byKey.get(leg.to);
  const same = !!from && leg.from === leg.to;
  return (
    <tr>
      <WhenCell leg={leg} cal={cal} />
      <HowCell leg={leg} />
      {same ? <td colSpan={2}>{sameParty(leg, from)}</td> : <>
        {from ? <td><PartyName p={from} /></td> : <td />}
        {to ? <td><PartyName p={to} /></td> : <td />}
      </>}
      <AmountCell leg={leg} />
    </tr>
  );
}

/** One payment of the compact form: the date and time, the payer and the payee, and the rail with who records it, then the amount. */
function CompactRow({ leg, byKey, cal }: { leg: FlowLeg; byKey: Map<string, FlowParty>; cal: Calendar }) {
  const from = byKey.get(leg.from);
  const to = byKey.get(leg.to);
  return (
    <tr>
      <td>
        <span className="flow-l1 val">{dayLabel(cal.date(leg.day), cal.weekday(leg.day))}, {fmtMinute(leg.minute)}</span>
        <span className="flow-l2">{from && leg.from === leg.to ? sameParty(leg, from) : <>{from ? <PartyName p={from} /> : null} to {to ? <PartyName p={to} mid /> : null}</>}</span>
        <span className="flow-sub">{howText(leg)}, {SEEN_WORD[leg.seenBy]}</span>
      </td>
      <AmountCell leg={leg} />
    </tr>
  );
}

/** The key to the line styles and the mark of an account of the bank. */
export function FlowLegend() {
  return (
    <div className="legend flow-legend">
      {(["bank", "chain", "none"] as const).map((k) => (
        <span key={k}>
          <svg aria-hidden="true" viewBox="0 0 44 8"><line className={"flow-line seen-" + k} x1="1" x2="43" y1="4" y2="4" /></svg>
          {SEEN_WORD[k]}
        </span>
      ))}
      <span><span className="dot dot-muted" />an account at this bank</span>
    </div>
  );
}

/**
 * The ledger of one case, grouped by step, in one of 3 forms that its own width chooses. It is compact where it is under
 * 560 pixels wide, drawn (with a line from payer to payee in the party columns and a key under the table) where it is at
 * least 720 pixels wide, has at most DRAWN_COLUMNS (8) columns and holds 88 pixels for each of them, and a table of text in every other case. `shown` is the number
 * of steps drawn from the first, and null draws every step.
 */
export function FlowLedger({ view, shown, cal }: { view: CaseView; shown: number | null; cal: Calendar }) {
  const wrap = useRef<HTMLDivElement>(null);
  const empty = view.rows.length === 0;
  const width = useWidth(wrap, !empty);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const cols = useMemo(() => (empty ? [] : flowColumns(view)), [view, empty]);
  const all = useMemo(() => caseSteps(view), [view]);
  const maps = useMemo(() => {
    const byKey = new Map<string, FlowParty>();
    for (const p of view.parties) byKey.set(p.key, p);
    const at = new Map<string, number>();
    cols.forEach((c, i) => c.parties.forEach((k) => at.set(k, i)));
    return { byKey, at };
  }, [view, cols]);
  if (empty) return <Empty>This case has no payment in the data set.</Empty>;

  const form: "compact" | "drawn" | "text" = width < COMPACT_UNDER ? "compact" : width >= Math.max(DRAWN_FROM, 330 + cols.length * DRAWN_COLUMN) && cols.length <= DRAWN_COLUMNS ? "drawn" : "text";
  const drawn = form === "drawn";
  const { byKey, at } = maps;
  const steps = shown === null ? all : all.slice(0, Math.max(0, shown));
  const span = drawn ? cols.length + 3 : form === "compact" ? 2 : 5;
  const toggle = (id: string) => setOpened((s) => { const t = new Set(s); if (!t.delete(id)) t.add(id); return t; });
  const line = (leg: FlowLeg) => drawn
    ? <DrawnRow key={leg.seq} leg={leg} cols={cols} at={at} byKey={byKey} cal={cal} />
    : form === "compact"
      ? <CompactRow key={leg.seq} leg={leg} byKey={byKey} cal={cal} />
      : <TextRow key={leg.seq} leg={leg} byKey={byKey} cal={cal} />;

  return (
    <>
      <p className="flow-read">
        {drawn
          ? "Each row is one payment of the case. Its line runs from the party that pays, at the dot, to the party that is paid, at the arrowhead. A column holds one party, or a group of similar parties." + (cols.some((c) => c.count > 1) ? " Inside a shared column, a label gives the last 4 characters of the address of the wallet that pays and of the wallet that is paid." : "")
          : "Each row is one payment of the case, from the party that pays to the party that is paid. A party is an account at this bank or someone outside it."}
      </p>
      <div className="tbl-wrap" tabIndex={0} ref={wrap} role="region" aria-label={view.caseId < 0 ? "The payments of the typical case" : `The payments of case ${view.caseId}`}>
        <table className={"tbl flow" + (drawn ? "" : " flow-text") + (form === "compact" ? " flow-compact" : "")} style={drawn ? ({ "--flow-cols": cols.length } as CSSProperties) : undefined}>
          <caption className="sr-only">{view.title}, {plural(view.rows.length, "payment")} and {plural(view.parties.length, "party", "parties")}</caption>
          {drawn && (
            <colgroup>
              <col className="flow-c-when" />
              <col className="flow-c-how" />
              {cols.map((c) => <col key={c.key} />)}
              <col className="flow-c-amount" />
            </colgroup>
          )}
          <thead>
            <tr>
              {form === "compact" ? <th scope="col">Payment</th> : <><th scope="col">When</th><th scope="col">How</th></>}
              {drawn
                ? cols.map((c) => (
                    <th scope="col" className="flow-party" key={c.key} title={c.count === 1 ? byKey.get(c.parties[0])?.address ?? undefined : undefined}>
                      {byKey.get(c.parties[0])?.account != null && <span className="dot dot-muted" />}{c.label}
                      {c.detail && <span className="flow-detail">{c.detail}</span>}
                    </th>
                  ))
                : form === "text" ? <><th scope="col">From</th><th scope="col">To</th></> : null}
              <th scope="col" className="num">Amount</th>
            </tr>
          </thead>
          {steps.map((s, k) => {
            const id = `${view.caseId}/${s.step}`;
            const long = s.rows.length > FOLD_OVER;
            const open = opened.has(id);
            return (
              <tbody key={s.step}>
                <tr className="flow-step">
                  <th scope="rowgroup" colSpan={span}>
                    <span className="caps">Step {k + 1}</span><span className="flow-title">{stepTitle(s.step)}.</span><span className="flow-say">{stop(capital(s.say))}</span><span className="faint">{plural(s.rows.length, "payment")}</span>
                  </th>
                </tr>
                {long
                  ? <Fragment>
                      {s.rows.slice(0, 3).map(line)}
                      <tr className="flow-more">
                        <td colSpan={span}>
                          <button type="button" className="link-btn" aria-expanded={open} onClick={() => toggle(id)}>
                            {open ? "Show fewer payments of this step" : `Show the other ${s.rows.length - 4} payments of this step`}
                          </button>
                        </td>
                      </tr>
                      {open ? s.rows.slice(3).map(line) : line(s.rows[s.rows.length - 1])}
                    </Fragment>
                  : s.rows.map(line)}
              </tbody>
            );
          })}
        </table>
      </div>
      {drawn && <FlowLegend />}
    </>
  );
}

/** What the ledger of a case draws with every step shown: the payments in its rows, the payments that its long steps fold behind a button, and its columns. */
export function ledgerCounts(view: CaseView): { drawn: number; folded: number; columns: number } {
  let folded = 0;
  for (const s of caseSteps(view)) if (s.rows.length > FOLD_OVER) folded += s.rows.length - 4;
  return { drawn: view.rows.length - folded, folded, columns: view.rows.length ? flowColumns(view).length : 0 };
}

/** A button of the step controls. It stays on the keyboard focus where it cannot act, and a press then does nothing. */
function StepButton({ can, onPress, children }: { can: boolean; onPress: () => void; children: string }) {
  return <button type="button" className="btn btn-sm" aria-disabled={can ? undefined : "true"} onClick={() => { if (can) onPress(); }}>{children}</button>;
}

/** The row of buttons that steps through a case: "Previous step", "Next step", "Show every step" and then the text. It shows nothing for a case of one step. */
export function StepControls({ steps, shown, onShown }: { steps: number; shown: number | null; onShown: (n: number | null) => void }) {
  if (steps < 2) return null;
  const all = shown === null;
  return (
    <div className="flow-controls">
      <StepButton can={all || shown > 1} onPress={() => onShown(all ? steps - 1 : (shown as number) - 1)}>Previous step</StepButton>
      <StepButton can={!all && shown < steps} onPress={() => onShown((shown ?? steps) + 1)}>Next step</StepButton>
      <Button small kind="ghost" onClick={() => onShown(null)}>Show every step</Button>
      <span aria-live="polite">{all ? `All ${plural(steps, "step")}` : `Step ${shown} of ${steps}`}</span>
    </div>
  );
}
