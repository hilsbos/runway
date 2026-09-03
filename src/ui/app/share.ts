/**
 * Runway — scenario persistence & sharing.
 *
 * Two responsibilities, both pure-ish (only touch localStorage / window.location
 * at the explicit call sites):
 *  - encode/decode the full app state to a compact, URL-safe string (the share
 *    link `?s=` payload AND the JSON-export payload — same codec, so exports
 *    round-trip back into the app);
 *  - named scenario CRUD in localStorage under the `runway:scenarios` key.
 *
 * Imports the model only for types.
 */
import type {
  BaseStackInputs,
  GrowthInputs,
  StackInputs,
} from "../../model/index.ts";
import { TEMPLATES, sanitizeOverrides } from "../../model/index.ts";

/** App mode persisted in shares. */
export type AppMode = "single" | "compare" | "datastores" | "howitworks";

/** A named compare slot (mirror of NamedDesign but UI-owned). */
export interface CompareSlot {
  id: string;
  name: string;
  inputs: BaseStackInputs;
}

/** The complete shareable / exportable app state. */
export interface AppState {
  v: 1;
  mode: AppMode;
  /** Single-design inputs (full StackInputs incl. rps for the snapshot dial). */
  single: StackInputs;
  /** Compare-mode design slots. */
  compare: CompareSlot[];
  /** Shared growth curve. */
  growth: GrowthInputs;
  /** Flat constant overrides keyed by dotted path. */
  overrides: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* base64url codec (UTF-8 safe, no deps)                                       */
/* -------------------------------------------------------------------------- */

function toBase64Url(json: string): string {
  // UTF-8 -> base64 -> url-safe.
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Coerce an untrusted mode value to a valid AppMode (unknown/old → "single"). */
function coerceMode(mode: unknown): AppMode {
  return mode === "compare" || mode === "datastores" || mode === "howitworks"
    ? mode
    : "single";
}

/** Encode app state to a URL-safe token. */
export function encodeState(state: AppState): string {
  return toBase64Url(JSON.stringify(state));
}

/** Decode a URL-safe token back to app state, or null if malformed. */
export function decodeState(token: string): AppState | null {
  try {
    const obj = JSON.parse(fromBase64Url(token)) as Partial<AppState>;
    if (!obj || typeof obj !== "object") return null;
    if (!obj.single || !obj.growth) return null;
    return {
      v: 1,
      mode: coerceMode(obj.mode),
      single: obj.single,
      compare: Array.isArray(obj.compare) ? obj.compare : [],
      growth: obj.growth,
      // Untrusted payload: drop unknown paths + clamp to editable ranges.
      overrides: sanitizeOverrides(obj.overrides ?? {}),
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                 */
/* -------------------------------------------------------------------------- */

const PARAM = "s";

/** Read the `?s=` payload from the current URL, if present. */
export function readUrlState(): AppState | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get(PARAM);
  return token ? decodeState(token) : null;
}

/** Build a full shareable URL for the given state (respects the deploy base). */
export function buildShareUrl(state: AppState): string {
  const token = encodeState(state);
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${PARAM}=${token}`;
}

/** Replace the URL `?s=` param without reloading (so the address bar stays shareable). */
export function syncUrl(state: AppState): void {
  if (typeof window === "undefined") return;
  const url = `${window.location.pathname}?${PARAM}=${encodeState(state)}`;
  window.history.replaceState(null, "", url);
}

/* -------------------------------------------------------------------------- */
/* JSON export / import (round-trips through the same shape)                    */
/* -------------------------------------------------------------------------- */

/** Pretty JSON for file download. */
export function exportJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Parse an exported JSON file back into app state. */
export function importJson(text: string): AppState | null {
  try {
    const obj = JSON.parse(text) as Partial<AppState>;
    if (!obj.single || !obj.growth) return null;
    return {
      v: 1,
      mode: coerceMode(obj.mode),
      single: obj.single,
      compare: Array.isArray(obj.compare) ? obj.compare : [],
      growth: obj.growth,
      // Untrusted payload: drop unknown paths + clamp to editable ranges.
      overrides: sanitizeOverrides(obj.overrides ?? {}),
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* named scenarios in localStorage                                             */
/* -------------------------------------------------------------------------- */

const STORE_KEY = "runway:scenarios";

export interface SavedScenario {
  name: string;
  state: AppState;
  savedAt: number;
}

function readStore(): Record<string, SavedScenario> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedScenario>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, SavedScenario>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Names of all saved scenarios, alphabetical. */
export function listScenarios(): string[] {
  return Object.keys(readStore()).sort((a, b) => a.localeCompare(b));
}

/** Save (or overwrite) a named scenario. */
export function saveScenario(name: string, state: AppState): void {
  const store = readStore();
  store[name] = { name, state, savedAt: Date.now() };
  writeStore(store);
}

/** Load a named scenario, or null. */
export function loadScenario(name: string): AppState | null {
  return readStore()[name]?.state ?? null;
}

/** Delete a named scenario. */
export function deleteScenario(name: string): void {
  const store = readStore();
  delete store[name];
  writeStore(store);
}

/* -------------------------------------------------------------------------- */
/* first-run seeding — ship 2 worked examples so the Load menu is never empty   */
/* -------------------------------------------------------------------------- */

const SEED_FLAG = "runway:seeded";

// MODEL-SPEC §3.3 / §5.2 teaching curve: 20K rps growing 60%/yr over 36 months.
// At this start the Postgres design hits its write ceiling at ~month 18 while the
// Cassandra design survives the horizon — so both seeds read as clear examples.
const SEED_GROWTH: GrowthInputs = {
  startRps: 20_000,
  model: "exponential",
  ratePerYear: 0.6,
  horizonMonths: 36,
};

/** Build the two curated example scenarios from the shipped templates. */
function exampleScenarios(): { name: string; state: AppState }[] {
  const tmpl = (id: string) => TEMPLATES.find((t) => t.id === id)!;
  const pg = tmpl("postgres-monolith").inputs;
  const cass = tmpl("lean-read-api").inputs;
  const grpcAuthz = tmpl("global-grpc-authz").inputs;

  return [
    {
      // Single-design teaching example: a Postgres monolith hitting its
      // write ceiling partway through the horizon — the verdict reads as a
      // dated "wall at month N" warning, which is the product's core value.
      name: "Example · Postgres write wall",
      state: {
        v: 1,
        mode: "single",
        single: { ...pg, rps: 20_000 },
        compare: [
          { id: "slot-a", name: "Postgres / Java", inputs: { ...pg } },
          { id: "slot-b", name: "Cassandra / Rust", inputs: { ...cass } },
        ],
        growth: { ...SEED_GROWTH },
        overrides: {},
      },
    },
    {
      // Comparison teaching example (MODEL-SPEC §5.2 pair): Postgres/Java vs
      // Cassandra/Rust over a 60%/yr curve — Cassandra survives the horizon,
      // Postgres breaks ~month 18, so the recommendation banner has a clear,
      // honest winner.
      name: "Example · Cassandra vs Postgres",
      state: {
        v: 1,
        mode: "compare",
        single: { ...grpcAuthz, rps: 100_000 },
        compare: [
          { id: "slot-a", name: "Postgres / Java", inputs: { ...pg } },
          { id: "slot-b", name: "Cassandra / Rust", inputs: { ...cass } },
        ],
        growth: { ...SEED_GROWTH },
        overrides: {},
      },
    },
  ];
}

/**
 * Seed the example scenarios once per browser (idempotent). Never overwrites a
 * user's own scenarios: only writes seeds that are absent, and records a flag so
 * deleting a seed doesn't bring it back.
 */
export function seedExampleScenarios(): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(SEED_FLAG)) return;
    const store = readStore();
    for (const { name, state } of exampleScenarios()) {
      if (!store[name]) store[name] = { name, state, savedAt: Date.now() };
    }
    writeStore(store);
    localStorage.setItem(SEED_FLAG, "1");
  } catch {
    /* private mode / quota — fine to skip seeding */
  }
}
