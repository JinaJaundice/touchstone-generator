import { useMemo, useState } from "react";
import { useGenStore } from "../lib/genStore";
import { caseView, libraryIdOf, listCases, mergeReferences, patternCases, patternSteps, stepTitle, typicalCaseView, type CaseSummary } from "../lib/gen/caseView";
import { makeCalendar } from "../lib/gen/calendar";
import { ALL_TYPOLOGIES, FAMILY_LABEL, FAMILY_OWNER, TYPOLOGY_FAMILY, patternFamily, patternLabel, patternShort, type Dataset, type Family, type GenConfig, type Typology } from "../lib/gen/types";
import references from "../lib/gen/patterns/references.json";
import labelsFile from "../lib/gen/patterns/labels.json";
import { PARTS, PATTERNS, patternOf } from "../lib/gen/patterns/index";
import type { Basis, Part, Pattern, Step } from "../lib/gen/patterns/types";
import { Doc, NextStep, PageHead, Section, Working, type ContentsItem } from "../lib/ui";
import { FAMILY_ORDER, Stepper } from "../lib/viz";
import { FlowLedger, StepControls } from "../lib/flow";
import { fmtGbp, fmtPct, plural } from "../lib/format";

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
      {making && <Working label={"Making the data: " + (stage ?? "")} />}
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
    ? <Working label={"Making the data: " + stage} />
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

