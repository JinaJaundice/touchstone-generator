import { useEffect, useMemo, useState } from "react";
import { genActions as actions, useGenStore as useStore } from "../lib/genStore";
import { normaliseConfig, normaliseMix } from "../lib/gen/config";
import { ARCHETYPE_ORDER, ARCHETYPES, DIAL_GROUPS, DIALS, DIFFICULTY, difficultyExact, difficultyIndex, encodeBank, estimate, nearestStep, onStep, STAT_LABELS, stats, type ArchetypeKey, type Dial, type DialGroup, type Glyph } from "../lib/gen/archetypes";
import { AML_TYPOLOGIES, CRYPTO_TYPOLOGIES, FRAUD_TYPOLOGIES, TYPOLOGY_LABEL, TYPOLOGY_SHORT, type CountryMix, type GenConfig, type Typology } from "../lib/gen/types";
import { Button, Disclosure, Field, Pill, Section, Seg, Slider, Toggle } from "../lib/ui";
import { Scales } from "../lib/viz";
import { fmtGbp, fmtInt, fmtNum, fmtPct } from "../lib/format";
import { RiskAssessment } from "./RiskAssessment";
import { Calibrate } from "./Calibrate";

/* The bank builder on two levels (docs/UX_RESEARCH.md, plan item 2).
   Level one: pick a bank type, read what you get, move the three dials
   people touch (accounts, days, difficulty), make the data. Level two: one
   folded row per dial group, one for every setting as a number, one for the
   bank read as a risk assessment. Nothing opens on its own. */

function GlyphIcon({ g }: { g: Glyph }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (g) {
    case "branch": return <svg viewBox="0 0 32 32" {...common}><path d="M4 12 L16 5 L28 12 Z" /><path d="M7 12 V24 M13 12 V24 M19 12 V24 M25 12 V24" /><path d="M4 24 H28 M5 28 H27" /></svg>;
    case "phone": return <svg viewBox="0 0 32 32" {...common}><rect x="9" y="3" width="14" height="26" rx="3" /><path d="M13 6 H19" /><circle cx="16" cy="25" r="1.2" fill="currentColor" /></svg>;
    case "house": return <svg viewBox="0 0 32 32" {...common}><path d="M5 15 L16 6 L27 15" /><path d="M8 13 V27 H24 V13" /><rect x="13.5" y="19" width="5" height="8" /></svg>;
    case "vault": return <svg viewBox="0 0 32 32" {...common}><rect x="4" y="5" width="24" height="22" rx="3" /><circle cx="16" cy="16" r="6" /><path d="M16 12 V16 L19 18" /><path d="M8 27 V29 M24 27 V29" /></svg>;
    case "card": return <svg viewBox="0 0 32 32" {...common}><rect x="3" y="8" width="26" height="17" rx="3" /><path d="M3 14 H29" /><path d="M8 20 H14" /></svg>;
    case "briefcase": return <svg viewBox="0 0 32 32" {...common}><rect x="4" y="10" width="24" height="16" rx="3" /><path d="M11 10 V7 A2 2 0 0 1 13 5 H19 A2 2 0 0 1 21 7 V10" /><path d="M4 17 H28" /></svg>;
    case "coin": return <svg viewBox="0 0 32 32" {...common}><circle cx="16" cy="16" r="11" /><path d="M16 9 V23 M12 13 H18.5 A2.5 2.5 0 0 1 18.5 18 H13.5 A2.5 2.5 0 0 0 13.5 23 H20" /></svg>;
  }
}

/** Set one share of a country mix and scale the other three to fill the rest. */
function rebalance(m: CountryMix, key: keyof CountryMix, v: number): CountryMix {
  const value = Math.max(0, Math.min(1, v));
  const keys = (["eea", "other", "corridor", "highRisk"] as const).filter((k) => k !== key);
  const rest = keys.reduce((a, k) => a + m[k], 0);
  const next = { ...m, [key]: value } as CountryMix;
  for (const k of keys) next[k] = rest > 0 ? m[k] * (1 - value) / rest : (1 - value) / 3;
  return normaliseMix(next, m);
}

function shareLink(cfg: GenConfig): string {
  return `${location.origin}${location.pathname}#/data?bank=${encodeBank(normaliseConfig(cfg))}`;
}

