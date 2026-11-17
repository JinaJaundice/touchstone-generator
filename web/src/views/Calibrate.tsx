import { useState } from "react";
import { genActions as actions, useGenStore as useStore } from "../lib/genStore";
import { calibrate, figuresTemplate, readFigures, type Calibration } from "../lib/gen/calibrate";
import { Button, Disclosure, Note } from "../lib/ui";

/* Set the dials from a bank's own figures: the totals and shares a
   business-wide risk assessment already holds, pasted as a file. Each
   figure is reported with the dial it set and the value, and anything with
   no dial is reported as ignored. The first task of a tuning review. */

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Calibrate() {
  const s = useStore();
  const [text, setText] = useState("");
  const [cal, setCal] = useState<Calibration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = () => {
    const r = readFigures(text);
    if (!r.ok) { setError(r.error); setCal(null); return; }
    setError(null);
    setCal(calibrate(r.figures, s.config));
  };
  return (
    <Disclosure id="figures" title="Set the dials from your own figures" sub="the totals and shares a risk assessment already holds, pasted as a file to set the dials" count="a file">
      <p className="svc-p">Download the template, fill in the figures you have, paste the file here and read it. Every figure is shown with the dial it sets. Nothing you paste is sent anywhere. The page reads it in your browser.</p>
      <div className="btn-row">
        <Button small onClick={() => download("touchstone-figures.json", figuresTemplate(s.config))}>Download the template (JSON file)</Button>
      </div>
      <textarea className="input figures-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "format": "touchstone-figures/1", "accounts": 6000, "takenOnOnline": 0.4, ... }' aria-label="Your figures as a JSON file" />
      <div className="btn-row">
        <Button small onClick={read} disabled={!text.trim()}>Read the figures</Button>
        {cal && <Button small kind="primary" onClick={() => { actions.applyShared(cal.config); }}>Apply and make the data</Button>}
      </div>
      {error && <Note tone="noise">{error}</Note>}
      {cal && (
        <div className="calib-out">
          <div className="tbl-wrap" tabIndex={0}>
            <table className="tbl tbl-dense">
              <thead><tr><th>Figure</th><th>Dial</th><th>Set to</th></tr></thead>
              <tbody>
                {cal.applied.map((a) => <tr key={a.figure}><td className="val">{a.figure}</td><td>{a.dial}</td><td>{a.value}</td></tr>)}
                {cal.applied.length === 0 && <tr><td colSpan={3} className="faint">No figure in the file matched a dial.</td></tr>}
              </tbody>
            </table>
          </div>
          {cal.ignored.map((n) => <p key={n} className="faint">The page ignored an entry because {n}.</p>)}
          {cal.notes.map((n) => <p key={n} className="faint">{n}</p>)}
        </div>
      )}
    </Disclosure>
  );
}
