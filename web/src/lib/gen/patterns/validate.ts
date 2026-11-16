/* The validator of the part and pattern files: the 10 checks of the specification (docs/PATTERN_FORMAT.md). A typed copy
   of the reference validator. Each error reads "<file id>: <field>: <message>", so a failing file is named with the field.
   Check 6 runs only where the set of source ids is given. Check 10 calls the expander with every count at its upper end
   (settings.atMax). A value read from a file enters as unknown, and the validator returns it as a Part or a Pattern. */

import { drawPlan } from "./expand";
import {
  ASSETS, CHAINS, CLASSES, COUNTRIES, FAMILIES, LEG_ROLES, METHODS, PAIRS, PARTY_KINDS, REASONS, ROLES, SEGMENTS, STATUSES, VIAS,
  isRail, resolveAssets,
} from "./types";
import type { Checked, Part, PartLookup, Pattern } from "./types";

/** A value that a file holds and that no check has yet looked at. The validator reads each field through a check before it relies on it. */
type Loose = any;
type Emit = (field: string, message: string) => void;
interface Ctx { e: Emit; known?: ReadonlySet<string> }

const UNITS: Record<string, number> = { minutes: 60 * 24 * 60, hours: 24 * 60, days: 60 }; // largest allowed value, 60 days
const obj = (v: unknown): v is Loose => v !== null && typeof v === "object" && !Array.isArray(v);

function fields(e: Emit, o: unknown, f: string, req: readonly string[], opt: readonly string[]): boolean {
  if (!obj(o)) { e(f, "must be an object"); return false; }
  for (const k of req) if (!(k in o)) e(`${f}.${k}`, "is required");
  for (const k of Object.keys(o)) if (!req.includes(k) && !opt.includes(k)) e(`${f}.${k}`, "is a field that the format does not list");
  return true;
}
const oneOf = (e: Emit, v: unknown, f: string, list: readonly unknown[]): boolean => list.includes(v) || (e(f, `must be one of ${list.join(", ")}`), false);
function text(e: Emit, v: unknown, f: string, max?: number): v is string {
  if (typeof v !== "string" || !v.trim()) { e(f, "must be text"); return false; }
  if (max && v.length > max) e(f, `is ${v.length} characters, over ${max}`);
  return true;
}
function sentences(e: Emit, v: unknown, f: string, maxS: number): void {
  if (!text(e, v, f)) return;
  const s = v.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (s.length > maxS) e(f, `has ${s.length} sentences, over ${maxS}`);
  for (const x of s) if (x.split(/\s+/).length > 30) e(f, "has a sentence over 30 words");
}
function range(e: Emit, v: unknown, f: string, lo: number, hi: number, int?: boolean): boolean {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) { e(f, "must be a Range [low, high]"); return false; }
  if (v[0] > v[1]) e(f, "has low above high");
  if (v[0] < lo || v[1] > hi) e(f, `must lie inside ${lo} to ${hi}`);
  if (int && !v.every(Number.isInteger)) e(f, "must hold whole numbers");
  return true;
}
function wait(e: Emit, o: Loose, f: string): void { // o holds exactly one of minutes, hours, days
  const u = Object.keys(UNITS).filter((k) => k in o);
  if (u.length !== 1) { e(f, "must hold exactly one of minutes, hours or days"); return; }
  range(e, o[u[0]], `${f}.${u[0]}`, 0, UNITS[u[0]]);
}
function srcId(c: Ctx, v: unknown, f: string): void {
  if (typeof v !== "string" || !/^S\d\d$/.test(v)) c.e(f, "must be a source id of the form S and 2 digits");
  else if (c.known && !c.known.has(v)) c.e(f, `source id ${v} is not in the references file`);
}
function basis(c: Ctx, b: Loose, f: string): void {
  const { e } = c;
  if (!obj(b)) { e(f, "must be a Basis object"); return; }
  if (b.kind === "reported") { fields(e, b, f, ["kind", "ref", "note"], ["pages"]); srcId(c, b.ref, `${f}.ref`); }
  else if (b.kind === "assumed") fields(e, b, f, ["kind", "note"], []);
  else { e(`${f}.kind`, "must be reported or assumed"); return; }
  text(e, b.note, `${f}.note`); if (typeof b.note === "string") sentences(e, b.note, `${f}.note`, 99); if ("pages" in b) text(e, b.pages, `${f}.pages`);
}
function refs(c: Ctx, list: unknown, f: string): void {
  if (!Array.isArray(list) || !list.length) { c.e(f, "needs at least 1 entry"); return; }
  list.forEach((x, i) => {
    if (!fields(c.e, x, `${f}[${i}]`, ["id"], ["pages", "note"])) return;
    srcId(c, x.id, `${f}[${i}].id`);
    for (const k of ["pages", "note"]) if (k in x) text(c.e, x[k], `${f}[${i}].${k}`);
  });
}
const idOk = (e: Emit, v: unknown, f: string): boolean => typeof v === "string" && /^[a-z0-9-]{3,48}$/.test(v) || (e(f, "must be 3 to 48 lower-case letters, digits or hyphens"), false);
function head(c: Ctx, j: Loose): void {
  const { e } = c;
  idOk(e, j.id, "id"); text(e, j.title, "title", 80); text(e, j.short, "short", 26);
  sentences(e, j.summary, "summary", 2); oneOf(e, j.status, "status", STATUSES); refs(c, j.references, "references");
}
const mk = (json: unknown): [string[], Emit] => {
  const id = obj(json) && typeof json.id === "string" ? json.id : "(no id)", errs: string[] = [];
  return [errs, (f, m) => errs.push(`${id}: ${f}: ${m}`)];
};
function done<T>(errs: string[], value?: T): Checked<T> {
  return errs.length ? { ok: false, errors: errs } : { ok: true, value: value as T };
}
const bankVia = (v: unknown): boolean => (Array.isArray(v) ? v : [v]).some((x) => typeof x === "string" && isRail(x));

