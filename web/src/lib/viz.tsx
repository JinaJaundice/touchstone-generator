/* Chart forms for the assay ledger, each chosen from its message
   (docs/DESIGN_v2_BRIEF.md, "Chart forms, by message"):
   - the touch strip: a share, drawn as a streak on the stone;
   - the assay matrix: which rules caught which patterns, ending on the miss;
   - the ruled line chart: what happens across a range of settings;
   - the ledger bar list: a ranked set with a part;
   - ruled histograms and scales.
   Charts sit on the page in the page's type. Horizontal gridlines only,
   labels on the lines, lines labelled at their ends, no legend boxes, no
   gradients, no floating tooltips: a readout line under the chart instead.
   The one motion is the streak drawing in once; reduced motion draws it at
   once (styles.css). Nothing carries a raw colour. */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Working } from "./ui";

/** The dot colour for each family of crime, the same on every page. */
export const familyTone = (f: string) => f === "fraud" ? "dot-noise" : f === "crypto" ? "dot-brand" : f === "mule" ? "dot-mule" : f === "sanctions" ? "dot-missed" : "dot-muted";
/** The family's name in a legend. */
export const FAMILY_WORD: Record<string, string> = { aml: "laundering", mule: "mule accounts", fraud: "fraud", crypto: "crypto", sanctions: "sanctions" };
export const FAMILY_ORDER = ["aml", "mule", "fraud", "crypto", "sanctions"];

/* ------------------------------------------------------------ touch strip */

export type StreakTone = "gold" | "slate" | "claret" | "ash";
export interface StreakPart { value: number; tone: StreakTone; label: ReactNode }

/** The verdict as a streak on the stone. `big` is the share, `label` says
    what it is a share of, the parts are laid end to end across the whole. */
