/* The state of the generator: the configuration, the data set on screen and
   the progress of a make. A second store may hook into a make through onMake,
   as the bench store of the working repository does. One notifier serves both
   stores, so a batch can send one notification for a change in both. */

import { useSyncExternalStore } from "react";
import { DEFAULT_CONFIG, normaliseConfig, PRESETS, type PresetKey } from "./gen/config";
import { ARCHETYPES, loadSavedBanks, storeSavedBanks, type ArchetypeKey, type SavedBank } from "./gen/archetypes";
import type { Dataset, GenConfig } from "./gen/types";
import { runGenerator, type GenProgress } from "./gen/client";
import { fingerprint } from "./gen/fingerprint";

export interface GenState {
  config: GenConfig;
  dataset: Dataset | null;
  generating: GenProgress | null;
  genMs: number | null;
  error: string | null;
  /** off (the default): every make draws a new seed, so no two data sets are alike; on: the same seed makes the same data set again */
  seedPinned: boolean;
  /** eight hex characters over the transactions of the data set on screen */
  fingerprint: string | null;
  /** bank types the user saved, newest first */
  savedBanks: SavedBank[];
}

export interface MakeHooks {
  start?: () => void;
  prepare?: { label: string; run: (ds: Dataset) => void };
  done?: (ds: Dataset) => void;
}

const KEY = "touchstone-config-v1";
const SEED_PINNED_KEY = "touchstone:seed-pinned";

/** The object stored under the settings key, or an empty object. */
export function loadSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch { return {}; }
}

/** Replace the fields of the patch in the stored object and keep every other field. */
export function saveSettings(patch: Record<string, unknown>): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...patch })); } catch { /* ignore */ }
}

function loadConfig(): GenConfig {
  const s = loadSettings();
  if (!Object.keys(s).length) return DEFAULT_CONFIG;
  // a stored configuration that cannot be read gives the default bank, as a missing one does
  try {
    const c = (s.config ?? {}) as Partial<GenConfig>;
    return normaliseConfig({ ...DEFAULT_CONFIG, ...c, aml: { ...DEFAULT_CONFIG.aml, ...(c.aml ?? {}) }, fraud: { ...DEFAULT_CONFIG.fraud, ...(c.fraud ?? {}) }, crypto: { ...DEFAULT_CONFIG.crypto, ...(c.crypto ?? {}) } });
  } catch { return DEFAULT_CONFIG; }
}

let state: GenState = {
  config: loadConfig(),
  dataset: null, generating: null, genMs: null, error: null, fingerprint: null,
  savedBanks: typeof localStorage === "undefined" ? [] : loadSavedBanks(),
  // Every visit starts with the pin off. setSeedPinned writes the choice to storage, and nothing reads it back:
  // before this store was split out, the read ran before its key was initialised and always gave false.
  seedPinned: false,
};

const listeners = new Set<() => void>();
let batchDepth = 0;
let due = false;

export function getGenState(): GenState { return state; }
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Tell every listener, or note that a notification is due when a batch is open. */
export function notify(): void {
  if (batchDepth > 0) { due = true; return; }
  listeners.forEach((l) => l());
}
/** Run fn and send one notification at the end if one is due. Batches nest, and only the outermost sends. */
export function batch(fn: () => void): void {
  batchDepth++;
  try { fn(); } finally {
    batchDepth--;
    if (batchDepth === 0 && due) { due = false; listeners.forEach((l) => l()); }
  }
}

export function useGenStore(): GenState {
  return useSyncExternalStore(subscribe, getGenState, getGenState);
}

function set(patch: Partial<GenState>) {
  state = { ...state, ...patch };
  notify();
}

let hooks: MakeHooks = {};
export function onMake(h: MakeHooks): void { hooks = h; }

let run: typeof runGenerator = runGenerator;
/** Replace the function that makes the data set (for tests). */
export function setRunner(r: typeof runGenerator): void { run = r; }

let pendingGenerate = false;