// ---------- part ----------
const KREQ: Record<string, string[]> = { source: ["value", "traceClass", "gives", "exit"], hiding: ["routes", "entry", "exit", "hides"], "cash-out": ["takes", "entry"] };

/** Checks a part file against checks 1 to 7 and returns it as a Part, or the list of errors. */
export function validatePart(json: unknown, known?: ReadonlySet<string>): Checked<Part> {
  const [errs, e] = mk(json), c: Ctx = { e, known };
  if (!obj(json)) { e("(file)", "must be an object"); return done(errs); }
  if (!oneOf(e, json.kind, "kind", Object.keys(KREQ))) return done(errs);
  const hid = json.kind === "hiding";
  if (!fields(e, json, "(file)", ["schema", "id", "kind", "title", "short", "summary", "status", "references", "parties", "steps", ...KREQ[json.kind]], hid ? [] : ["family"])) return done(errs);
  if (json.schema !== "touchstone-part/1") e("schema", "must be touchstone-part/1");
  head(c, json);
  const parties: Loose[] = Array.isArray(json.parties) ? json.parties : [], steps: Loose[] = Array.isArray(json.steps) ? json.steps : [];
  if (!parties.length || parties.length > 8) e("parties", "must hold 1 to 8 parties");
  if (!steps.length || steps.length > 8) e("steps", "must hold 1 to 8 steps");
  const byId: Record<string, Loose> = {}, hasCust = parties.some((p) => obj(p) && p.kind === "customer");
  if (hasCust && !hid && !("family" in json)) e("family", "is required where the part has a customer party");
  if ("family" in json) oneOf(e, json.family, "family", FAMILIES);
  parties.forEach((p, i) => party(c, p, i, byId));
  if (hid && hasCust) e("parties", "a hiding part has no customer party (check 4)");
  for (const k of ["entry", "exit"]) if (k in json && !byId[json[k]]) e(k, `names no party (${json[k]})`);
  if (json.kind === "source") source(c, json);
  if (json.kind === "hiding") {
    if (!Array.isArray(json.routes) || !json.routes.length) e("routes", "needs at least 1 route");
    else json.routes.forEach((r: Loose, i: number) => {
      if (!fields(e, r, `routes[${i}]`, ["from", "to"], [])) return;
      oneOf(e, r.from, `routes[${i}].from`, [...PAIRS, "any"]); oneOf(e, r.to, `routes[${i}].to`, [...PAIRS, "same"]);
    });
    if (fields(e, json.hides, "hides", ["chance", "basis"], [])) {
      if (!(json.hides.chance >= 0 && json.hides.chance <= 1)) e("hides.chance", "must be 0 to 1");
      basis(c, json.hides.basis, "hides.basis");
    }
  }
  if (json.kind === "cash-out" && json.takes !== "any" && !(Array.isArray(json.takes) && json.takes.length && json.takes.every((x: unknown) => (PAIRS as readonly unknown[]).includes(x))))
    e("takes", "must be any or a list of assets on a chain");
  const seen: Record<string, number> = {};
  steps.forEach((s, i) => { step(c, json, s, i, byId, seen); if (obj(s)) seen[s.id] = i; });
  return done(errs, json as Part);
}
function party(c: Ctx, p: Loose, i: number, byId: Record<string, Loose>): void {
  const { e } = c, f = `parties[${i}]`;
  if (!obj(p)) { e(f, "must be an object"); return; }
  const cust = p.kind === "customer";
  fields(e, p, f, ["id", "kind", "label", ...(cust ? ["role"] : [])], ["chain", ...(cust ? ["count", "pick"] : ["reuse", "country"]), ...(p.kind === "wallet" ? ["known"] : [])]);
  if (typeof p.id !== "string" || !/^[^.#\s]+$/.test(p.id)) e(`${f}.id`, "must be text without '.', '#' or spaces");
  else if (byId[p.id]) e(`${f}.id`, `${p.id} is used twice`); else byId[p.id] = p;
  oneOf(e, p.kind, `${f}.kind`, PARTY_KINDS); text(e, p.label, `${f}.label`, 60);
  if ("chain" in p) oneOf(e, p.chain, `${f}.chain`, CHAINS);
  if (cust) {
    oneOf(e, p.role, `${f}.role`, ROLES);
    if ("count" in p) range(e, p.count, `${f}.count`, 1, 40, true);
    if (obj(p.pick)) {
      fields(e, p.pick, `${f}.pick`, [], ["segments", "minAge", "maxAge", "openedWithinDays", "hasWallet", "hasCard", "cashBusiness", "balance"]);
      const k = p.pick;
      if ("segments" in k && !(Array.isArray(k.segments) && k.segments.length && k.segments.every((x: unknown) => (SEGMENTS as readonly unknown[]).includes(x)))) e(`${f}.pick.segments`, "must list retail, sme, corporate or private");
      for (const n of ["minAge", "maxAge", "openedWithinDays"]) if (n in k && !(k[n] >= 0)) e(`${f}.pick.${n}`, "must be a number");
      for (const n of ["hasWallet", "hasCard", "cashBusiness"]) if (n in k && typeof k[n] !== "boolean") e(`${f}.pick.${n}`, "must be true or false");
      if ("balance" in k) oneOf(e, k.balance, `${f}.pick.balance`, ["top-quarter"]);
    } else if ("pick" in p) e(`${f}.pick`, "must be an object");
  } else {
    if ("reuse" in p) oneOf(e, p.reuse, `${f}.reuse`, ["leg", "case"]);
    if ("country" in p) oneOf(e, p.country, `${f}.country`, COUNTRIES);
    if ("known" in p && fields(e, p.known, `${f}.known`, ["chance", "class", "basis"], [])) {
      if (!(p.known.chance >= 0 && p.known.chance <= 1)) e(`${f}.known.chance`, "must be 0 to 1");
      oneOf(e, p.known.class, `${f}.known.class`, CLASSES); basis(c, p.known.basis, `${f}.known.basis`);
    }
  }
}
function source(c: Ctx, j: Loose): void {
  const { e } = c, v = j.value;
  if (obj(v) && "from" in v) { fields(e, v, "value", ["from", "basis"], []); oneOf(e, v.from, "value.from", ["steps"]); }
  else if (fields(e, v, "value", ["log", "basis"], ["capByBalance"])) {
    range(e, v.log, "value.log", 0, Infinity);
    if (Array.isArray(v.log) && !(v.log[0] > 0)) e("value.log", "low must be above 0 (a logarithm is drawn)");
    if ("capByBalance" in v && !(v.capByBalance > 0 && v.capByBalance <= 1)) e("value.capByBalance", "must be above 0 and at most 1");
  }
  if (obj(v)) basis(c, v.basis, "value.basis");
  text(e, j.traceClass, "traceClass"); if (typeof j.traceClass === "string") oneOf(e, j.traceClass, "traceClass", CLASSES);
  if (!Array.isArray(j.gives) || j.gives.length < 1 || j.gives.length > 3 || !j.gives.every((x: unknown) => (PAIRS as readonly unknown[]).includes(x))) e("gives", "must list 1 to 3 assets on a chain");
}
function amount(c: Ctx, s: Loose, f: string, own: boolean, v: Loose): void {
  const { e } = c, a = s.amount;
  if (!obj(a)) { e(f, "must be an object"); return; }
  if ("of" in a) {
    fields(e, a, f, ["of", "share"], []); oneOf(e, a.of, `${f}.of`, ["value", "held", "leg"]); range(e, a.share, `${f}.share`, 0, 1);
    if (a.of === "value" && !own) e(f, "of value is allowed only with pays own");
    if (a.of !== "value" && own) e(f, `of ${a.of} is allowed only with pays case`);
    if (a.of === "leg" && s.start?.per !== "leg") e(f, "of leg needs start.per leg");
    if (v?.from === "steps" && a.of === "value") e(f, "a value taken from steps cannot use of value");
  } else if ("gbp" in a) { fields(e, a, f, ["gbp"], []); range(e, a.gbp, `${f}.gbp`, 0, Infinity); }
  else if ("under" in a) { fields(e, a, f, ["under", "share"], []); oneOf(e, a.under, `${f}.under`, ["cashThreshold", "travelRuleThreshold"]); range(e, a.share, `${f}.share`, 0, 1); }
  else e(f, "must hold of, gbp or under");
}
function step(c: Ctx, p: Loose, s: Loose, i: number, byId: Record<string, Loose>, seen: Record<string, number>): void {
  const { e } = c, f = `steps[${i}]`;
  if (!obj(s)) { e(f, "must be an object"); return; }
  const K: Record<string, string[]> = { move: ["times", "between", "split", "pays", "each"], chain: ["through", "between", "peel"], split: ["ways", "over", "gather"] };
  if (!oneOf(e, s.kind, `${f}.kind`, Object.keys(K))) return;
  const need = ["id", "kind", "say", "from", "to", "via", "asset", "amount", "start", "need", "varies", "basis"];
  fields(e, s, f, need.concat(s.kind === "split" ? ["ways", "over"] : s.kind === "chain" ? ["through"] : []), ["chance", "legRole", "facts", ...K[s.kind]]);
  if (typeof s.id !== "string" || !/^[^.#\s]+$/.test(s.id)) e(`${f}.id`, "must be text without '.', '#' or spaces");
  else if (s.id === "handoff") e(`${f}.id`, "handoff is reserved"); else if (s.id in seen) e(`${f}.id`, `${s.id} is used twice`);
  sentences(e, s.say, `${f}.say`, 1);
  for (const k of ["from", "to"]) if (!byId[s[k]]) e(`${f}.${k}`, `names no party (${s[k]})`);
  const vias: Loose[] = Array.isArray(s.via) ? s.via : [s.via];
  if (Array.isArray(s.via) && (s.via.length < 2 || s.via.length > 4)) e(`${f}.via`, "a list holds 2 to 4 rails");
  vias.forEach((x) => oneOf(e, x, `${f}.via`, VIAS));
  const asset = s.asset;
  if (asset === "in" && p.kind === "source") e(`${f}.asset`, "in is not allowed in a source part");
  else if (asset === "out" && p.kind === "cash-out") e(`${f}.asset`, "out is not allowed in a cash-out part");
  else if (asset !== "in" && asset !== "out") oneOf(e, asset, `${f}.asset`, ASSETS);
  const own = s.pays === "own";
  if ("pays" in s) oneOf(e, s.pays, `${f}.pays`, ["case", "own"]);
  amount(c, s, `${f}.amount`, own, p.value);
  if (fields(e, s.start, `${f}.start`, ["after"], ["per", ...Object.keys(UNITS)])) {
    const a = s.start.after;
    if (a === "entry" && p.kind === "source") e(`${f}.start.after`, "entry is not allowed in a source part");
    else if (a !== "case" && a !== "entry" && !(a in seen)) e(`${f}.start.after`, `names no earlier step (${a})`);
    if ("per" in s.start) { oneOf(e, s.start.per, `${f}.start.per`, ["leg"]); if (a === "case" || a === "entry") e(`${f}.start.per`, "needs a step id in after"); }
    wait(e, s.start, `${f}.start`);
  }
  basis(c, s.basis, `${f}.basis`);
  oneOf(e, s.need, `${f}.need`, ["required", "supporting"]); oneOf(e, s.varies, `${f}.varies`, ["stable", "rotating", "ephemeral"]);
  if (s.need === "supporting" && !(s.chance >= 0 && s.chance <= 1)) e(`${f}.chance`, "a supporting step needs a chance from 0 to 1");
  if (s.need === "required" && "chance" in s) e(`${f}.chance`, "a required step has no chance");
  if (bankVia(s.via) && !("legRole" in s)) e(`${f}.legRole`, "is required where a via is a rail of the bank");
  { // check 3: a card leg is sent by a customer who holds a card
    const pv: Loose[] = obj(s.peel) && s.peel.via ? [].concat(s.peel.via) : obj(s.peel) ? vias : [];
    const senders = new Set<string>();
    if (vias.includes("card")) { senders.add(s.from); if (obj(s.through) && s.through.party) senders.add(s.through.party); }
    if (pv.includes("card") && obj(s.through)) senders.add(s.through.party ?? "(new parties)");
    for (const id of senders) { const q = byId[id]; if (!q || q.kind !== "customer" || !(obj(q.pick) && q.pick.hasCard === true)) e(`${f}.via`, `card needs a customer sender with pick.hasCard true (${id})`); }
  }
  if ("legRole" in s) oneOf(e, s.legRole, `${f}.legRole`, LEG_ROLES);
  if (obj(s.facts)) {
    fields(e, s.facts, `${f}.facts`, [], ["method", "mcc", "reason", "payeeType", "callActive", "remoteAccess", "newDevice"]);
    const k = s.facts;
    if ("method" in k) oneOf(e, k.method, `${f}.facts.method`, METHODS);
    if ("reason" in k) oneOf(e, k.reason, `${f}.facts.reason`, REASONS);
    if ("payeeType" in k) oneOf(e, k.payeeType, `${f}.facts.payeeType`, ["personal", "business"]);
    if ("mcc" in k && !Number.isInteger(k.mcc)) e(`${f}.facts.mcc`, "must be a whole number");
    for (const n of ["callActive", "remoteAccess", "newDevice"]) if (n in k && typeof k[n] !== "boolean") e(`${f}.facts.${n}`, "must be true or false");
  } else if ("facts" in s) e(`${f}.facts`, "must be an object");
  if (vias.includes("bank-crypto")) { // check 3
    if (asset !== "BTC") e(`${f}.asset`, "a bank-crypto step has the asset BTC (check 3)");
    if (byId[s.from]?.kind !== "customer" && byId[s.to]?.kind !== "customer") e(`${f}`, "a bank-crypto step has a customer at one end (check 3)");
  }
  if (p.kind === "hiding" && bankVia(s.via)) e(`${f}.via`, "a hiding part has no rail of the bank (check 4)");
  if ("between" in s && obj(s.between)) wait(e, s.between, `${f}.between`); else if ("between" in s) e(`${f}.between`, "must be a Wait");
  if (s.kind === "move") {
    if ("times" in s) range(e, s.times, `${f}.times`, 1, 20, true);
    if ("split" in s) oneOf(e, s.split, `${f}.split`, ["even", "uneven", "rising"]);
    if ("each" in s && byId[s.each]?.kind !== "customer") e(`${f}.each`, "must name a customer party");
  } else if (s.kind === "chain") {
    const t = s.through;
    if (obj(t) && "party" in t) { fields(e, t, `${f}.through`, ["party"], []); if (byId[t.party]?.kind !== "customer") e(`${f}.through.party`, "must name a customer party"); }
    else if (fields(e, t, `${f}.through`, ["new", "count"], [])) { oneOf(e, t.new, `${f}.through.new`, PARTY_KINDS); range(e, t.count, `${f}.through.count`, 1, 400, true); }
    if ("peel" in s && fields(e, s.peel, `${f}.peel`, ["to", "share", "say"], ["via", "fromHop"])) {
      if (!byId[s.peel.to]) e(`${f}.peel.to`, `names no party (${s.peel.to})`);
      range(e, s.peel.share, `${f}.peel.share`, 0, 1); text(e, s.peel.say, `${f}.peel.say`);
      if ("via" in s.peel) (Array.isArray(s.peel.via) ? s.peel.via : [s.peel.via]).forEach((x: unknown) => oneOf(e, x, `${f}.peel.via`, VIAS));
      if ("fromHop" in s.peel && !(Number.isInteger(s.peel.fromHop) && s.peel.fromHop >= 1)) e(`${f}.peel.fromHop`, "must be a whole number from 1");
    }
  } else {
    range(e, s.ways, `${f}.ways`, 2, 60, true);
    if (obj(s.over)) wait(e, s.over, `${f}.over`); else e(`${f}.over`, "must be a Wait");
    if ("gather" in s && typeof s.gather !== "boolean") e(`${f}.gather`, "must be true or false");
  }
}

// ---------- pattern ----------
const getter = (m: PartLookup) => (id: string): Part | undefined => (m instanceof Map ? m.get(id) : (m as Readonly<Record<string, Part>>)?.[id]);

/** Checks a pattern file against checks 1 to 10 and returns it as a Pattern, or the list of errors. */
export function validatePattern(json: unknown, partsById: PartLookup, known?: ReadonlySet<string>): Checked<Pattern> {
  const [errs, e] = mk(json), c: Ctx = { e, known }, get = getter(partsById);
  if (!fields(e, json, "(file)", ["schema", "id", "title", "short", "summary", "status", "parts", "bankSees", "per1k", "references"], ["value"])) return done(errs);
  const j = json as Loose;
  if (j.schema !== "touchstone-pattern/1") e("schema", "must be touchstone-pattern/1");
  head(c, j); oneOf(e, j.bankSees, "bankSees", ["source", "cash-out", "both"]);
  if (!(j.per1k >= 0 && j.per1k <= 5)) e("per1k", "must be 0 to 5");
  const p = j.parts;
  if (!fields(e, p, "parts", ["source", "hiding", "cashOut"], [])) return done(errs);
  if (!Array.isArray(p.hiding) || p.hiding.length > 6) { e("parts.hiding", "must be a list of 0 to 6 part ids"); return done(errs); }
  const look = (id: string, f: string, kind: string): Part | undefined => {
    const x = get(id);
    if (!x) e(f, `names no part (${id})`); else if (x.kind !== kind) e(f, `${id} is a ${x.kind} part and a ${kind} part is needed`);
    return x;
  };
  const s = look(p.source, "parts.source", "source"), co = look(p.cashOut, "parts.cashOut", "cash-out");
  const hs = p.hiding.map((id: string, i: number) => look(id, `parts.hiding[${i}]`, "hiding"));
  if (errs.length || !s || !co || hs.includes(undefined)) return done(errs);
  if (!resolveAssets(j, partsById)) e("parts", "the assets do not join (check 8)");
  const cust = (x: Part): boolean => x.parties.some((q) => q.kind === "customer");
  if ("value" in j) { // section 3: the slice of the proceeds that one case of the pattern follows
    const v = j.value;
    if (fields(e, v, "value", ["log", "basis"], [])) {
      range(e, v.log, "value.log", 0, Infinity);
      if (Array.isArray(v.log) && !(v.log[0] > 0)) e("value.log", "low must be above 0 (a logarithm is drawn)");
      basis(c, v.basis, "value.basis");
    }
    const sv = s.kind === "source" ? s.value : null;
    if (cust(s) || !sv || !("log" in sv) || "capByBalance" in sv) e("value", "is allowed only where the source part has no customer party and a log value");
  }
  if (cust(s) && cust(co) && typeof j.short === "string" && j.short.length > 15) e("short", "has more than 15 characters, and both ends have customers (section 3)");
  if (["source", "both"].includes(j.bankSees) && !cust(s)) e("bankSees", "the source end has no customer party (check 9)");
  if (["cash-out", "both"].includes(j.bankSees) && !cust(co)) e("bankSees", "the cash-out end has no customer party (check 9)");
  if (!errs.length) { // check 10
    try {
      const n = drawPlan(j as Pattern, partsById, { size: 1, speed: 1, bankSees: j.bankSees, atMax: true }, () => 0.5).legs.length;
      if (n > 3000) e("parts", `a case with every count at its upper end has ${n} legs, over 3000 (check 10)`);
    } catch (x) { e("parts", `the expander failed at the upper end: ${(x as Error).message}`); }
  }
  return done(errs, j as Pattern);
}
