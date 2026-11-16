/* Shared primitives for the assay ledger (docs/DESIGN_v2_BRIEF.md). A page
   is a document: a rail with the contents, sections that hang their number
   in the margin, ruled blocks instead of cards, text tabs with an ink
   underline, small-capital tags instead of badges, the hallmark cartouche
   for a rule code, and the data strip in the masthead idiom. No motion here. */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { genActions as actions, useGenStore as useStore } from "./genStore";
import { normaliseConfig } from "./gen/config";
import { fmtInt } from "./format";

/* ------------------------------------------------------------ the document */

export interface ContentsItem { id: string; n: string; title: string }
type Step = 1 | 2 | 3;

const ActiveCtx = createContext<string>("");

/** A tool page: the rail with what is on this page, beside the content. The
    journey itself (make, test, join) is the numbered navigation in the masthead. */
export function Doc({ contents, children }: { step?: Step; contents: ContentsItem[]; children: ReactNode }) {
  const [active, setActive] = useState(contents[0]?.id ?? "");
  useEffect(() => {
    if (!contents.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set((e.target as HTMLElement).id, e.isIntersecting ? e.boundingClientRect.top : Number.POSITIVE_INFINITY);
      // the section nearest the top of the viewport that is on screen
      let best = "", bestTop = Number.POSITIVE_INFINITY;
      for (const [id, top] of seen) if (top < bestTop) { best = id; bestTop = top; }
      if (best) setActive(best);
    }, { rootMargin: "-10% 0px -60% 0px", threshold: [0, 0.2] });
    for (const c of contents) { const el = document.getElementById(c.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [contents]);
  return (
    <div className="doc">
      <aside className="rail" aria-label="Contents">
        {contents.length > 0 && (
          <div>
            <div className="rail-k">On this page</div>
            <ol tabIndex={0} aria-label="On this page">
              {contents.map((c) => (
                <li key={c.id} className={c.id === active ? "on" : ""}><a href={`#${c.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><b>{c.n}</b><span>{c.title}</span></a></li>
              ))}
            </ol>
          </div>
        )}
      </aside>
      <ActiveCtx.Provider value={active}><div className="doc-main">{children}</div></ActiveCtx.Provider>
    </div>
  );
}

export function useActiveSection(): string { return useContext(ActiveCtx); }

/** The row every tool page ends with: the next step of the journey, named by
    what it does (never "Next"), so the reader is handed on rather than left. */
export function NextStep({ href, title, line }: { href: string; title: string; line?: string }) {
  return (
    <a className="next-step" href={href}>
      <span className="next-step-k">Next step</span>
      <span className="next-step-t">{title}</span>
      {line && <span className="next-step-l">{line}</span>}
    </a>
  );
}

export function PageHead({ title, sub, right }: { kicker?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {right && <div className="page-right">{right}</div>}
    </div>
  );
}

/** A section: the number hangs in the margin, the title states the output, one line explains it. */
export function Section({ n, title, sub, right, children, id }: { n?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; id?: string }) {
  const num = n ? String(Number(n) || n) : null;
  return (
    <section className={`sect ${num ? "" : "sect-plain"}`} id={id}>
      {num && <div className="sect-n" aria-hidden>{num}</div>}
      <div className="sect-body">
        <div className="sect-head">
          <div>
            <h2 className="sect-title">{title}</h2>
            {sub && <p className="sect-sub">{sub}</p>}
          </div>
          {right && <div className="sect-right">{right}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** A block: a ruled head in small capitals, then the exhibit. Never a box. */
export function Card({ children, className = "", title, right, pad = true, foot, level = 3 }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode; pad?: boolean; foot?: ReactNode; level?: 2 | 3 }) {
  return (
    <div className={`card ${pad ? "" : "card-flush"} ${className}`}>
      {(title || right) && <header className="card-head">{level === 2 ? <h2>{title}</h2> : <h3>{title}</h3>}{right && <div className="card-right">{right}</div>}</header>}
      {children}
      {foot && <div className="card-foot">{foot}</div>}
    </div>
  );
}

/** The ledger line: several key figures on one ruled row. */
export function StatBand({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode; tone?: "brand" | "noise" | "missed" | "muted" }[]; dense?: boolean }) {
  return (
    <div className="statband">
      {items.map((it) => (
        <div className={`stat tone-${it.tone ?? ""}`} key={it.label}>
          <div className="stat-value val">{it.value}</div>
          <div className="stat-label">{it.label}</div>
          {it.sub && <div className="stat-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ controls */

/** Text tabs with an ink underline. The small size is a row of boxed choices. */
export function Seg<T extends string>({ options, value, onChange, size = "md", label }: { options: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void; size?: "sm" | "md" | "lg"; label?: string }) {
  return (
    <div className={`seg ${size === "sm" ? "seg-inline" : `seg-${size}`}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={o.key === value} className={o.key === value ? "active" : ""} onClick={() => onChange(o.key)}>
          {o.label}{o.count !== undefined && <span className="seg-count val">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, onClick, kind = "default", disabled, href, download, small, large, title }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "default" | "ghost"; disabled?: boolean; href?: string; download?: string; small?: boolean; large?: boolean; title?: string }) {
  const cls = `btn btn-${kind} ${small ? "btn-sm" : ""} ${large ? "btn-lg" : ""}`;
  if (href) return <a className={cls} href={href} download={download} title={title}>{children}</a>;
  return <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

export function Dot({ tone, pulse }: { tone: "brand" | "noise" | "missed" | "clean" | "muted"; pulse?: boolean }) {
  return <span className={`dot dot-${tone} ${pulse ? "pulse" : ""}`} />;
}

/** A tag: small capitals in the meaning colour. Gold is right, slate is wrong, claret is missed. */
export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "brand" | "noise" | "missed" | "clean" | "muted" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** The hallmark cartouche: a rule code as a small punched mark. */
export function Code({ children }: { children: ReactNode }) {
  return <span className="code">{children}</span>;
}

export function Field({ label, value, hint, children }: { label: string; value?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <div className="field-row"><span className="field-label">{label}</span>{value !== undefined && <span className="field-value val">{value}</span>}</div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </label>
  );
}

export function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label?: string }) {
  return <input type="range" className="slider" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`toggle ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} aria-label={label}>
      <span className="toggle-knob" />
    </button>
  );
}

export function Meter({ value, tone = "brand", max = 1 }: { value: number; tone?: "brand" | "noise" | "missed"; max?: number }) {
  const colour = tone === "brand" ? "var(--gold-fill)" : tone === "noise" ? "var(--slate-fill)" : "var(--claret-fill)";
  return <div className="meter"><span style={{ width: `${Math.min(100, 100 * value / max)}%`, background: colour }} /></div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "brand" | "noise" }) {
  return <div className={`note note-${tone}`}>{children}</div>;
}

/** Loading is a sentence and a progress rule, never a skeleton. */
export function Working({ label, done, total }: { label: string; done?: number; total?: number }) {
  const known = done !== undefined && total !== undefined && total > 0;
  return (
    <div className="working" role="status" aria-live="polite">
      <span>{label}</span>
      <div className={`progress ${known ? "" : "indeterminate"}`}><i style={known ? { width: `${Math.round(100 * (done as number) / (total as number))}%` } : undefined} /></div>
    </div>
  );
}

/** Open a disclosure by id (or scroll to a section by id) from anywhere on the page. */
export function openPanel(id: string) {
  window.dispatchEvent(new CustomEvent("touchstone:open", { detail: id }));
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

/** A folded section: a ruled row, the title states what is inside, a count says how much. */
export function Disclosure({ title, sub, count, children, open: init = false, id }: { id?: string; title: string; sub?: string; count?: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(init);
  useEffect(() => {
    if (!id) return;
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === id) setOpen(true); };
    window.addEventListener("touchstone:open", on);
    return () => window.removeEventListener("touchstone:open", on);
  }, [id]);
  return (
    <div className={`disc ${open ? "open" : ""}`} id={id}>
      <button type="button" className="disc-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="disc-chev" aria-hidden>{open ? "−" : "+"}</span>
        <span className="disc-title">{title}</span>
        {sub && <span className="disc-sub">{sub}</span>}
        {count && <span className="disc-count val">{count}</span>}
      </button>
      {open && <div className="disc-body">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ the data strip */

/** What every tool page is looking at, set like the figures under a newspaper
    masthead, and the one action that changes it. */
export function DataStrip({ empty = "Choose a bank type below and make the data" }: { empty?: string } = {}) {
  const s = useStore();
  const ds = s.dataset;
  const dirty = ds ? JSON.stringify(normaliseConfig(s.config)) !== JSON.stringify(ds.config) : false;
  return (
    <div className="strip" role="region" aria-label="The data set">
      {s.generating ? (
        <div className="strip-busy" style={{ gridColumn: "1 / 3" }}>
          <span>Making the data: {s.generating.stage}</span>
          <div className={`progress ${s.generating.total > 1 ? "" : "indeterminate"}`}><i style={s.generating.total > 1 ? { width: `${Math.round(100 * s.generating.done / s.generating.total)}%` } : undefined} /></div>
        </div>
      ) : ds ? (
        <>
          <div className="strip-name">{ds.config.name}<small>The data set · seed number {ds.config.seed} · period {ds.config.period ?? 1}{s.fingerprint ? ` · fingerprint ${s.fingerprint}` : ""}{ds.library ? ` · library ${ds.library.version}` : ""}</small></div>
          <div className="strip-figs" tabIndex={0} aria-label="The data set in figures">
            <div><b>{fmtInt(ds.summary.accounts)}</b><span>accounts</span></div>
            <div><b>{ds.summary.days}</b><span>days</span></div>
            <div><b>{fmtInt(ds.summary.txs)}</b><span>transactions</span></div>
            <div><b>{fmtInt(ds.summary.patterns)}</b><span>crime patterns planted</span></div>
          </div>
        </>
      ) : <div className="strip-name" style={{ gridColumn: "1 / 3" }}>No data yet<small>{empty}</small></div>}
      <div className="strip-act">
        {dirty && !s.generating && <span className="strip-dirty">settings changed</span>}
        <a className="btn btn-ghost btn-sm" href="#/data">Change the data</a>
        <Button small kind={dirty ? "primary" : "default"} onClick={() => actions.generate()} disabled={!!s.generating}>{dirty ? "Make data with new settings" : s.seedPinned ? "Make the data again" : "Make a new data set"}</Button>
      </div>
    </div>
  );
}

/** Kept for the older call sites; the strip replaced the bar. */
export const BookBar = DataStrip;