export const genActions = {
  setConfig(patch: Partial<GenConfig>) { set({ config: { ...state.config, ...patch } }); saveSettings({ config: state.config }); },
  setTypology(family: "aml" | "fraud" | "crypto", key: string, patch: Partial<{ enabled: boolean; per1k: number }>) {
    const fam = { ...(state.config[family] as Record<string, { enabled: boolean; per1k: number; minAccounts: number; maxAccounts: number }>) };
    fam[key] = { ...fam[key], ...patch };
    set({ config: { ...state.config, [family]: fam } as GenConfig }); saveSettings({ config: state.config });
  },
  applyPreset(key: PresetKey) { set({ config: normaliseConfig(PRESETS[key].patch(state.config)) }); saveSettings({ config: state.config }); },
  applyArchetype(key: ArchetypeKey) { set({ config: ARCHETYPES[key].patch(state.config) }); saveSettings({ config: state.config }); },
  saveBank(name: string) {
    const clean = name.trim().slice(0, 48) || state.config.name;
    const config = normaliseConfig({ ...state.config, name: clean });
    const list = [{ name: clean, config, savedAt: new Date().toISOString() }, ...state.savedBanks.filter((b) => b.name !== clean)].slice(0, 12);
    set({ savedBanks: list, config }); storeSavedBanks(list); saveSettings({ config: state.config });
  },
  removeSavedBank(name: string) { const list = state.savedBanks.filter((b) => b.name !== name); set({ savedBanks: list }); storeSavedBanks(list); },
  applySavedBank(name: string) { const b = state.savedBanks.find((x) => x.name === name); if (b) { set({ config: normaliseConfig(b.config) }); saveSettings({ config: state.config }); } },
  /** A configuration arriving by link replaces the current one and is made straight away, with its seed pinned so the reader sees the data set that was shared. */
  applyShared(config: GenConfig) { set({ config: normaliseConfig(config) }); saveSettings({ config: state.config }); genActions.setSeedPinned(true); void genActions.generate({ keepSeed: true }); },
  reseed() { set({ config: { ...state.config, seed: Math.floor(Math.random() * 1e9), period: 1 } }); saveSettings({ config: state.config }); },
  /** The same bank, its next period: the customers and their relationships stay, the days of activity and the crime are drawn afresh. */
  nextPeriod() { set({ config: { ...state.config, period: (state.config.period ?? 1) + 1 } }); saveSettings({ config: state.config }); void genActions.generate({ keepSeed: true }); },
  setSeedPinned(v: boolean) { set({ seedPinned: v }); try { localStorage.setItem(SEED_PINNED_KEY, v ? "1" : "0"); } catch { /* private browsing */ } },

  async generate(opts: { keepSeed?: boolean } = {}) {
    // a request that arrives while a data set is being made (a share link opened cold, while the default set is on its way) runs once that one lands, with the configuration current then
    if (state.generating) { pendingGenerate = true; return; }
    // every make is a new data set unless the seed is pinned: a new bank (new seed number, period 1), the same settings
    if (!state.seedPinned && !opts.keepSeed) { set({ config: { ...state.config, seed: Math.floor(Math.random() * 1e9), period: 1 } }); saveSettings({ config: state.config }); }
    batch(() => {
      set({ generating: { stage: "starting", done: 0, total: 1 }, error: null });
      hooks.start?.();
    });
    try {
      const { dataset, ms } = await run(normaliseConfig(state.config), (p) => set({ generating: p }));
      const h = hooks;
      if (h.prepare) {
        set({ generating: { stage: h.prepare.label, done: 1, total: 1 } });
        await new Promise((r) => setTimeout(r, 10));
      }
      batch(() => {
        h.prepare?.run(dataset);
        set({ dataset, generating: null, genMs: ms, fingerprint: fingerprint(dataset) });
        h.done?.(dataset);
      });
    } catch (e) {
      set({ generating: null, error: String(e) });
    } finally {
      if (pendingGenerate) { pendingGenerate = false; void genActions.generate(); }
    }
  },
};

/** Kick off the first generation once, so the page holds a data set when the reader arrives. */
let booted = false;
export function bootGen(carried: string[] = ["bank", "run"]): void {
  if (booted) return;
  booted = true;
  // a link that carries a bank or a run makes its own data set; the default one is not made first
  const q = typeof location === "undefined" ? "" : (location.hash.split("?")[1] ?? "");
  const has = new RegExp("(^|&)(" + carried.join("|") + ")=").test(q);
  if (typeof Worker !== "undefined" && !has) void genActions.generate();
}
