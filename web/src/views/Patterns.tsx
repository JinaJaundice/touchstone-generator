import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KbEvent, type ReactNode } from "react";
import { genActions, useGenStore } from "../lib/genStore";
import { normaliseLibrary } from "../lib/gen/config";
import { libraryCaseCount, libraryRateText } from "../lib/gen/archetypes";
import { caseMinutes, caseView, libraryIdOf, listCases, mergeReferences, patternCases, patternSteps, stepTitle, typicalCaseView, useLabelsOf, type CaseSummary, type CaseView } from "../lib/gen/caseView";
import { makeCalendar } from "../lib/gen/calendar";
import { ALL_TYPOLOGIES, FAMILY_LABEL, FAMILY_OWNER, TYPOLOGY_FAMILY, patternFamily, patternLabel, patternShort, type Dataset, type Family, type GenConfig, type LibrarySetting, type Typology } from "../lib/gen/types";
import references from "../lib/gen/patterns/references.json";
import labelsFile from "../lib/gen/patterns/labels.json";
import { PARTS, PATTERNS, patternOf } from "../lib/gen/patterns/index";
import { LIBRARY_ROW_CAP } from "../lib/gen/patterns/plant";
import { partIdOf, usesOf } from "../lib/gen/patterns/types";
import type { Basis, Part, Pattern, Step } from "../lib/gen/patterns/types";
import { Button, Doc, NextStep, PageHead, Section, Slider, Toggle, Working, type ContentsItem } from "../lib/ui";
import { FAMILY_ORDER, Stepper } from "../lib/viz";
import { FlowLedger, StepControls } from "../lib/flow";
import { fmtGbp, fmtInt, fmtPct, lengthText, plural } from "../lib/format";

/* The patterns pages of the generator: the list of every crime pattern and the page of one pattern, where its planted
   cases are drawn one step at a time. They read the generator store only and link only to pages of the generator. */

const SOURCE_TITLE = new Map(references.sources.map((x) => [x.id, x.title]));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A sentence with a full stop at its end. */
const stop = (s: string) => (s.endsWith(".") ? s : s + ".");
const ROOT = "#/data/patterns/";
const FAMILIES = (FAMILY_ORDER as Family[]).filter((f) => ALL_TYPOLOGIES.some((t) => patternFamily(t) === f));

/** The statuses that a library pattern shows, in the order that the list explains them. */
const STATUS_ORDER = ["draft", "tested", "stable"] as const;
/** One sentence for each status. */
const STATUS_SENTENCE: Record<(typeof STATUS_ORDER)[number], string> = {
  draft: "Draft. The pattern has not yet passed every test of the library.",
  tested: "Tested. The pattern passes every test of the library, and its owner has not yet read it.",
  stable: "Stable. The pattern passes every test, and its owner has read it.",
};
/** The end of a library pattern that the bank sees, in words for a table. */
const END_WORD = { source: "The source of the money", "cash-out": "The cash-out", both: "Both ends" } as const;
/** The same end in a sentence. */
const END_SENTENCE = { source: "the source end, where the money comes from", "cash-out": "the cash-out end, where the money is taken out", both: "both ends, where the money comes from and where it is taken out" } as const;

/** Whether a library pattern is on, its rate and the end that the bank sees, from a configuration: the entry of the pattern, or its own values where the settings hold none. */
function settingOf(cfg: GenConfig, id: string): { on: boolean; per1k: number; bankSees: "source" | "cash-out" | "both" } {
  const own = labelsFile.patterns.find((p) => p.id === id);
  const s = cfg.library?.[id];
  return { on: s?.on ?? false, per1k: s?.per1k ?? own?.per1k ?? 0, bankSees: s?.bankSees ?? (own?.bankSees as "source" | "cash-out" | "both" | undefined) ?? "source" };
}

/** The page of the patterns, from its address and query, such as "#/data/patterns/mule_herd?case=412". */
export function Patterns({ hash }: { hash: string }) {
  const [route, query = ""] = hash.split("?");
  const rest = route.startsWith(ROOT) ? route.slice(ROOT.length).replace(/\/$/, "") : "";
  let name = rest;
  try { name = decodeURIComponent(rest); } catch { /* an address that does not decode names no pattern */ }
  const s = useGenStore();
  const ds = s.dataset;
  if (!name) return <PatternList ds={ds} config={s.config} stage={s.generating?.stage ?? null} making={s.generating !== null} />;
  const libraryId = Object.prototype.hasOwnProperty.call(TYPOLOGY_FAMILY, name) ? null : libraryIdOf(name);
  if (libraryId !== null) return <LibraryPatternPage key={libraryId} id={libraryId} ds={ds} config={s.config} making={s.generating !== null} stage={s.generating?.stage ?? ""} caseParam={new URLSearchParams(query).get("case")} />;
  if (!Object.prototype.hasOwnProperty.call(TYPOLOGY_FAMILY, name)) {
    return (
      <>
        <PageHead title="No pattern has this name" />
        <p>The address names no crime pattern that the generator holds.</p>
        <p><a className="link" href="#/data/patterns">Every crime pattern</a></p>
      </>
    );
  }
  return <PatternPage name={name as Typology} ds={ds} making={s.generating !== null} stage={s.generating?.stage ?? ""} caseParam={new URLSearchParams(query).get("case")} />;
}

