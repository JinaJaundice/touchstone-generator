import { useState } from "react";
import { useTheme, type ThemeChoice } from "./lib/theme";

/* The masthead: the mark, the name, the links that its page passes, an ink
   rule. The theme is chosen in the footer. */

/* The mark: a portrait slab of black stone with the tapered streak a rubbed
   metal leaves across its upper right. The only diagonal in the system. */
export function BrandMark({ size = 30 }: { size?: number }) {
  const w = Math.round(size * 28 / 34);
  return (
    <svg className="brand-mark" width={w} height={size} viewBox="0 0 28 34" aria-hidden>
      <rect x="1" y="1" width="26" height="32" rx="3" fill="var(--stone)" stroke="var(--stone-edge)" />
      <path d="M7 25.5 C10.5 20.5, 15.5 14, 21.5 8 L23 9.5 C17.5 15, 12.5 21, 9 26.5 Z" fill="var(--gold-on-stone)" />
    </svg>
  );
}

export function Wordmark({ tag = "Transaction generator" }: { tag?: string } = {}) {
  return (
    <a className="brand" href="#/">
      <BrandMark />
      <span className="brand-word">Touchstone</span>
      <span className="brand-tag">{tag}</span>
    </a>
  );
}

/* The masthead draws the links that its page passes: numbered steps first,
   then a quieter second group. A page that passes none, as the generator
   page does, has the mark, the name and the tag only. */
export type MastStep = [href: string, n: string, label: string];
export type MastLink = [href: string, label: string];

export function Masthead({ page, steps = [], about = [], tag }: { page: string; steps?: MastStep[]; about?: MastLink[]; tag?: string }) {
  const [open, setOpen] = useState(false);
  const active = (href: string) =>
    href === "#/" ? page === "" || page === "#" || page === "#/" : page.startsWith(href);
  return (
    <header className="mast">
      <div className="wrap mast-inner">
        <Wordmark tag={tag} />
        {/* a masthead with no links, as on the generator page, has no navigation and no Menu button */}
        {steps.length + about.length > 0 && (<>
        <nav className={`nav ${open ? "open" : ""}`} aria-label="Pages">
          <span className="nav-steps">
            {steps.map(([href, n, label]) => (
              <a key={href} href={href} onClick={() => setOpen(false)} className={active(href) ? "on" : ""} aria-current={active(href) ? "page" : undefined}><b>{n}</b>{label}</a>
            ))}
          </span>
          <span className="nav-about">
            {about.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setOpen(false)} className={active(href) ? "on" : ""} aria-current={active(href) ? "page" : undefined}>{label}</a>
            ))}
          </span>
        </nav>
        <button className="nav-burger" onClick={() => setOpen((o) => !o)} aria-label="menu" aria-expanded={open}>Menu</button>
        </>)}
      </div>
    </header>
  );
}

/** The theme line in the footer: follow the system, light, or dark. */
export function ThemeLine() {
  const [choice, setChoice] = useTheme();
  const opts: { v: ThemeChoice; label: string }[] = [
    { v: "system", label: "follow the system" }, { v: "light", label: "light" }, { v: "dark", label: "dark" },
  ];
  return (
    <span role="group" aria-label="Theme">
      Theme:{" "}
      {opts.map((o, i) => (
        <span key={o.v}>{i > 0 && " · "}{choice === o.v ? <b>{o.label}</b> : <button type="button" className="link-btn" onClick={() => setChoice(o.v)}>{o.label}</button>}</span>
      ))}
    </span>
  );
}

export function Foot({ children, line = "Every figure on this page is about generated data. No real customer data is used anywhere." }: { children?: React.ReactNode; line?: string }) {
  return (
    <footer className="tool-foot">
      <div className="wrap">
        {children}
        <div className="foot-row">
          <span>{line}</span>
          <ThemeLine />
        </div>
      </div>
    </footer>
  );
}