/** The page of one library pattern: what it is, its value, its steps from the files, a typical case, the cases of the data set and its settings. */
function LibraryPatternPage({ id, ds, config, making, stage, caseParam }: { id: string; ds: Dataset | null; config: GenConfig; making: boolean; stage: string; caseParam: string | null }) {
  const pattern = patternOf(id) as Pattern;
  const source = PARTS.get(pattern.parts.source);
  const partList = [pattern.parts.source, ...pattern.parts.hiding, pattern.parts.cashOut].map((x) => PARTS.get(x)).filter((x): x is Part => !!x);
  const typical = useMemo(() => typicalCaseView(id), [id]);
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
  const range = pattern.value ?? (source && source.kind === "source" && "log" in source.value ? source.value : null);
  const valueBasis = pattern.value?.basis ?? (source && source.kind === "source" ? source.value.basis : null);
  const allReferences = useMemo(() => {
    return mergeReferences([pattern.references, ...partList.map((p) => p.references)]);
  }, [pattern, partList]);
  const verb = (n: number) => (n === 1 ? "was" : "were");

  const contents: ContentsItem[] = [
    { id: "what", n: "1", title: "What it is" },
    { id: "value", n: "2", title: "The value of a case" },
    { id: "steps", n: "3", title: "The steps" },
    { id: "typical", n: "4", title: "A typical case" },
    { id: "cases", n: "5", title: "Cases in this data set" },
    { id: "settings", n: "6", title: "Its settings" },
  ];
  const waiting = making
    ? <Working label={"Making the data: " + stage} />
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
              <tr><th scope="row">References</th><td>{allReferences.map((r) => <div key={r.id}>{sourceText(r.id, r.pages)}</div>)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="faint">Each S number is an entry in the list of sources. A page number counts the pages of the source's PDF file.</p>
      </Section>
      <Section id="value" n="2" title="The value of a case">
        {range && "log" in range
          ? <p style={{ marginTop: 0 }}>A case moves between {fmtGbp(range.log[0])} and {fmtGbp(range.log[1])}.{valueBasis ? <> <BasisText what="This range" basis={valueBasis} /></> : null}</p>
          : <p style={{ marginTop: 0 }}>The value of a case is the sum of the amounts that its own steps move.{valueBasis ? <> <BasisText what="This sum" basis={valueBasis} /></> : null}</p>}
      </Section>
      <Section id="steps" n="3" title="The steps" sub="A part is one piece of the method, such as the source, a way of hiding the money or the cash-out. The steps run in the order of the parts. Each step shows what happens, how the money moves and where the figures come from. Between 2 parts the funds move on in one payment, which the ledger shows as a step with the title Hand-off.">
        {partList.map((part) => (
          <div key={part.id} style={{ marginBottom: 18 }}>
            <h3 className="step-title" style={{ margin: "0 0 6px" }}>{PART_WORD[part.kind]}. {part.title}</h3>
            <ol className="stepper">
              {part.steps.map((s) => {
                number++;
                return (
                  <li key={s.id} className="step">
                    <div className="step-n val">{number}</div>
                    <div className="step-body">
                      <div className="step-title">{stepTitle(`${part.id}.${s.id}`)}</div>
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
      <Section id="typical" n="4" title="A typical case" sub={typical ? `A case is one planted run of the pattern. This typical case has ${plural(typical.rows.length, "payment")} between ${plural(typical.parties.length, "party", "parties")} and moves ${fmtGbp(typical.value)}.` : undefined}>
        <p style={{ marginTop: 0 }}>This case is drawn from the files with a fixed seed number. It is not in the data set. It is drawn with the pattern's own settings, in which the bank sees {END_SENTENCE[pattern.bankSees]}.</p>
        {typical && (
          <>
            <StepControls steps={typicalSteps} shown={typicalShown} onShown={setTypicalShown} />
            <FlowLedger view={typical} shown={typicalShown === null ? null : Math.max(1, Math.min(typicalShown, typicalSteps))} cal={typicalCal} />
          </>
        )}
      </Section>
      <Section id="cases" n="5" title="Cases in this data set">
        {waiting ?? (
          <>
            {own.length === 0 && skipped.length === 0 && <p style={{ marginTop: 0 }}>This data set holds no case of this pattern.{set.on ? "" : " Switch the pattern on under Adjust the bank on the Make data page and make the data."} <a className="link" href="#/data">Make data</a></p>}
            {own.length > 0 && (
              <>
                <p style={{ marginTop: 0 }}>{plural(own.length, "case")} of this pattern {own.length === 1 ? "is" : "are"} in this data set.</p>
                <p>{plural(reduced, "case")} {verb(reduced)} reduced. In a reduced case the bank wrote at least one payment for less than its planned amount. This happens where a customer held less on the day of a payment than the plan allowed for.</p>
                <p>{plural(cutShort, "case")} {verb(cutShort)} cut short. A cut short case has a main step with no payment, because the data set ended first. A payment above the Faster Payments limit goes by CHAPS and waits for a working day.</p>
                {bankLegs > 0 && <p>{fmtPct(inFull / bankLegs)} of the payments of this pattern in the bank's records were written at their planned amount.</p>}
              </>
            )}
            {skipped.map((x) => {
              const n = x.cases;
              if (x.reason === "no-transaction") return <p key={x.reason}>{plural(n, "case")} {verb(n)} removed, because the bank wrote none of their payments.</p>;
              if (x.reason === "no-rail") return <p key={x.reason + x.need}>{plural(n, "case")} {verb(n)} not planted. A step of the pattern needs {RAIL_NEED[x.need ?? ""] ?? "a rail"}, which this bank does not offer.</p>;
              const partId = (x.party ?? "").split(".")[0];
              const label = PARTS.get(partId)?.parties.find((q) => `${partId}.${q.id}` === x.party)?.label ?? "A party";
              return <p key={x.reason + x.party}>{plural(n, "case")} {verb(n)} not planted. {capital(label)} needs {(x.need ?? "").replace("among the quarter that holds the most", "with a large balance")}, and the bank had no such account free.</p>;
            })}
            {capped && <p>The generator stopped planting this pattern at 20,000 rows.</p>}
            {own.length > 0 && view && chosen && cal && (
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
            )}
          </>
        )}
      </Section>
      <Section id="settings" n="6" title="Its settings">
        <p style={{ marginTop: 0 }}>This pattern is switched {set.on ? "on" : "off"}. Its rate is {set.per1k} cases for each 1,000 accounts. <a className="link" href="#/data">Change the switch and the rate on the Make data page</a>. The bank sees {END_SENTENCE[set.bankSees]}. This release fixes the end that the bank sees, and a later release adds a control for it.</p>
        <p>Switching a library pattern on also changes some ordinary transactions of the data set from about the day of its first case. A result with the pattern therefore differs from a result without it in more than the cases of the pattern. <a className="link" href="#/how">Section 2.8 of the method gives the figures</a>.</p>
        <p>The 6 difficulty settings of the bank do not change this pattern, apart from the share of accounts in more than one pattern.</p>
      </Section>
      <NextStep href="#/data" title="Make data" line="Switch the pattern on or off, and make the data again." />
      </div>
    </Doc>
  );
}
