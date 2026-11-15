import { useMemo, useState } from "react";
import { useGenStore } from "../lib/genStore";
import { caseView, listCases, patternCases, patternSteps, stepTitle, type CaseSummary } from "../lib/gen/caseView";
import { makeCalendar } from "../lib/gen/calendar";
import { ALL_TYPOLOGIES, FAMILY_LABEL, FAMILY_OWNER, TYPOLOGY_FAMILY, TYPOLOGY_LABEL, TYPOLOGY_SHORT, type Dataset, type Family, type Typology } from "../lib/gen/types";
import references from "../lib/gen/patterns/references.json";
import { Doc, NextStep, PageHead, Section, Working, type ContentsItem } from "../lib/ui";
import { FAMILY_ORDER, Stepper } from "../lib/viz";
import { FlowLedger, StepControls } from "../lib/flow";
import { dayLabel, fmtGbp, plural } from "../lib/format";

/* The patterns pages of the generator: the list of every crime pattern and the page of one pattern, where its planted
   cases are drawn one step at a time. They read the generator store only and link only to pages of the generator. */

const SOURCE_TITLE = new Map(references.sources.map((x) => [x.id, x.title]));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A sentence with a full stop at its end. */
const stop = (s: string) => (s.endsWith(".") ? s : s + ".");
const ROOT = "#/data/patterns/";
const FAMILIES = (FAMILY_ORDER as Family[]).filter((f) => ALL_TYPOLOGIES.some((t) => TYPOLOGY_FAMILY[t] === f));

/** The page of the patterns, from its address and query, such as "#/data/patterns/mule_herd?case=412". */
export function Patterns({ hash }: { hash: string }) {
  const [route, query = ""] = hash.split("?");
  const rest = route.startsWith(ROOT) ? route.slice(ROOT.length).replace(/\/$/, "") : "";
  let name = rest;
  try { name = decodeURIComponent(rest); } catch { /* an address that does not decode names no pattern */ }
  const s = useGenStore();
  const ds = s.dataset;
  if (!name) return <PatternList ds={ds} stage={s.generating?.stage ?? null} making={s.generating !== null} />;
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
function PatternList({ ds, making, stage }: { ds: Dataset | null; making: boolean; stage: string | null }) {
  const contents: ContentsItem[] = FAMILIES.map((f, i) => ({ id: "family-" + f, n: String(i + 1), title: FAMILY_LABEL[f] }));
  const counts = useMemo(() => {
    const per = new Map<string, Set<number>>();
    if (ds) for (const p of ds.patterns) if (p.caseId >= 0) { const set = per.get(p.typology); if (set) set.add(p.caseId); else per.set(p.typology, new Set([p.caseId])); }
    return per;
  }, [ds]);
  return (
    <Doc contents={contents}>
      <PageHead title="Every crime pattern the generator can plant"
        sub={`The generator plants ${ALL_TYPOLOGIES.length} crime patterns in ${FAMILIES.length} families. Each name opens the page of the pattern, where its planted cases are drawn one step at a time.`}
        right={<a className="btn btn-sm" href="#/data">Back to Make data</a>} />
      {making && <Working label={"Making the data: " + (stage ?? "")} />}
      {!making && !ds && <p>Make the data to see how many cases of each pattern it holds. <a className="link" href="#/data">Make data</a></p>}
      {FAMILIES.map((f, i) => (
        <Section key={f} id={"family-" + f} n={String(i + 1)} title={FAMILY_LABEL[f]} sub={"Handled by " + FAMILY_OWNER[f] + "."}>
          <div className="tbl-wrap" tabIndex={0}>
            <table className="tbl">
              <thead><tr><th scope="col">Crime pattern</th><th scope="col" className="num">Cases in this data set</th></tr></thead>
              <tbody>
                {ALL_TYPOLOGIES.filter((t) => TYPOLOGY_FAMILY[t] === f).map((t) => (
                  <tr key={t}>
                    <td><a className="link" href={ROOT + t}>{TYPOLOGY_LABEL[t]}</a></td>
                    <td className="num val">{making ? <span className="faint">being made</span> : ds ? (counts.get(t)?.size ?? 0) : <span className="faint">no data yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      <NextStep href="#/data" title="Make data" line="Choose the bank, switch crime patterns on or off, and make the data again." />
    </Doc>
  );
}

/** The page of one crime pattern: what it is, its steps and a drawn case. */
function PatternPage({ name, ds, making, stage, caseParam }: { name: Typology; ds: Dataset | null; making: boolean; stage: string; caseParam: string | null }) {
  const family = TYPOLOGY_FAMILY[name];
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
  const option = (c: CaseSummary) => `Case ${c.caseId}, ${fmtGbp(c.value)}, ${plural(c.legs, "payment")}, from ${cal ? dayLabel(cal.date(c.startDay), cal.weekday(c.startDay)) : "day " + (c.startDay + 1)}`;

  return (
    <Doc contents={contents}>
      <PageHead title={TYPOLOGY_LABEL[name]} sub={`One of the ${ALL_TYPOLOGIES.length} crime patterns that the generator can plant. This page gives its steps and draws each of its cases in the current data set.`} right={<a className="btn btn-sm" href="#/data/patterns">Every crime pattern</a>} />
      <Section id="what" n="1" title="What it is">
        <div className="tbl-wrap" tabIndex={0}>
          <table className="tbl">
            <tbody>
              <tr><th scope="row">Shown in tables as</th><td>{TYPOLOGY_SHORT[name]}</td></tr>
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
