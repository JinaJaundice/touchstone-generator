import { useEffect, useRef, useState } from "react";
import { useHash } from "../lib/theme";
import { bootGen, genActions } from "../lib/genStore";
import { decodeBank } from "../lib/gen/archetypes";
import { loadWalletPoolFile } from "../lib/gen/client";
import ofacList from "../lib/lists/ofac.json";
import { Foot, Masthead } from "../shell";
import { DataStrip } from "../lib/ui";
import { Generate } from "../views/Generate";
import { Patterns } from "../views/Patterns";

/* The generator on its own: a masthead without links, the data strip, the footer
   and one of 2 views. The Make data view is the page for every address except
   #/data/patterns and the addresses below it, which show the patterns view. It makes the
   default data set once on load and reads a bank from a link of the form
   #/data?bank=... A link that carries a run belongs to the full app, so this
   page drops it and keeps the default data set. An address with ?case= is left as it is. */

const BASE_LINE = "Every figure on this page is about generated data. No real customer data is used anywhere.";

export default function GeneratorApp() {
  const hash = useHash();
  const [generated, setGenerated] = useState<boolean | null>(null);
  useEffect(() => {
    bootGen(["bank"]);
    loadWalletPoolFile().then((f) => setGenerated(f.generated));
  }, []);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(hash.split("?")[1] ?? "");
    // an address without a link key clears the mark, so the same link works again when it is opened a second time
    if (!p.has("bank") && !p.has("run")) { handled.current = null; return; }
    // the same address twice in a row is one link, which React's strict mode delivers twice in development
    if (handled.current === hash) return;
    handled.current = hash;
    const bank = p.get("bank");
    p.delete("bank"); p.delete("run");
    // the key leaves the address without a new entry in the history, so the Back button does not open the link again
    window.location.replace(hash.split("?")[0] + (p.toString() ? "?" + p.toString() : ""));
    if (bank === null) return;
    // a bank in the link is made as it is. A damaged or empty value makes the default data set, which the page left out at load.
    const cfg = bank ? decodeBank(bank) : null;
    if (cfg) genActions.applyShared(cfg); else void genActions.generate();
  }, [hash]);
  const query = hash.split("?")[1] ?? "";
  const page = hash.split("?")[0];
  // a new page opens at its top; the hash router would otherwise keep the scroll of the page before
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const onPatterns = page === "#/data/patterns" || page.startsWith("#/data/patterns/");
  const line = generated === null ? BASE_LINE
    // one crime pattern pays an address of OFAC's list, and those addresses are real entries of that public list
    : BASE_LINE + (generated ? ` Wallet addresses are generated and belong to no one, apart from ${ofacList.bitcoin.length} entries of OFAC's public sanctions list.` : " Wallet addresses on the crypto rail are public blockchain data.");
  return (
    <div className="app app-tool">
      <Masthead page="#/data" />
      <div className="wrap">{onPatterns ? <DataStrip empty="Make a data set on the Make data page" /> : <DataStrip />}</div>
      <main className="wrap main">{onPatterns ? <Patterns hash={page + (query ? "?" + query : "")} /> : <Generate />}</main>
      <Foot line={line} />
    </div>
  );
}