/* the dials people touch on every visit sit on level one */
const LEVEL_ONE = new Set(["accounts", "days"]);

function DialRow({ d, cfg }: { d: Dial; cfg: GenConfig }) {
  const idx = nearestStep(d, cfg);
  const exact = onStep(d, cfg);
  return (
    <div className="dial">
      <div className="dial-head">
        <span className="dial-label">{d.label}</span>
        <span className="dial-value val">{d.format(d.get(cfg))}{!exact && <span className="faint"> (exact)</span>}</span>
      </div>
      <div className="steps" role="radiogroup" aria-label={d.label}>
        {d.steps.map((stp, i) => (
          <button type="button" key={stp.label} role="radio" aria-checked={exact && i === idx} className={`dial-step ${exact && i === idx ? "on" : ""} ${!exact && i === idx ? "near" : ""}`} onClick={() => actions.setConfig(d.set(cfg, stp.value))} title={d.format(stp.value)}>
            {stp.label}
          </button>
        ))}
      </div>
      <div className="dial-help">{d.help}</div>
    </div>
  );
}

function DifficultyRow({ cfg }: { cfg: GenConfig }) {
  const dIdx = difficultyIndex(cfg);
  const dExact = difficultyExact(cfg);
  return (
    <div className="dial">
      <div className="dial-head"><span className="dial-label">How hard the crime is to spot</span><span className="dial-value val">{DIFFICULTY[dIdx].label}{!dExact && <span className="faint"> (custom)</span>}</span></div>
      <div className="steps difficulty" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTY.map((d, i) => (
          <button type="button" key={d.key} role="radio" aria-checked={dExact && i === dIdx} className={`dial-step ${dExact && i === dIdx ? "on" : ""} ${!dExact && i === dIdx ? "near" : ""}`} onClick={() => actions.setConfig(d.patch)}>{d.label}</button>
        ))}
      </div>
      <div className="dial-help">{DIFFICULTY[dIdx].line}</div>
    </div>
  );
}