/** The list of every crime pattern, a section for each family. */
function PatternList({ ds, config, making, stage }: { ds: Dataset | null; config: GenConfig; making: boolean; stage: string | null }) {
  const contents: ContentsItem[] = [...FAMILIES.map((f, i) => ({ id: "family-" + f, n: String(i + 1), title: FAMILY_LABEL[f] })), { id: "library", n: String(FAMILIES.length + 1), title: "Library patterns" }];
  const libraryCounts = useMemo(() => {
    const own = ds ? listCases(ds) : [];
    return new Map(PATTERNS.map((p) => [p.id, patternCases(own, p.id).length]));
  }, [ds]);
  const statuses = STATUS_ORDER.filter((x) => PATTERNS.some((p) => p.status === x));
  const counts = useMemo(() => {
    const per = new Map<string, Set<number>>();
    if (ds) for (const p of ds.patterns) if (p.caseId >= 0) { const set = per.get(p.typology); if (set) set.add(p.caseId); else per.set(p.typology, new Set([p.caseId])); }
    return per;
  }, [ds]);
  return (
    <Doc contents={contents}>
      <div className="lib-list">
      <PageHead title="Every crime pattern the generator can plant"
        sub={`The generator plants ${ALL_TYPOLOGIES.length} built-in crime patterns in ${FAMILIES.length} families and ${PATTERNS.length} library patterns, which are off until you switch them on. Each name opens the page of the pattern, where its planted cases are drawn one step at a time.`}
        right={<a className="btn btn-sm" href="#/data">Back to Make data</a>} />
      {making && <Working label={stage ? `Making the data (${stage})` : "Making the data"} />}
      {!making && !ds && <p>Make the data to see how many cases of each pattern it holds. <a className="link" href="#/data">Make data</a></p>}
      {FAMILIES.map((f, i) => (
        <Section key={f} id={"family-" + f} n={String(i + 1)} title={FAMILY_LABEL[f]} sub={"Handled by " + FAMILY_OWNER[f] + "."}>
          <div className="tbl-wrap" tabIndex={0} role="region" aria-label={FAMILY_LABEL[f]}>
            <table className="tbl">
              <thead><tr><th scope="col">Crime pattern</th><th scope="col" className="num">Cases in this data set</th></tr></thead>
              <tbody>
                {ALL_TYPOLOGIES.filter((t) => patternFamily(t) === f).map((t) => (
                  <tr key={t}>
                    <td><a className="link" href={ROOT + t}>{patternLabel(t)}</a></td>
                    <td className="num val">{making ? <span className="faint">being made</span> : ds ? (counts.get(t)?.size ?? 0) : <span className="faint">no data yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      <Section id="library" n={String(FAMILIES.length + 1)} title="Library patterns" sub={`The library holds ${PATTERNS.length} crime methods from published sources. Switch one on under Adjust the bank on the Make data page. Each title opens a page that shows its steps and a typical case.`}>
        <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Library patterns">
          <table className="tbl tbl-lib">
            <thead><tr><th scope="col">Library pattern</th><th scope="col" className="lib-wide">What it is</th><th scope="col" className="lib-wide">Status</th><th scope="col">End the bank sees</th><th scope="col" className="num">Cases in this data set</th></tr></thead>
            <tbody>
              {PATTERNS.map((p) => (
                <tr key={p.id}>
                  <td><a className="link" href={ROOT + p.id}>{p.title}</a><span className="lib-sub">{p.summary} Its status is {p.status}.</span></td>
                  <td className="lib-wide">{p.summary}</td>
                  <td className="lib-wide">{capital(p.status)}</td>
                  <td>{END_WORD[settingOf(ds?.config ?? config, p.id).bankSees]}</td>
                  <td className="num val">{making ? <span className="faint">being made</span> : ds ? (libraryCounts.get(p.id) ?? 0) : <span className="faint">no data yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {statuses.map((x) => <p key={x} className="faint" style={{ marginBottom: 4 }}>{STATUS_SENTENCE[x]}</p>)}
        <p className="faint" style={{ marginBottom: 4 }}>The end that the bank sees is the end of a case whose payments the bank's own records hold. It is the source of the money, the cash-out or both.</p>
      </Section>
      <NextStep href="#/data" title="Make data" line="Choose the bank, switch crime patterns on or off, and make the data again." />
      </div>
    </Doc>
  );
}

/** The page of one crime pattern: what it is, its steps and a drawn case. */
function PatternPage({ name, ds, making, stage, caseParam }: { name: Typology; ds: Dataset | null; making: boolean; stage: string; caseParam: string | null }) {
  const family = patternFamily(name);
  const own = useMemo(() => (ds ? patternCases(listCases(ds), name) : []), [ds, name]);
  const steps = useMemo(() => (ds && own.length ? patternSteps(ds, name, own) : []), [ds, name, own]);
  const cal = useMemo(() => (ds ? makeCalendar(ds.config.period ?? 1, ds.config.days) : null), [ds]);
  const wanted = caseParam !== null && /^-?\d+$/.test(caseParam) ? Number(caseParam) : null;
  const chosen = own.find((c) => c.caseId === wanted) ?? own[0] ?? null;
  const view = useMemo(() => (ds && chosen ? caseView(ds, chosen.caseId) : null), [ds, chosen]);
  const stepCount = useMemo(() => new Set((view?.rows ?? []).map((r) => r.step)).size, [view]);
  // the number of steps drawn is kept with the case and the data set it belongs to, so a new case or a new data set starts again at step 1
  const [kept, setKept] = useState<{ ds: Dataset | null; id: number; n: number | null } | null>(null);
  const keptHere = chosen && kept && kept.ds === ds && kept.id === chosen.caseId ? kept : null;
  const shown = keptHere ? (keptHere.n === null ? null : Math.max(1, Math.min(keptHere.n, stepCount))) : stepCount > 1 ? 1 : null;
  const sources = useMemo(() => {
    const ids = new Set<string>();
    if (ds) for (const p of ds.patterns) if (p.typology === name) for (const id of p.sources) ids.add(id);
    return [...ids].sort();
  }, [ds, name]);
  const contents: ContentsItem[] = [
    { id: "what", n: "1", title: "What it is" },
    { id: "steps", n: "2", title: "The steps" },
    { id: "cases", n: "3", title: "Cases in this data set" },
  ];
  const nothing = !making && ds !== null && own.length === 0;
  const waiting = making
    ? <Working label={`Making the data (${stage})`} />
    : !ds
      ? <p>Make the data to see the cases of this pattern. <a className="link" href="#/data">Make data</a></p>
      : null;
  const absent = <p>This pattern is not planted in the current data set. Switch it on under Adjust the bank and make the data.</p>;

  const pick = (id: string) => window.location.replace(ROOT + name + "?case=" + id);
  const option = (c: CaseSummary) => `Case ${c.caseId}, ${fmtGbp(c.value)}, ${plural(c.legs, "payment")}`;

  return (
    <Doc contents={contents}>
      <PageHead title={patternLabel(name)} sub={`One of the ${ALL_TYPOLOGIES.length} crime patterns that the generator can plant. This page gives its steps and draws each of its cases in the current data set.`} right={<a className="btn btn-sm" href="#/data/patterns">Every crime pattern</a>} />
      <Section id="what" n="1" title="What it is">
        <div className="tbl-wrap" tabIndex={0}>
          <table className="tbl">
            <tbody>
              <tr><th scope="row">Shown in tables as</th><td>{patternShort(name)}</td></tr>
              <tr><th scope="row">Family</th><td>{FAMILY_LABEL[family]}</td></tr>
              <tr><th scope="row">Handled by</th><td>{capital(FAMILY_OWNER[family])}</td></tr>
              {ds && sources.length > 0 && (
                <tr><th scope="row">Sources</th><td>{sources.map((id) => <div key={id}>{id}. {SOURCE_TITLE.get(id) ?? ""}</div>)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {ds && sources.length > 0 && <p className="faint">Each S number is an entry of the generator's list of sources.</p>}
      </Section>
      <Section id="steps" n="2" title="The steps" sub="The steps of this pattern, in the order of its largest case. A case may take its steps in another order or leave one out.">
        {waiting ?? (nothing ? absent : (
          <Stepper steps={steps.map((g, i) => ({
            n: String(i + 1),
            title: stepTitle(g.step),
            body: stop(capital(g.say)) + (g.cases < own.length ? ` This step is in ${g.cases} of the ${own.length} cases.` : ""),
          }))} />
        ))}
      </Section>
      <Section id="cases" n="3" title="Cases in this data set" sub={own.length ? (own.length > 1 ? `${plural(own.length, "case")}. A case is one planted run of the pattern. Choose one to see its payments step by step.` : `${plural(own.length, "case")}. A case is one planted run of the pattern.`) : undefined}>
        {waiting ?? (nothing ? absent : view && chosen && cal && (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="case-pick">Choose a case</label>
              <select id="case-pick" className="input select" value={chosen.caseId} onChange={(e) => { setKept(null); pick(e.target.value); }}>
                {own.map((c) => <option key={c.caseId} value={c.caseId}>{option(c)}</option>)}
              </select>
            </div>
            <StepControls steps={stepCount} shown={shown} onShown={(n) => setKept({ ds, id: chosen.caseId, n })} />
            <FlowLedger key={chosen.caseId} view={view} shown={shown} cal={cal} />
          </>
        ))}
      </Section>
      <NextStep href="#/data" title="Make data" line="Change the bank or the crime, and make the data again." />
    </Doc>
  );
}

/** A page range as words: "pages 15 to 20" where the text starts with a digit, and the text as the file gives it otherwise. */
const pagesText = (pages?: string) => (pages ? (/^\d+$/.test(pages) ? `page ${pages}` : /^\d/.test(pages) ? `pages ${pages}` : pages) : "");
/** A source as its identifier and its title, with its pages where there are some. */
const sourceText = (id: string, pages?: string) => `${id}. ${SOURCE_TITLE.get(id) ?? ""}${pages ? ", " + pagesText(pages) : ""}`;

/** The words for a way of paying in a library file. A payment on a chain takes the name of the chain. */
const VIA_WORD: Record<string, string> = {
  fps: "Faster Payments", chaps: "CHAPS", swift: "a payment abroad", "cash-in": "cash paid in", "cash-out": "cash taken out", card: "a card payment",
  "bank-crypto": "the bank's crypto service", "off-record": "a private deal",
};
/** The rails that a step uses, in words, such as "Faster Payments or the bitcoin chain". */
function railWords(step: Step, part: Part): string {
  const chain = part.parties.find((q) => q.id === step.from)?.chain ?? part.parties.find((q) => q.id === step.to)?.chain ?? null;
  const vias = ([] as string[]).concat(step.via);
  return vias.map((v) => (v === "chain" ? (chain ? `the ${chain} chain` : "a blockchain") : VIA_WORD[v] ?? v)).join(" or ");
}

/** The rail that a pattern needs and the bank lacks, in the words of the page. */
const RAIL_NEED: Record<string, string> = { "cash-out": "cash taken out at a counter", "cash-in": "cash paid in at a counter", swift: "a payment abroad", "bank-crypto": "the bank's crypto service" };

/** The basis of a figure as one sentence about its kind, then the text of the file. */
function BasisText({ what, basis }: { what: string; basis: Basis }) {
  return <>{basis.kind === "reported" ? `${what} is based on source ${basis.ref}${basis.pages ? ", " + pagesText(basis.pages) : ""}. ` : `${what} is an assumption. `}{stop(basis.note)}</>;
}

/** The word for the kind of a part. */
const PART_WORD = { source: "The source of the money", hiding: "A way of hiding the money", "cash-out": "The cash-out" } as const;

/** The 5 steps of the size and the speed of a library pattern, with the words that a dial shows. */
const SHAPE_STEPS = [{ value: 0.25, label: "a quarter" }, { value: 0.5, label: "half" }, { value: 1, label: "unchanged" }, { value: 2, label: "2 times" }, { value: 4, label: "4 times" }];
/** The 3 ends that the bank can see, in the words of a step. */
const END_STEPS = [{ value: "source", label: "the source" }, { value: "cash-out", label: "the cash-out" }, { value: "both", label: "both" }] as const;
/** A factor in words such as "3 times", for a value that is none of the 5 steps. */
const timesText = (v: number) => `${Math.round(v * 100) / 100} times`;
/** The index of the step nearest a value, and whether the value is on that step. */
function nearestShape(v: number): { index: number; exact: boolean } {
  let index = 0;
  SHAPE_STEPS.forEach((s, i) => { if (Math.abs(s.value - v) < Math.abs(SHAPE_STEPS[index].value - v)) index = i; });
  return { index, exact: Math.abs(SHAPE_STEPS[index].value - v) < 1e-6 };
}
/** The settings of a library pattern in a configuration, each held within its limits, and the pattern's own value for each field that the configuration does not hold. */
function ownSetting(cfg: GenConfig, id: string): LibrarySetting {
  return normaliseLibrary({ [id]: cfg.library?.[id] ?? null })![id];
}

/** One dial of the section "Shape it", in the form of a dial of the bank builder: a head with the label and the value, the control and one line of help. */
function ShapeDial({ label, value, help, helpId, children }: { label: string; value: string; help: string; helpId: string; children: ReactNode }) {
  return (
    <div className="dial">
      <div className="dial-head"><span className="dial-label">{label}</span><span className="dial-value val">{value}</span></div>
      {children}
      <div className="dial-help" id={helpId}>{help}</div>
    </div>
  );
}

/** The steps of a dial as a group of radio buttons. A step that is not exact and nearest takes the class near, and none is checked. */
function ShapeSteps({ label, name, steps, checked, near, onPick, describedBy }: { label: string; name?: string; steps: readonly { label: string }[]; checked: number | null; near: number | null; onPick: (i: number) => void; describedBy: string }) {
  // a group of radio buttons is one Tab stop: the arrow keys move the pick, as in a native group
  const stop = checked ?? near ?? 0;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KbEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const to = (i + d + steps.length) % steps.length;
    refs.current[to]?.focus();
    onPick(to);
  };
  return (
    <div className="steps" role="radiogroup" aria-label={checked === null && name ? `${label}, now ${name}` : label} aria-describedby={describedBy}>
      {steps.map((s, i) => (
        <button type="button" key={s.label} ref={(el) => { refs.current[i] = el; }} role="radio" aria-checked={i === checked} aria-describedby={describedBy} tabIndex={i === stop ? 0 : -1} className={`dial-step ${i === checked ? "on" : ""} ${i === near ? "near" : ""}`} onClick={() => onPick(i)} onKeyDown={(e) => move(e, i)}>{s.label}</button>
      ))}
    </div>
  );
}

/** A number of uses in words, such as "twice" or "3 times". */
const timesWord = (n: number) => (n === 2 ? "twice" : `${["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? n} times`);
/** The sentence before the first use of a part that a pattern names more than once, which explains the words use 1 of 2 and use 2 of 2 of its steps. */
function usesSentence(part: Part, words: string[]): string {
  const title = part.title.charAt(0).toLowerCase() + part.title.slice(1);
  const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0];
  return `This pattern ${part.kind === "hiding" ? `passes the funds through ${title}` : `names ${title}`} ${timesWord(words.length)}, so the steps of each ${part.kind === "hiding" ? "pass" : "use"} carry the words ${list}.`;
}

/** The words for a size in the help of the dial, such as "a quarter of" or "4 times". */
const sizePrefix = (size: number) => (Math.abs(size - 0.25) < 1e-6 ? "a quarter of" : Math.abs(size - 0.5) < 1e-6 ? "half" : timesText(size));
/** The words for the length of a wait at a speed, such as "4 times as long" for a quarter of the speed. */
const speedLength = (speed: number) => (Math.abs(speed - 2) < 1e-6 ? "half as long" : Math.abs(speed - 4) < 1e-6 ? "a quarter as long" : `${timesText(1 / speed)} as long`);

/** The 4 dials of a library pattern and the state of the data set, with one button that makes the data again. */
function ShapeSettings({ id, cur, config, range, typical, ds, making, stage, cap }: { id: string; cur: LibrarySetting; config: GenConfig; range: [number, number] | null; typical: CaseView | null; ds: Dataset | null; making: boolean; stage: string; cap: string | null }) {
  const entry = labelsFile.patterns.find((p) => p.id === id);
  const short = entry?.short ?? id;
  const ends = (entry?.allowed ?? []) as string[];
  const rateText = libraryRateText(cur.per1k);
  const planned = libraryCaseCount(cur.per1k, config.accounts);
  const howMany = !cur.on ? "The pattern is off, so the next data set holds no case of it." : cur.per1k > 0 ? `The generator plans ${plural(planned, "case")} of this pattern for a bank of ${fmtInt(config.accounts)} accounts.` : "The rate is 0, so the next data set holds no case of this pattern.";
  const sizeHelp = range
    ? `A case moves between ${fmtGbp(range[0] * cur.size)} and ${fmtGbp(range[1] * cur.size)} at this size${cap ? `, and at most ${cap}` : ""}.`
    : Math.abs(cur.size - 1) < 1e-6 ? "Each amount of a case is the amount that the files give." : `Each amount of a case is ${sizePrefix(cur.size)} the amount that the files give.`;
  const minutes = typical ? caseMinutes(typical) : 0;
  const speedHelp = [
    Math.abs(cur.speed - 1) < 1e-6 ? "Each wait between payments is as long as the files give it." : `Each wait between payments is ${speedLength(cur.speed)}, so the case runs at ${sizePrefix(cur.speed)} the speed.`,
    `The typical case lasts ${lengthText(minutes)}, and the data set covers ${plural(config.days, "day")}.`,
    minutes > config.days * 1440 ? "A case that runs past the last day of the data set loses its later payments." : "",
  ].filter(Boolean).join(" ");
  const endHelp = ends.length > 1
    ? `The bank's records hold the payments of ${END_SENTENCE[cur.bankSees]}.${cur.bankSees === "both" ? " Each case then has 2 planted patterns with one case number." : ""}`
    : "The files of this pattern allow this end only.";
  const sizeAt = nearestShape(cur.size), speedAt = nearestShape(cur.speed);
  const endSteps = END_STEPS.filter((e) => ends.includes(e.value));
  const endIndex = endSteps.findIndex((e) => e.value === cur.bankSees);
  const made = ds ? ownSetting(ds.config, id) : null;
  // a pattern that is off in the settings and in the data set makes no difference to the next data set, whatever its other settings are
  const same = made !== null && ((!made.on && !cur.on) || (["on", "per1k", "size", "speed", "bankSees"] as const).every((k) => made[k] === cur[k]));
  const stateText = !ds ? "No data set is on this page yet." : same ? "The data set on this page was made with these settings." : "The data set on this page was made with other settings for this pattern.";
  // the setting that the reader changed last, which the region for a screen reader describes; null says nothing
  const [changed, setChanged] = useState<"many" | "size" | "speed" | "end" | "made" | null>(null);
  const stateRef = useRef<HTMLParagraphElement>(null);
  const wasMaking = useRef(false), wantFocus = useRef(false);
  useEffect(() => {
    if (making) { wasMaking.current = true; return; }
    if (!wasMaking.current) return;
    wasMaking.current = false;
    if (wantFocus.current) setChanged("made");
    const at = document.activeElement;
    if (wantFocus.current && (!at || at === document.body || at.tagName === "BUTTON" || at === stateRef.current)) stateRef.current?.focus();
    wantFocus.current = false;
  }, [making]);
  const typicalText = typical ? `The typical case in section 5 now has ${plural(typical.rows.length, "payment")}, moves ${fmtGbp(typical.value)} and lasts ${lengthText(minutes)}.` : "";
  const sizeValue = sizeAt.exact ? SHAPE_STEPS[sizeAt.index].label : timesText(cur.size);
  const speedValue = speedAt.exact ? SHAPE_STEPS[speedAt.index].label : timesText(cur.speed);
  const offText = `The pattern is off, so the next data set holds no case of it. ${stateText}`;
  const said = making ? `Making the data (${stage})` : changed === null ? ""
    : changed === "made" ? stateText
    : !cur.on && changed !== "many" ? `${changed === "size" ? `How large, ${sizeValue}` : changed === "speed" ? `How fast, ${speedValue}` : `The bank sees ${END_STEPS.find((e) => e.value === cur.bankSees)?.label ?? cur.bankSees}`}. ${offText}`
    : changed === "many" ? `${short} switch, now ${cur.on ? "on" : "off"}. ${howMany} ${stateText}`
    : changed === "size" ? `How large, ${sizeValue}. ${sizeHelp} ${typicalText} ${stateText}`
    : changed === "speed" ? `How fast, ${speedValue}. ${speedHelp} ${typicalText} ${stateText}`
    : `The bank sees ${END_STEPS.find((e) => e.value === cur.bankSees)?.label ?? cur.bankSees}. ${endHelp} ${typicalText} ${stateText}`;
  const make = () => { wantFocus.current = true; void genActions.generate(); };
  return (
    <>
      <div className="shape-grid">
        <ShapeDial label="How many" value={cur.on ? rateText : "Off"} help={howMany} helpId="shape-many-help">
          <div className="shape-rate">
            <Toggle on={cur.on} onChange={(v) => { setChanged("many"); genActions.setLibrary(id, { on: v }); }} label={`${short} switch`} describedBy="shape-many-help" />
            <Slider value={cur.per1k} min={0} max={5} step={0.1} onChange={(v) => { setChanged(null); genActions.setLibrary(id, { per1k: v }); }} label={`${short} rate`} disabled={!cur.on} valueText={rateText} describedBy="shape-many-help" />
          </div>
        </ShapeDial>
        <ShapeDial label="How large" value={sizeValue} help={sizeHelp} helpId="shape-size-help">
          <ShapeSteps label="How large" name={timesText(cur.size)} steps={SHAPE_STEPS} checked={sizeAt.exact ? sizeAt.index : null} near={sizeAt.exact ? null : sizeAt.index} onPick={(i) => { setChanged("size"); genActions.setLibrary(id, { size: SHAPE_STEPS[i].value }); }} describedBy="shape-size-help" />
        </ShapeDial>
        <ShapeDial label="How fast" value={speedValue} help={speedHelp} helpId="shape-speed-help">
          <ShapeSteps label="How fast" name={timesText(cur.speed)} steps={SHAPE_STEPS} checked={speedAt.exact ? speedAt.index : null} near={speedAt.exact ? null : speedAt.index} onPick={(i) => { setChanged("speed"); genActions.setLibrary(id, { speed: SHAPE_STEPS[i].value }); }} describedBy="shape-speed-help" />
        </ShapeDial>
        <ShapeDial label="The bank sees" value={END_STEPS.find((e) => e.value === cur.bankSees)?.label ?? cur.bankSees} help={endHelp} helpId="shape-end-help">
          {ends.length > 1 && <ShapeSteps label="The bank sees" steps={endSteps} checked={endIndex} near={null} onPick={(i) => { setChanged("end"); genActions.setLibrary(id, { bankSees: endSteps[i].value }); }} describedBy="shape-end-help" />}
        </ShapeDial>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{said}</div>
      <p style={{ margin: "12px 0 0" }}><a className="link" href="#typical" onClick={(e) => { e.preventDefault(); document.getElementById("typical")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>See the typical case in section 5</a></p>
      <p className="shape-state" ref={stateRef} tabIndex={-1}>
        {stateText}
        {!ds && <> <Button kind="primary" disabled={making} onClick={make}>Make the data</Button></>}
        {ds && !same && <> <Button kind="primary" disabled={making} onClick={make}>Make data with new settings</Button></>}
      </p>
      {making && <Working label={`Making the data (${stage})`} status={false} />}
    </>
  );
}

/** The page of one library pattern: what it is, its value, its steps from the files, a typical case, the cases of the data set and its settings. */
function LibraryPatternPage({ id, ds, config, making, stage, caseParam }: { id: string; ds: Dataset | null; config: GenConfig; making: boolean; stage: string; caseParam: string | null }) {
  const pattern = patternOf(id) as Pattern;
  const source = PARTS.get(pattern.parts.source);
  const useList = usesOf(pattern).map((use) => ({ use, part: PARTS.get(partIdOf(use)) })).filter((x): x is { use: string; part: Part } => !!x.part);
  const partList = useList.map((x) => x.part);
  const useWords = useLabelsOf(id);
  const cur = ownSetting(config, id);
  const typical = useMemo(() => typicalCaseView(id, { size: cur.size, speed: cur.speed, bankSees: cur.bankSees }), [id, cur.size, cur.speed, cur.bankSees]);
  const typicalCal = useMemo(() => makeCalendar(1, 90), []);
  const typicalSteps = useMemo(() => new Set((typical?.rows ?? []).map((r) => r.step)).size, [typical]);
  const [typicalShown, setTypicalShown] = useState<number | null>(typicalSteps > 1 ? 1 : null);
  const own = useMemo(() => (ds ? patternCases(listCases(ds), id) : []), [ds, id]);
  const cal = useMemo(() => (ds ? makeCalendar(ds.config.period ?? 1, ds.config.days) : null), [ds]);
  const wanted = caseParam !== null && /^-?\d+$/.test(caseParam) ? Number(caseParam) : null;
  const chosen = own.find((c) => c.caseId === wanted) ?? own[0] ?? null;
  const view = useMemo(() => (ds && chosen ? caseView(ds, chosen.caseId) : null), [ds, chosen]);
  const stepCount = useMemo(() => new Set((view?.rows ?? []).map((r) => r.step)).size, [view]);
  // the number of steps drawn is kept with the case and the data set it belongs to, so a new case or a new data set starts again at step 1
  const [kept, setKept] = useState<{ ds: Dataset | null; id: number; n: number | null } | null>(null);
  const keptHere = chosen && kept && kept.ds === ds && kept.id === chosen.caseId ? kept : null;
  const shown = keptHere ? (keptHere.n === null ? null : Math.max(1, Math.min(keptHere.n, stepCount))) : stepCount > 1 ? 1 : null;

  const entries = ds?.library?.cases.filter((c) => c.pattern === id) ?? [];
  const reduced = entries.filter((c) => c.reduced).length;
  const cutShort = entries.filter((c) => c.cutShort).length;
  const bankLegs = entries.reduce((a, c) => a + c.bankLegs, 0);
  const inFull = entries.reduce((a, c) => a + c.inFull, 0);
  const skipped = ds?.library?.skipped.filter((x) => x.pattern === id) ?? [];
  const capped = !!ds?.library?.capped.includes(id);
  const set = settingOf(config, id);
  const made = ds ? ownSetting(ds.config, id) : cur;
  const range = pattern.value ?? (source && source.kind === "source" && "log" in source.value ? source.value : null);
  // a source part that states capByBalance limits a case to that share of what its paying customer holds on the first day of the data set, with the arranged overdraft (rule 6 of section 6 of PATTERN_FORMAT.md)
  const capShare = !pattern.value && source && source.kind === "source" && "capByBalance" in source.value ? source.value.capByBalance ?? null : null;
  const cap = capShare !== null && source ? { share: `${Math.round(capShare * 100)}%`, who: source.parties.find((q) => q.kind === "customer")?.label ?? "the paying customer" } : null;
  const basisOf = pattern.value?.basis ?? (source && source.kind === "source" ? source.value.basis : null);
  // the section states the limit once, in its own sentence, so the older sentence of the note that states it again is left out
  const valueBasis = basisOf && cap ? { ...basisOf, note: basisOf.note.replace(/\s*A case takes at most \d+% of what [^.]*\./, "") } : basisOf;
  const allReferences = useMemo(() => {
    return mergeReferences([pattern.references, ...partList.map((p) => p.references)]);
  }, [pattern, partList]);
  const verb = (n: number) => (n === 1 ? "was" : "were");

  const contents: ContentsItem[] = [
    { id: "what", n: "1", title: "What it is" },
    { id: "value", n: "2", title: "The value of a case" },
    { id: "steps", n: "3", title: "The steps" },
    { id: "shape", n: "4", title: "Shape it" },
    { id: "typical", n: "5", title: "A typical case" },
    { id: "cases", n: "6", title: "Cases in this data set" },
  ];
  const waiting = making
    ? <Working label={`Making the data (${stage})`} status={false} />
    : !ds
      ? <p>Make the data to see the cases of this pattern. <a className="link" href="#/data">Make data</a></p>
      : null;
  const pick = (cid: string) => window.location.replace(ROOT + id + "?case=" + cid);
  const option = (c: CaseSummary) => `Case ${c.caseId}, ${fmtGbp(c.value)}, ${plural(c.legs, "payment")}`;
  let number = 0;

  return (
    <Doc contents={contents}>
      <div className="lib-page">
      <PageHead title={pattern.title} sub={`One of the ${PATTERNS.length} library patterns, which are held as files with their sources. This page gives its steps, a typical case and its cases in the current data set.`} right={<a className="btn btn-sm" href="#/data/patterns">Every crime pattern</a>} />
      <Section id="what" n="1" title="What it is">
        <p style={{ marginTop: 0 }}>{pattern.summary}</p>
        <div className="tbl-wrap" tabIndex={0}>
          <table className="tbl">
            <tbody>
              <tr><th scope="row">Status</th><td>{STATUS_SENTENCE[pattern.status as (typeof STATUS_ORDER)[number]] ?? capital(pattern.status)}</td></tr>
              <tr><th scope="row">References</th><td>{allReferences.map((r) => <div key={r.id}>{r.note ? `${sourceText(r.id, r.pages)}. ${stop(r.note)}` : sourceText(r.id, r.pages)}</div>)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="faint">Each S number is an entry in the list of sources. A page number counts the pages of the source's PDF file.</p>
      </Section>
      <Section id="value" n="2" title="The value of a case">
        {range && "log" in range
          ? <p style={{ marginTop: 0 }}>A case moves between {fmtGbp(range.log[0])} and {fmtGbp(range.log[1])}.{cap ? ` A case takes at most ${cap.share} of what ${cap.who} holds on the first day of the data set, counting any arranged overdraft. An arranged overdraft is credit that the bank has agreed to lend the customer. Because of this limit, a case in a data set can move less than this range.` : null}{valueBasis ? <> <BasisText what="This range" basis={valueBasis} /></> : null}</p>
          : <p style={{ marginTop: 0 }}>The value of a case is the sum of the amounts that its own steps move.{valueBasis ? <> <BasisText what="This sum" basis={valueBasis} /></> : null}</p>}
      </Section>
      <Section id="steps" n="3" title="The steps" sub="A part is one piece of the method, such as the source, a way of hiding the money or the cash-out. The steps run in the order of the parts. Each step shows what happens, how the money moves and where the figures come from. Between 2 parts the funds move on in one payment, which the ledger shows as a step with the title Hand-off.">
        {useList.map(({ use, part }) => (
          <div key={use} style={{ marginBottom: 18 }}>
            {useWords[use]?.startsWith("use 1 of ") && <p style={{ marginTop: 0 }}>{usesSentence(part, useList.filter((x) => x.part.id === part.id).map((x) => useWords[x.use]))}</p>}
            <h3 className="step-title" style={{ margin: "0 0 6px" }}>{PART_WORD[part.kind]}. {part.title}{useWords[use] ? ` (${useWords[use]})` : ""}</h3>
            <ol className="stepper">
              {part.steps.map((s) => {
                number++;
                return (
                  <li key={`${use}.${s.id}`} className="step">
                    <div className="step-n val">{number}</div>
                    <div className="step-body">
                      <div className="step-title">{stepTitle(`${use}.${s.id}`)}</div>
                      <div className="step-text">{stop(capital(s.say))}</div>
                      <div className="step-text">{`It moves through ${railWords(s, part)}.`}{s.need === "supporting" ? " A case may leave this step out." : ""}</div>
                      <div className="step-text"><BasisText what="This step" basis={s.basis} /></div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {part.parties.filter((q) => q.known).map((q) => (
              <p key={q.id} className="faint" style={{ marginTop: 8 }}>The chance that a screening tool already labels {q.label} is {fmtPct(q.known!.chance)}. <BasisText what="This chance" basis={q.known!.basis} /></p>
            ))}
            {part.kind === "hiding" && (
              <p className="faint" style={{ marginTop: 8 }}>The chance that a screening tool loses the trail here is {fmtPct(part.hides.chance)}. <BasisText what="This chance" basis={part.hides.basis} /></p>
            )}
          </div>
        ))}
      </Section>
      <Section id="shape" n="4" title="Shape it" sub="The 4 settings below change this pattern in the next data set that you make. The typical case in section 5 follows the size, the speed and the end at once.">
        <ShapeSettings id={id} cur={cur} config={config} range={range && "log" in range ? range.log : null} typical={typical} ds={ds} making={making} stage={stage} cap={cap && `${cap.share} of what ${cap.who} holds`} />
        <p>Switching a library pattern on also changes some ordinary transactions of the data set from about the day of its first case. A result with the pattern therefore differs from a result without it in more than the cases of the pattern. <a className="link" href="#/how">Section 2.8 of the method gives the figures</a>.</p>
        <p>The 6 difficulty settings of the bank do not change this pattern, apart from the share of accounts in more than one pattern.</p>
      </Section>
      <Section id="typical" n="5" title="A typical case" sub={typical ? `A case is one planted run of the pattern. This typical case has ${plural(typical.rows.length, "payment")} between ${plural(typical.parties.length, "party", "parties")}, moves ${fmtGbp(typical.value)} and lasts ${lengthText(caseMinutes(typical))}.${cap ? " The typical case is priced before that limit, so the cases of a data set are often smaller." : ""}` : undefined}>
        <p style={{ marginTop: 0 }}>This case is drawn from the files with a fixed seed number. It is not in the data set. In a data set, each payment that the bank records takes a time of day that ordinary customers use, so its time can differ from the time in this case. It follows the size, the speed and the end of section 4.</p>
        {typical && (
          <>
            <StepControls steps={typicalSteps} shown={typicalShown} onShown={setTypicalShown} />
            <FlowLedger view={typical} shown={typicalShown === null ? null : Math.max(1, Math.min(typicalShown, typicalSteps))} cal={typicalCal} />
          </>
        )}
      </Section>
      <Section id="cases" n="6" title="Cases in this data set">
        {waiting ?? (
          <>
            {own.length === 0 && skipped.length === 0 && <p style={{ marginTop: 0 }}>This data set holds no case of this pattern.{set.on ? "" : " Switch the pattern on in section 4 and make the data."} <a className="link" href="#/data">Make data</a></p>}
            {own.length > 0 && (
              <>
                <p style={{ marginTop: 0 }}>{plural(own.length, "case")} of this pattern {own.length === 1 ? "is" : "are"} in this data set.</p>
                <p>The data set was made with this pattern at {made.size === 1 ? "its own size" : `${sizePrefix(made.size)} its size`} and {made.speed === 1 ? "its own speed" : `${sizePrefix(made.speed)} its speed`}, and the bank sees {END_SENTENCE[made.bankSees].split(",")[0]}.</p>
                <p>{plural(reduced, "case")} {verb(reduced)} reduced. In a reduced case the bank wrote at least one payment for less than its planned amount. This happens where a customer held less on the day of a payment than the plan allowed for.</p>
                <p>{plural(cutShort, "case")} {verb(cutShort)} cut short. A cut short case has a main step with no payment, because the data set ended first. A payment above the Faster Payments limit goes by CHAPS and waits for a working day, and that wait moves the later payments of the case, so that more of them can fall after the last day.</p>
                {bankLegs > 0 && <p>{fmtPct(inFull / bankLegs)} of the payments of this pattern in the bank's records were written at their planned amount.</p>}
              </>
            )}
            {skipped.map((x) => {
              const n = x.cases;
              if (x.reason === "no-transaction") return <p key={x.reason}>{plural(n, "case")} {verb(n)} removed, because the bank wrote none of their payments.</p>;
              if (x.reason === "no-rail") return <p key={x.reason + x.need}>{plural(n, "case")} {verb(n)} not planted. A step of the pattern needs {RAIL_NEED[x.need ?? ""] ?? "a rail"}, which this bank does not offer.</p>;
              const useId = (x.party ?? "").split(".")[0];
              const label = PARTS.get(partIdOf(useId))?.parties.find((q) => `${useId}.${q.id}` === x.party)?.label ?? "A party";
              return <p key={x.reason + x.party}>{plural(n, "case")} {verb(n)} not planted. {capital(label)} needs {(x.need ?? "").replace("among the quarter that holds the most", "with a large balance")}, and the bank had no such account free.</p>;
            })}
            {capped && <p>The generator stopped planting this pattern at {fmtInt(LIBRARY_ROW_CAP)} rows.</p>}
            {own.length > 0 && view && chosen && cal && (
              <>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="field-label" htmlFor="case-pick">Choose a case</label>
                  <select id="case-pick" className="input select" value={chosen.caseId} onChange={(e) => { setKept(null); pick(e.target.value); }}>
                    {own.map((c) => <option key={c.caseId} value={c.caseId}>{option(c)}</option>)}
                  </select>
                </div>
                <p>Case {chosen.caseId} is planted as {view.keys.length === 1 ? "1 pattern" : `${view.keys.length} patterns with one case number`}: {view.keys.map((k) => patternLabel(k)).join(" and ")}.</p>
                <StepControls steps={stepCount} shown={shown} onShown={(n) => setKept({ ds, id: chosen.caseId, n })} />
                <FlowLedger key={chosen.caseId} view={view} shown={shown} cal={cal} />
              </>
            )}
          </>
        )}
      </Section>
      <NextStep href="#/data" title="Make data" line="Switch the pattern on or off, and make the data again." />
      </div>
    </Doc>
  );
}