export function TouchStrip({ big, label, sub, parts, total, totalLabel, compact }: { big: ReactNode; label: ReactNode; sub?: ReactNode; parts: StreakPart[]; total: number; totalLabel: ReactNode; compact?: boolean }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setDrawn(true)); return () => cancelAnimationFrame(t); }, []);
  const t = Math.max(1, total);
  let x = 1;
  const segs = parts.map((p) => { const w = Math.max(0, 98 * p.value / t); const s = { left: x, width: w, tone: p.tone }; x += w + (w > 0 ? 0.3 : 0); return s; });
  const text = `${label}, ${parts.map((p) => `${p.value} ${typeof p.label === "string" ? p.label : ""}`).join(", ")} of ${total}`;
  return (
    <div className={`touch ${compact ? "touch-compact" : ""}`}>
      <div className="touch-fig"><b className="val">{big}</b><span>{label}</span>{sub && <small>{sub}</small>}</div>
      <div>
        <div className="stone" role="img" aria-label={text}>
          {segs.map((s, i) => <i key={i} className={`st-${s.tone}`} style={{ left: `${s.left}%`, width: drawn ? `${s.width}%` : 0 }} />)}
        </div>
        <div className="stone-l">
          {parts.map((p, i) => <span key={i} className={p.tone === "claret" ? "st-miss" : ""}>{i === 0 ? <b>{p.label}</b> : p.label}</span>)}
          <span><b>{totalLabel}</b></span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ assay matrix */

export interface MatrixRow { key: string; label: string; family: "aml" | "mule" | "fraud" | "crypto" | "sanctions"; instances: number; caught: number; byRule: Record<string, number> }
export interface MatrixCol { key: string; label: string; code: string }

/** One row per planted crime pattern, one column per rule, a gold square
    whose side grows with the count, and the miss in a claret column at the
    right. Rows are ordered so a pattern sits near the rule that catches most
    of it, and columns by how much they catch. */
export function AssayMatrix({ rows, cols }: { rows: MatrixRow[]; cols: MatrixCol[] }) {
  const [hot, setHot] = useState<{ r?: string; c?: string } | null>(null);
  const model = useMemo(() => {
    const total = (c: MatrixCol) => rows.reduce((a, r) => a + (r.byRule[c.key] ?? 0), 0);
    const used = cols.filter((c) => total(c) > 0).sort((a, b) => total(b) - total(a));
    const idx = new Map(used.map((c, i) => [c.key, i]));
    const centre = (r: MatrixRow) => {
      let w = 0, s = 0;
      for (const [k, v] of Object.entries(r.byRule)) { const i = idx.get(k); if (i !== undefined && v > 0) { w += v; s += v * i; } }
      const missed = Math.max(0, r.instances - r.caught);
      if (missed > 0) { w += missed; s += missed * used.length; }
      return w ? s / w : used.length;
    };
    const ordered = [...rows].filter((r) => r.instances > 0).sort((a, b) => centre(a) - centre(b) || b.instances - a.instances);
    const max = Math.max(1, ...ordered.flatMap((r) => [...Object.values(r.byRule), r.instances - r.caught]));
    const missedTotal = ordered.reduce((a, r) => a + Math.max(0, r.instances - r.caught), 0);
    return { used, ordered, max, missedTotal };
  }, [rows, cols]);
  const side = (n: number) => n <= 0 ? 0 : Math.max(5, Math.round(22 * Math.sqrt(n / model.max)));
  const hotRow = hot?.r ? model.ordered.find((r) => r.key === hot.r) : undefined;
  const hotCol = hot?.c === "__missed" ? null : hot?.c ? model.used.find((c) => c.key === hot.c) : undefined;
  let read: ReactNode = null;
  if (hotRow && hot?.c === "__missed") read = <><b>{hotRow.label}</b>: {hotRow.instances - hotRow.caught} of {hotRow.instances} planted patterns were missed by every rule.</>;
  else if (hotRow && hotCol) read = <><b>{hotCol.code} {hotCol.label}</b> caught {hotRow.byRule[hotCol.key] ?? 0} of the {hotRow.instances} <b>{hotRow.label}</b> patterns.</>;
  else if (hotRow) read = <><b>{hotRow.label}</b>: {hotRow.caught} of {hotRow.instances} caught{hotRow.instances - hotRow.caught > 0 ? `, ${hotRow.instances - hotRow.caught} missed` : ""}.</>;
  else if (hotCol) read = <><b>{hotCol.code} {hotCol.label}</b> caught {model.ordered.reduce((a, r) => a + (r.byRule[hotCol.key] ?? 0), 0)} planted patterns across {model.ordered.filter((r) => (r.byRule[hotCol.key] ?? 0) > 0).length} kinds.</>;
  else if (hot?.c === "__missed") read = <><b>{model.missedTotal}</b> planted patterns were missed by every rule.</>;
  const famTone = familyTone;
  const FAM_WORD = FAMILY_WORD;
  const present = FAMILY_ORDER.filter((f) => model.ordered.some((r) => r.family === f));
  return (
    <div onMouseLeave={() => setHot(null)}>
      <div className="matrix-wrap" tabIndex={0}>
        <table className="matrix" aria-label="which rules caught which planted crime patterns">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Crime pattern, caught of planted</span></th>
              {model.used.map((c) => <th key={c.key} scope="col" className={`col ${hot?.c === c.key ? "hot" : ""}`} onMouseEnter={() => setHot({ c: c.key })} title={`${c.code} ${c.label}`}><span>{c.label}</span></th>)}
              {model.missedTotal > 0 && <th scope="col" className={`col miss ${hot?.c === "__missed" ? "hot" : ""}`} onMouseEnter={() => setHot({ c: "__missed" })}><span>Missed by every rule</span></th>}
            </tr>
          </thead>
          <tbody>
            {model.ordered.map((r) => {
              const missed = Math.max(0, r.instances - r.caught);
              return (
                <tr key={r.key} className={hot?.r === r.key ? "hot" : ""}>
                  <td className="lbl" onMouseEnter={() => setHot({ r: r.key })}><small className={`val ${missed ? "m" : ""}`}>{r.caught}/{r.instances}</small><span className={`dot ${famTone(r.family)}`} aria-hidden />{r.label}</td>
                  {model.used.map((c) => { const n = r.byRule[c.key] ?? 0; const s = side(n); return <td key={c.key} className="cell" onMouseEnter={() => setHot({ r: r.key, c: c.key })} title={n ? `${c.code} caught ${n} of ${r.instances}` : undefined}>{s > 0 && <i style={{ width: s, height: s }} />}</td>; })}
                  {model.missedTotal > 0 && <td className="cell miss" onMouseEnter={() => setHot({ r: r.key, c: "__missed" })} title={missed ? `${missed} missed` : undefined}>{missed > 0 && <i className="m" style={{ width: side(missed), height: side(missed) }} />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mx-key"><span><i />caught by the rule in that column (the square grows with the count)</span><span><i className="m" />missed by every rule</span>{present.map((f) => <span key={f}><span className={`dot ${famTone(f)}`} style={{ marginRight: 6 }} />{FAM_WORD[f]}</span>)}</div>
      <div className="mx-read" aria-live="polite">{read ?? <span className="faint">Move over a row, a column or a square to read the count.</span>}</div>
    </div>
  );
}

/* ------------------------------------------------------------ bar list */

export interface BarRow { key: string; label: string; code?: string; total: number; part?: number; right?: string; sub?: string; selected?: boolean; dim?: boolean }

/** A ranked ledger: the name on one line, a bar under it (slate for the
    whole, gold for the part), the figure at the right. */
export function BarList({ rows, max, onSelect, format = (n) => String(n), partLabel, totalLabel }: {
  rows: BarRow[]; max?: number; onSelect?: (key: string) => void; format?: (n: number) => string; partLabel?: string; totalLabel?: string;
}) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.total));
  const Row = onSelect ? "button" : "div";
  return (
    <div className="barlist">
      {(partLabel || totalLabel) && (
        <div className="barlist-legend">
          {totalLabel && <span><i className="sw" style={{ background: "var(--slate-fill)", opacity: .5 }} />{totalLabel}</span>}
          {partLabel && <span><i className="sw" style={{ background: "var(--gold-fill)" }} />{partLabel}</span>}
        </div>
      )}
      {rows.map((r) => (
        <Row type={onSelect ? "button" : undefined} className={`barrow ${r.selected ? "sel" : ""} ${r.dim ? "dim" : ""} ${onSelect ? "clickable" : ""}`} key={r.key} onClick={onSelect ? () => onSelect(r.key) : undefined} aria-pressed={onSelect ? r.selected : undefined}>
          <span className="barrow-label">{r.code && <span className="code">{r.code}</span>}<span className="barrow-name">{r.label}</span></span>
          <span className="barrow-right val">{r.right ?? format(r.total)}</span>
          <span className="barrow-track" aria-hidden>
            <span className="barrow-total" style={{ width: `${Math.max(0.6, 100 * r.total / m)}%` }} />
            {r.part !== undefined && <span className="barrow-part" style={{ width: `${r.part > 0 ? Math.max(0.6, 100 * r.part / m) : 0}%` }} />}
          </span>
          {r.sub && <span className="barrow-sub">{r.sub}</span>}
        </Row>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ ruled line chart */

export interface SweepPt { multiplier: number; value: number; alerts: number; productive: number; precision: number; recall: number; hours: number }

/** What happens across the half-to-double range: two lines on ruled paper,
    all alerts in slate and the right ones in gold, labelled at their ends;
    the current setting as a dashed ink rule; a readout line under the chart
    that follows the pointer and rests on the current setting. */
export function SweepChart({ points, baselineIndex, unitLabel, height = 210 }: { points: SweepPt[]; baselineIndex: number; unitLabel: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, L = 34, R = 64, T = 16, B = 26;
  const maxA = Math.max(1, ...points.map((p) => p.alerts));
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / maxA) * (H - T - B);
  const line = (f: (p: SweepPt) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(" ");
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const i = hover ?? baselineIndex;
  const h = points[i];
  const last = points[points.length - 1];
  const ticks = [0, 0.5, 1].map((f) => Math.round(f * maxA));
  const labelA = y(last.alerts), labelP = Math.max(y(last.productive), labelA + 13);
  return (
    <div className="sweep-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="alerts at each threshold setting, from half to double the current one" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={L} y={y(t) - 4} fontSize="10" fill="var(--faint)" className="val">{t.toLocaleString("en-GB")}</text>
          </g>
        ))}
        <path d={line((p) => p.alerts)} fill="none" stroke="var(--slate-fill)" strokeWidth={1.6} strokeLinejoin="round" />
        <path d={line((p) => p.productive)} fill="none" stroke="var(--gold-fill)" strokeWidth={2.2} strokeLinejoin="round" />
        <text x={W - R + 6} y={labelA + 3.5} fontSize="10" fill="var(--slate)">all alerts</text>
        <text x={W - R + 6} y={labelP + 3.5} fontSize="10" fill="var(--gold)" fontWeight={600}>right</text>
        <line x1={x(baselineIndex)} x2={x(baselineIndex)} y1={T - 6} y2={H - B} stroke="var(--ink)" strokeDasharray="2 3" />
        <text x={x(baselineIndex) + 4} y={T - 7} fontSize="10" fill="var(--muted)">current setting</text>
        {hover !== null && hover !== baselineIndex && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--rule)" />}
        <circle cx={x(i)} cy={y(h.alerts)} r={3.5} fill="var(--paper)" stroke="var(--slate-fill)" strokeWidth={1.6} />
        <circle cx={x(i)} cy={y(h.productive)} r={3.5} fill="var(--paper)" stroke="var(--gold-fill)" strokeWidth={1.6} />
        {points.map((p, k) => (k % 2 === 0 || k === points.length - 1) && (
          <text key={k} x={x(k)} y={H - B + 14} fontSize="10" textAnchor="middle" fill="var(--faint)" className="val">{p.multiplier}x</text>
        ))}
        <text x={W - R} y={H - 2} fontSize="10" textAnchor="end" fill="var(--faint)">threshold as a multiple of the current one</text>
      </svg>
      <div className="readout" aria-live="polite">
        <span>at <b>{h.multiplier}x</b> ({unitLabel(h.value)})</span>
        <span><b>{h.alerts.toLocaleString("en-GB")}</b> alerts</span>
        <span><b>{h.productive.toLocaleString("en-GB")}</b> right</span>
        <span><b>{Math.round(h.precision * 100)}%</b> share right</span>
        <span><b>{Math.round(h.recall * 100)}%</b> of planted crime found</span>
        <span><b>{Math.round(h.hours)}</b> review hours</span>
        {hover === null && <span className="faint">Move along the chart to read another setting.</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ histograms */

export function LogHistogram({ all, marked, bins = 30 }: { all: number[]; marked: number[]; bins?: number }) {
  const lo = 0, hi = Math.log10(Math.max(10, ...all));
  const step = (hi - lo) / bins;
  const count = (xs: number[]) => { const c = new Array(bins).fill(0); for (const v of xs) c[Math.min(bins - 1, Math.max(0, Math.floor((Math.log10(Math.max(1, v)) - lo) / step)))]++; return c; };
  const a = count(all), m = count(marked);
  const W = 600, H = 190, Lp = 8, B = 30, T = 10;
  const maxC = Math.max(1, ...a);
  const bw = (W - Lp * 2) / bins;
  const yOf = (n: number) => n === 0 ? 0 : Math.max(2, Math.sqrt(n / maxC) * (H - T - B));
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="How many transactions there are at each amount. Planted crime is in gold over all transactions in grey.">
      {[0.5, 1].map((f) => <line key={f} x1={Lp} x2={W - Lp} y1={H - B - f * (H - T - B)} y2={H - B - f * (H - T - B)} stroke="var(--grid)" />)}
      <line x1={Lp} x2={W - Lp} y1={H - B} y2={H - B} stroke="var(--rule)" />
      {a.map((n, i) => <rect key={i} x={Lp + i * bw + 1} y={H - B - yOf(n)} width={bw - 2} height={yOf(n)} fill="var(--slate-fill)" opacity={0.45} />)}
      {m.map((n, i) => <rect key={`m${i}`} x={Lp + i * bw + 1} y={H - B - yOf(n)} width={bw - 2} height={yOf(n)} fill="var(--gold-fill)" />)}
      {[1, 10, 100, 1000, 10000, 100000, 1000000].filter((v) => Math.log10(v) <= hi).map((v) => (
        <text key={v} x={Lp + ((Math.log10(v) - lo) / (hi - lo)) * (W - Lp * 2)} y={H - B + 14} fontSize="10" fill="var(--faint)" textAnchor="middle" className="val">{v >= 1000 ? `${v / 1000}k` : v}</text>
      ))}
      <text x={W - Lp} y={H - 2} fontSize="10" textAnchor="end" fill="var(--faint)">amount in GBP (each step to the right is ten times more)</text>
    </svg>
  );
}

export function ScoreHistogram({ clean, bad, bins = 20 }: { clean: number[]; bad: number[]; bins?: number }) {
  const count = (xs: number[]) => { const c = new Array(bins).fill(0); for (const v of xs) c[Math.min(bins - 1, Math.floor(v * bins))]++; return c; };
  const a = count(clean), b = count(bad);
  const W = 600, H = 190, Lp = 8, B = 30, T = 10;
  const maxA = Math.max(1, ...a), maxB = Math.max(1, ...b);
  const bw = (W - Lp * 2) / bins;
  const y = (n: number, mx: number) => n === 0 ? 0 : Math.max(2, Math.sqrt(n / mx) * (H - T - B));
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="How many accounts there are at each score. Clean accounts are in grey and laundering accounts in claret.">
      {[0.5, 1].map((f) => <line key={f} x1={Lp} x2={W - Lp} y1={H - B - f * (H - T - B)} y2={H - B - f * (H - T - B)} stroke="var(--grid)" />)}
      <line x1={Lp} x2={W - Lp} y1={H - B} y2={H - B} stroke="var(--rule)" />
      {a.map((n, i) => <rect key={i} x={Lp + i * bw + 1} y={H - B - y(n, maxA)} width={bw / 2 - 2} height={y(n, maxA)} fill="var(--slate-fill)" opacity={0.45} />)}
      {b.map((n, i) => <rect key={`b${i}`} x={Lp + i * bw + bw / 2} y={H - B - y(n, maxB)} width={bw / 2 - 2} height={y(n, maxB)} fill="var(--claret-fill)" />)}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => <text key={v} x={Lp + v * (W - Lp * 2)} y={H - B + 14} fontSize="10" fill="var(--faint)" textAnchor={v === 0 ? "start" : v === 1 ? "end" : "middle"} className="val">{v}</text>)}
      <text x={W - Lp} y={H - 2} fontSize="10" textAnchor="end" fill="var(--faint)">score, 0 (clean) to 1 (laundering)</text>
    </svg>
  );
}

/* ------------------------------------------------------------ scales */

/** The bank at a glance: one ruled scale per factor, the mark on each. Values 0..1. */
export function Scales({ values, labels }: { values: number[]; labels: string[] }) {
  return (
    <div className="scales" role="img" aria-label={labels.map((l, i) => `${l} ${Math.round(values[i] * 100)} of 100`).join(", ")}>
      {labels.map((l, i) => (
        <div className="scale" key={l}>
          <span>{l}</span>
          <span className="scale-track">{[0.25, 0.5, 0.75].map((t) => <em key={t} style={{ left: `${t * 100}%` }} />)}<i style={{ left: `${Math.max(0.02, Math.min(0.98, values[i])) * 100}%` }} /></span>
          <b className="val">{Math.round(values[i] * 100)}</b>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ trade-off */

/** Right alerts against alerts reviewed along a greedy path, the plan marked and the current setting shown. */
export function TradeoffChart({ curve, mark, now, height = 220 }: { curve: { alerts: number; productive: number }[]; mark: { alerts: number; productive: number }; now: { alerts: number; productive: number }; height?: number }) {
  const W = 560, H = height, L = 40, R = 14, T = 18, B = 30;
  const maxA = Math.max(1, ...curve.map((p) => p.alerts), now.alerts), maxP = Math.max(1, ...curve.map((p) => p.productive), now.productive);
  const x = (a: number) => L + (a / maxA) * (W - L - R), y = (p: number) => T + (1 - p / maxP) * (H - T - B);
  const d = curve.map((p, i) => `${i ? "L" : "M"}${x(p.alerts).toFixed(1)},${y(p.productive).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="right alerts found against alerts reviewed, one dot per threshold change">
      {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t * maxP)} y2={y(t * maxP)} stroke="var(--grid)" />)}
      {ticks.map((t) => <text key={"y" + t} x={L} y={y(t * maxP) - 4} fontSize="10" fill="var(--faint)" className="val">{Math.round(t * maxP)}</text>)}
      {ticks.map((t) => <text key={"x" + t} x={x(t * maxA)} y={H - 16} fontSize="10" textAnchor={t === 1 ? "end" : t === 0 ? "start" : "middle"} fill="var(--faint)" className="val">{Math.round(t * maxA)}</text>)}
      <text x={W - R} y={H - 3} fontSize="10" textAnchor="end" fill="var(--faint)">alerts the team reviews</text>
      <text x={L + 4} y={T - 6} fontSize="10" fill="var(--faint)">alerts that were right</text>
      <path d={d} fill="none" stroke="var(--gold-fill)" strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={x(now.alerts)} cy={y(now.productive)} r={4} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.4} />
      <text x={x(now.alerts)} y={y(now.productive) - 9} fontSize="10" textAnchor="middle" fill="var(--muted)">now</text>
      <circle cx={x(mark.alerts)} cy={y(mark.productive)} r={5} fill="var(--gold-fill)" />
      <text x={x(mark.alerts)} y={y(mark.productive) - 10} fontSize="10" textAnchor={x(mark.alerts) > W - 60 ? "end" : "middle"} fill="var(--gold)" fontWeight={600}>the plan</text>
    </svg>
  );
}

/* ------------------------------------------------------------ stepper */

export function Stepper({ steps }: { steps: { n: string; title: string; body: string; href?: string }[] }) {
  return (
    <ol className="stepper">
      {steps.map((s) => (
        <li key={s.n} className="step">
          <div className="step-n val">{s.n}</div>
          <div className="step-body">
            <div className="step-title">{s.href ? <a href={s.href}>{s.title}</a> : s.title}</div>
            <div className="step-text">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------ loading */

/** Kept under the old name for the call sites; loading is a sentence and a rule. */
export function Skeleton({ label }: { h?: number; label?: string }) {
  return <Working label={label ?? "Working"} />;
}