export function BankBuilder() {
  const s = useStore();
  const cfg = s.config;
  const ds = s.dataset;
  const dirty = ds ? JSON.stringify(normaliseConfig(cfg)) !== JSON.stringify(ds.config) : true;
  const [name, setName] = useState(cfg.name);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setName(cfg.name); }, [cfg.name]);
  const est = useMemo(() => estimate(cfg), [cfg]);
  const st = useMemo(() => stats(cfg), [cfg]);
  const dIdx = difficultyIndex(cfg);
  // settings saved before the builder existed carry no key; match them by name
  const activeKey = (cfg.archetype as ArchetypeKey | undefined) ?? ARCHETYPE_ORDER.find((k) => ARCHETYPES[k].patch(cfg).name === cfg.name);
  const savedMatch = s.savedBanks.find((b) => JSON.stringify(b.config) === JSON.stringify(normaliseConfig(cfg)));
  const groups = DIAL_GROUPS.filter((g) => g.key !== "difficulty");
  const dialsOf = (g: DialGroup) => DIALS.filter((d) => d.group === g && !LEVEL_ONE.has(d.key));
  const patternsOn = [cfg.aml, cfg.fraud, cfg.crypto].reduce((a, fam) => a + Object.values(fam).filter((x) => x.enabled).length, 0);

  return (
    <>
      <Section id="type" n="1" title="Choose a bank type" sub="Seven kinds of bank, and any you have saved. Each sets every dial to a realistic value; the next section shows what that gives you.">
        <div className="archetypes" tabIndex={0} aria-label="Bank types">
          {ARCHETYPE_ORDER.map((k) => {
            const a = ARCHETYPES[k];
            const on = activeKey === k;
            return (
              <button type="button" key={k} className={`archetype ${on ? "on" : ""}`} onClick={() => actions.applyArchetype(k)} title={a.line} aria-pressed={on}>
                <span className="archetype-glyph"><GlyphIcon g={a.glyph} /></span>
                <b>{a.label}</b>
                <span className="archetype-line">{a.line}</span>
              </button>
            );
          })}
          {s.savedBanks.map((b) => (
            <button type="button" key={b.name} className={`archetype saved ${savedMatch?.name === b.name ? "on" : ""}`} onClick={() => actions.applySavedBank(b.name)} title={`Saved ${b.savedAt.slice(0, 10)}`} aria-pressed={savedMatch?.name === b.name}>
              <span className="archetype-glyph"><GlyphIcon g={(ARCHETYPES[b.config.archetype as ArchetypeKey]?.glyph) ?? "branch"} /></span>
              <b>{b.name}</b>
              <span className="archetype-line">Saved bank type. {fmtInt(b.config.accounts)} accounts, {b.config.days} days.</span>
              <span className="archetype-remove" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); actions.removeSavedBank(b.name); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); actions.removeSavedBank(b.name); } }} aria-label={`Remove ${b.name}`}>Remove</span>
            </button>
          ))}
        </div>
        <p className="archetype-desc">{activeKey ? <><b>{ARCHETYPES[activeKey].label}.</b> {ARCHETYPES[activeKey].line}</> : savedMatch ? <><b>{savedMatch.name}.</b> A saved bank type: {fmtInt(savedMatch.config.accounts)} accounts over {savedMatch.config.days} days.</> : <><b>{cfg.name}.</b> The bank as currently set: {fmtInt(cfg.accounts)} accounts over {cfg.days} days. Pick a type to start from a different kind of bank.</>}</p>
      </Section>

      <Section id="get" n="2" title="What you get" sub="The bank as set, before you make it. Move a dial and the figures follow. Making the largest bank takes about a quarter of a minute.">
        <div className="whatyouget">
          <div className="whatyouget-left builder-preview">
            <div className="preview-head">
              <input className="input preview-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name.trim() !== cfg.name) actions.setConfig({ name: name.trim().slice(0, 48) }); }} aria-label="Bank type name" />
            </div>
            <div className="preview-tags"><Pill tone={dIdx >= 2 ? "missed" : "muted"}>{DIFFICULTY[dIdx].label.toLowerCase()} difficulty</Pill>{activeKey && <Pill tone="brand">{ARCHETYPES[activeKey].label.toLowerCase()}</Pill>}</div>
            <div className="preview-stats">
              <div><b className="val">{fmtInt(est.accounts)}</b><span>accounts</span></div>
              <div><b className="val">about {fmtInt(est.txs)}</b><span>transactions in {cfg.days} days</span></div>
              <div><b className="val">about {fmtInt(est.patterns)}</b><span>crime patterns planted</span></div>
              <div><b className="val">{fmtPct(est.baseRate, 1)}</b><span>of accounts are crime</span></div>
            </div>
            <div className="preview-actions">
              <Button kind="primary" large onClick={() => actions.generate()} disabled={!!s.generating}>{s.generating ? `Making the data: ${s.generating.stage}` : dirty ? "Make the data" : s.seedPinned ? "Make it again" : "Make a new data set"}</Button>
              {s.error && !s.generating && <p className="gen-error" role="alert">The data could not be made: {s.error}. {s.dataset ? "The data set on screen is the one made before." : ""}</p>}
              <div className="btn-row">
                <span className="faint">{est.seconds < 1 ? "Under a second to make." : `About ${est.seconds.toFixed(0)} seconds to make.`}</span>
                <span className="grow" />
                <Button small kind="ghost" onClick={() => actions.saveBank(name.trim() || cfg.name)} disabled={!!savedMatch}>{savedMatch ? "Saved" : "Save this bank type"}</Button>
                <Button small kind="ghost" onClick={() => { navigator.clipboard.writeText(shareLink(cfg)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => setCopied(false)); }}>{copied ? "Link copied" : "Copy a link to it"}</Button>
              </div>
            </div>
            <Scales values={[st.size, st.speed, st.cash, st.crossBorder, st.crypto, st.newCustomers]} labels={Object.values(STAT_LABELS)} />
            <p className="preview-foot">seed number <span className="val">{cfg.seed}</span> · period <span className="val">{cfg.period ?? 1}</span>{s.seedPinned ? " · pinned" : " · a new seed number on every make"}{dirty && ds ? " · settings differ from the current data" : ""}</p>
          </div>
          <div className="whatyouget-right">
            {DIALS.filter((d) => LEVEL_ONE.has(d.key)).map((d) => <DialRow key={d.key} d={d} cfg={cfg} />)}
            <DifficultyRow cfg={cfg} />
          </div>
        </div>
      </Section>

      <Section id="adjust" n="3" title="Adjust the bank" sub="Every other setting, in the five groups a firm's risk assessment uses. Open a group to change it; the figures above follow. Most readers leave these as the bank type set them.">
        {groups.map((g) => {
          const dials = dialsOf(g.key);
          const count = g.key === "crime" ? `${patternsOn} patterns on` : `${dials.length} ${dials.length === 1 ? "dial" : "dials"}`;
          return (
            <Disclosure key={g.key} id={`group-${g.key}`} title={g.label} sub={g.line} count={count}>
              <div className="group-dials">
                {dials.map((d) => <DialRow key={d.key} d={d} cfg={cfg} />)}
                {g.key === "crime" && (
                  <div className="dial">
                    <div className="dial-head"><span className="dial-label">Which patterns are planted</span><span className="dial-value val">{patternsOn} on</span></div>
                    <div className="typo-grid">
                      <TypologyPanel title="Money laundering" family="aml" keys={AML_TYPOLOGIES} cfg={cfg.aml} accounts={cfg.accounts} />
                      <TypologyPanel title="Fraud" family="fraud" keys={FRAUD_TYPOLOGIES} cfg={cfg.fraud} accounts={cfg.accounts} />
                      <TypologyPanel title="Crypto" family="crypto" keys={CRYPTO_TYPOLOGIES} cfg={cfg.crypto} accounts={cfg.accounts} />
                    </div>
                    <div className="dial-help">The slider is a rate per 1,000 accounts; the figure on the right is the number of patterns at the current size.</div>
                  </div>
                )}
              </div>
            </Disclosure>
          );
        })}

        <Disclosure id="exact" title="Every setting as a number" sub="the exact values behind the steps, including AMLGentex's difficulty settings" count={`${DIALS.length + 10} settings`}>
          <div className="exact-group">
            <h4>Customers</h4>
            <div className="settings-grid">
              <Field label="Accounts" value={fmtInt(cfg.accounts)}><Slider value={cfg.accounts} min={200} max={12000} step={100} onChange={(v) => actions.setConfig({ accounts: v })} /></Field>
              <Field label="Days" value={cfg.days}><Slider value={cfg.days} min={28} max={180} step={1} onChange={(v) => actions.setConfig({ days: v })} /></Field>
              <Field label="Small firms" value={fmtPct(cfg.segments.sme)} hint="Personal customers take the rest."><Slider value={cfg.segments.sme} min={0} max={0.7} step={0.01} onChange={(v) => actions.setConfig({ segments: { ...cfg.segments, sme: v, retail: Math.max(0, 1 - v - cfg.segments.corporate - cfg.segments.private) } })} /></Field>
              <Field label="Corporates" value={fmtPct(cfg.segments.corporate)}><Slider value={cfg.segments.corporate} min={0} max={0.3} step={0.01} onChange={(v) => actions.setConfig({ segments: { ...cfg.segments, corporate: v, retail: Math.max(0, 1 - v - cfg.segments.sme - cfg.segments.private) } })} /></Field>
              <Field label="Private clients" value={fmtPct(cfg.segments.private)}><Slider value={cfg.segments.private} min={0} max={0.7} step={0.01} onChange={(v) => actions.setConfig({ segments: { ...cfg.segments, private: v, retail: Math.max(0, 1 - v - cfg.segments.sme - cfg.segments.corporate) } })} /></Field>
              <Field label="Politically exposed persons" value={`${(100 * cfg.customers.pepShare).toFixed(1)}%`} hint="Share of personal customers; private clients eight times as often."><Slider value={cfg.customers.pepShare} min={0} max={0.05} step={0.001} onChange={(v) => actions.setConfig({ customers: { ...cfg.customers, pepShare: v } })} /></Field>
              <Field label="Customers living outside the UK" value={fmtPct(cfg.customers.nonResidentShare)}><Slider value={cfg.customers.nonResidentShare} min={0} max={0.6} step={0.01} onChange={(v) => actions.setConfig({ customers: { ...cfg.customers, nonResidentShare: v } })} /></Field>
              <Field label="Small firms that are cash-based" value={fmtPct(cfg.customers.cashBusinessShare)}><Slider value={cfg.customers.cashBusinessShare} min={0} max={0.5} step={0.01} onChange={(v) => actions.setConfig({ customers: { ...cfg.customers, cashBusinessShare: v } })} /></Field>
              <Field label="Customers taken on online" value={fmtPct(cfg.customers.digitalShare)}><Slider value={cfg.customers.digitalShare} min={0} max={1} step={0.05} onChange={(v) => actions.setConfig({ customers: { ...cfg.customers, digitalShare: v } })} /></Field>
              <Field label="Accounts opened during the run" value={fmtPct(cfg.newAccountShare)}><Slider value={cfg.newAccountShare} min={0} max={0.4} step={0.01} onChange={(v) => actions.setConfig({ newAccountShare: v })} /></Field>
              <Field label="Seed" hint={s.seedPinned ? "Pinned: the same seed number and settings make the same data set again, down to the transaction." : "Every make draws a new seed number, so no two data sets are alike. Pin it to repeat a data set exactly."}>
                <div className="seed-row"><input className="input val" type="number" value={cfg.seed} onChange={(e) => { actions.setConfig({ seed: Number(e.target.value) || 0 }); actions.setSeedPinned(true); }} /><Button small onClick={() => actions.reseed()}>New seed</Button><Button small onClick={() => actions.nextPeriod()} disabled={!!s.generating}>Next period</Button></div>
                <div className="field-hint">Period {cfg.period ?? 1} of this bank. Next period keeps the bank, its customers and their relationships, and draws a new run of days and of crime.</div>
                <div className="field-row" style={{ marginTop: 6 }}><span className="field-label">Pin this seed</span><Toggle on={s.seedPinned} onChange={(v) => actions.setSeedPinned(v)} label="pin the seed number" /></div>
              </Field>
            </div>
          </div>
          <div className="exact-group">
            <h4>Products</h4>
            <div className="settings-grid">
              <Field label="Customers with a card" value={fmtPct(cfg.products.cards)}><Slider value={cfg.products.cards} min={0} max={1} step={0.01} onChange={(v) => actions.setConfig({ products: { ...cfg.products, cards: v } })} /></Field>
              <Field label="Personal customers with an overdraft" value={fmtPct(cfg.products.overdrafts)}><Slider value={cfg.products.overdrafts} min={0} max={0.7} step={0.01} onChange={(v) => actions.setConfig({ products: { ...cfg.products, overdrafts: v } })} /></Field>
              <div className="field">
                <div className="field-row"><span className="field-label">Cash services</span></div>
                <Seg size="sm" label="Cash services" value={cfg.products.cashServices} onChange={(k) => actions.setConfig({ products: { ...cfg.products, cashServices: k } })} options={[{ key: "none", label: "None" }, { key: "partner", label: "Partner counter" }, { key: "branch", label: "Branches and ATMs" }]} />
              </div>
              <div className="field">
                <div className="field-row"><span className="field-label">Payments abroad</span><Toggle on={cfg.products.international} onChange={(v) => actions.setConfig({ products: { ...cfg.products, international: v } })} label="payments abroad" /></div>
                <div className="field-hint">Off, nothing crosses a border except card payments on a trip.</div>
              </div>
              <Field label="Personal customers with a linked wallet" value={fmtPct(cfg.cryptoActiveShare)}><Slider value={cfg.cryptoActiveShare} min={0} max={0.6} step={0.01} onChange={(v) => actions.setConfig({ cryptoActiveShare: v })} /></Field>
            </div>
          </div>
          <div className="exact-group">
            <h4>Countries</h4>
            <div className="settings-grid">
              <Field label="Share of ordinary payments that go abroad" value={fmtPct(cfg.internationalShare)}><Slider value={cfg.internationalShare} min={0} max={0.3} step={0.01} onChange={(v) => actions.setConfig({ internationalShare: v })} /></Field>
              <Field label="Of payments abroad: to the European Economic Area" value={fmtPct(cfg.geography.corridorMix.eea)} hint="The four destination shares add up to 100%; moving one scales the others."><Slider value={cfg.geography.corridorMix.eea} min={0} max={1} step={0.01} onChange={(v) => actions.setConfig({ geography: { ...cfg.geography, corridorMix: rebalance(cfg.geography.corridorMix, "eea", v) } })} /></Field>
              <Field label="Of payments abroad: to other lower-risk countries" value={fmtPct(cfg.geography.corridorMix.other)}><Slider value={cfg.geography.corridorMix.other} min={0} max={1} step={0.01} onChange={(v) => actions.setConfig({ geography: { ...cfg.geography, corridorMix: rebalance(cfg.geography.corridorMix, "other", v) } })} /></Field>
              <Field label="Of payments abroad: to remittance corridors" value={fmtPct(cfg.geography.corridorMix.corridor)} hint="India, Pakistan, Nigeria, Ghana, Bangladesh, the Philippines, Jamaica, South Africa, Sri Lanka, the UAE, Turkey."><Slider value={cfg.geography.corridorMix.corridor} min={0} max={1} step={0.01} onChange={(v) => actions.setConfig({ geography: { ...cfg.geography, corridorMix: rebalance(cfg.geography.corridorMix, "corridor", v) } })} /></Field>
              <Field label="Of payments abroad: to FATF-listed countries" value={fmtPct(cfg.geography.corridorMix.highRisk)} hint="The FATF's call-for-action and increased-monitoring lists as of June 2026. The Money Laundering Regulations require enhanced due diligence for the first; the second is a risk factor to weigh."><Slider value={cfg.geography.corridorMix.highRisk} min={0} max={0.3} step={0.005} onChange={(v) => actions.setConfig({ geography: { ...cfg.geography, corridorMix: rebalance(cfg.geography.corridorMix, "highRisk", v) } })} /></Field>
              <Field label="Of customers living abroad: from FATF-listed countries" value={fmtPct(cfg.geography.homeMix.highRisk)}><Slider value={cfg.geography.homeMix.highRisk} min={0} max={0.3} step={0.005} onChange={(v) => actions.setConfig({ geography: { ...cfg.geography, homeMix: rebalance(cfg.geography.homeMix, "highRisk", v) } })} /></Field>
              <Field label="Of customers living abroad: from remittance corridors" value={fmtPct(cfg.geography.homeMix.corridor)}><Slider value={cfg.geography.homeMix.corridor} min={0} max={1} step={0.01} onChange={(v) => actions.setConfig({ geography: { ...cfg.geography, homeMix: rebalance(cfg.geography.homeMix, "corridor", v) } })} /></Field>
              <Field label="Banks" value={cfg.banks}><Slider value={cfg.banks} min={1} max={6} step={1} onChange={(v) => actions.setConfig({ banks: v })} /></Field>
            </div>
          </div>
          <div className="exact-group">
            <h4>Transactions</h4>
            <div className="settings-grid">
              <Field label="Activity level" value={`${fmtNum(cfg.activity, 1)}x`}><Slider value={cfg.activity} min={0.4} max={2} step={0.1} onChange={(v) => actions.setConfig({ activity: v })} /></Field>
              <Field label="Cash share of spending" value={fmtPct(cfg.cashShare)} hint="Applies where the bank offers cash at all."><Slider value={cfg.cashShare} min={0} max={0.4} step={0.01} onChange={(v) => actions.setConfig({ cashShare: v })} /></Field>
            </div>
          </div>
          <div className="exact-group">
            <h4>Difficulty: AMLGentex's tuning settings, one by one</h4>
            <div className="settings-grid">
              <Field label="Laundering amounts overlap ordinary amounts" value={fmtPct(cfg.amountOverlap)} hint="100% is the difficult setting: the two distributions match. At 0% laundering legs run four times larger."><Slider value={cfg.amountOverlap} min={0} max={1} step={0.05} onChange={(v) => actions.setConfig({ amountOverlap: v })} /></Field>
              <Field label="Burstiness" value={fmtNum(cfg.burstinessBias, 1)} hint="Negative spreads a pattern's legs across its period; positive piles them into a few days."><Slider value={cfg.burstinessBias} min={-4} max={4} step={0.5} onChange={(v) => actions.setConfig({ burstinessBias: v })} /></Field>
              <Field label="Pattern duration, mean days" value={cfg.durationMean}><Slider value={cfg.durationMean} min={4} max={70} step={1} onChange={(v) => actions.setConfig({ durationMean: v })} /></Field>
              <Field label="Fee skimmed at each layer" value={fmtPct(cfg.marginRatio)}><Slider value={cfg.marginRatio} min={0} max={0.25} step={0.01} onChange={(v) => actions.setConfig({ marginRatio: v })} /></Field>
              <Field label="Accounts in more than one pattern" value={fmtPct(cfg.multiPatternShare)}><Slider value={cfg.multiPatternShare} min={0} max={0.7} step={0.05} onChange={(v) => actions.setConfig({ multiPatternShare: v })} /></Field>
              <Field label="Launderers sit on connected accounts" value={fmtPct(cfg.centralityBias)} hint="Zero picks pattern members at random."><Slider value={cfg.centralityBias} min={0} max={1} step={0.05} onChange={(v) => actions.setConfig({ centralityBias: v })} /></Field>
              <Field label="Cash threshold structurers stay under" value={fmtGbp(cfg.cashThreshold)}><Slider value={cfg.cashThreshold} min={2000} max={20000} step={500} onChange={(v) => actions.setConfig({ cashThreshold: v })} /></Field>
              <Field label="Crypto information threshold" value={fmtGbp(cfg.travelRuleThreshold)} hint="UK: fuller originator and beneficiary information travels with a transfer of GBP 800 or more where one of the cryptoasset businesses is outside the UK."><Slider value={cfg.travelRuleThreshold} min={200} max={5000} step={100} onChange={(v) => actions.setConfig({ travelRuleThreshold: v })} /></Field>
              <div className="field">
                <div className="field-row"><span className="field-label">Record placements as transactions</span><Toggle on={cfg.visiblePlacement} onChange={(v) => actions.setConfig({ visiblePlacement: v })} label="visible placement" /></div>
                <div className="field-hint">On, laundering funds arrive as cash deposits or unexplained credits the rules can read. Off reproduces AMLGentex, where they appear in balances without a transaction.</div>
              </div>
              <div className="field">
                <div className="field-row"><span className="field-label">Laundering rides on existing relationships</span><Toggle on={!!cfg.ridesExistingLinks} onChange={(v) => actions.setConfig({ ridesExistingLinks: v })} label="laundering rides on existing relationships" /></div>
                <div className="field-hint">On, the layered patterns run between accounts that already pay one another. Each leg is sized like the payer's usual transfers, stays in the country, and no placement is recorded. The setting for testing a model that reads who pays whom.</div>
              </div>
            </div>
          </div>
        </Disclosure>

        <Calibrate />
        <Disclosure id="risk" title="The bank as a risk assessment" sub="the five factors a firm's business-wide risk assessment covers, read from the settings above" count="5 factors">
          <RiskAssessment cfg={cfg} />
        </Disclosure>
      </Section>
    </>
  );
}

function TypologyPanel({ title, family, keys, cfg, accounts }: { title: string; family: "aml" | "fraud" | "crypto"; keys: readonly Typology[]; cfg: Record<string, { enabled: boolean; per1k: number }>; accounts: number }) {
  const instances = (per1k: number) => Math.round(per1k * accounts / 1000);
  return (
    <div className="typo-panel">
      <div className="typo-panel-title">{title}</div>
      {keys.map((k) => {
        const c = cfg[k];
        return (
          <div className={`typo-row ${c.enabled ? "" : "off"}`} key={k}>
            <Toggle on={c.enabled} onChange={(v) => actions.setTypology(family, k, { enabled: v })} label={k} />
            <div className="typo-name" title={TYPOLOGY_LABEL[k]}>{TYPOLOGY_SHORT[k]}</div>
            <input className="typo-rate" type="range" min={0} max={5} step={0.1} value={c.per1k} disabled={!c.enabled} onChange={(e) => actions.setTypology(family, k, { per1k: Number(e.target.value) })} aria-label={`${k} rate`} />
            <div className="typo-count val">{c.enabled ? instances(c.per1k) : 0}</div>
          </div>
        );
      })}
    </div>
  );
}
