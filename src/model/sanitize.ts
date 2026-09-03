/**
 * Runway — model input-validation boundary. Pure & framework-free (no DOM/React).
 *
 * The engine formulas assume in-spec inputs. Untrusted entry points — the `?s=`
 * URL payload, JSON import, localStorage, and direct programmatic calls — can
 * inject out-of-spec numbers (rps=0, cores=0, negative ratios, hitRatio>1, an
 * unknown override path, a zero divisor like {target_util:0}) that yield
 * Infinity / NaN / negative-node nonsense. These sanitizers clamp every field
 * to the spec-derived contract so the engine never sees a value it can't model.
 *
 * Two invariants (see CLAUDE.md / MODEL-SPEC.md):
 *  A. Growth-driven load/scale quantities (rps, startRps) get a LOWER bound
 *     ONLY — simulateGrowth intentionally drives rps arbitrarily high to reveal
 *     the capacity wall, so capping it would corrupt the core simulation.
 *  B. Clamping is the IDENTITY function for every in-spec input. The proof is
 *     that all existing goldens stay green with zero fixture edits.
 */
import type { GrowthInputs, StackInputs } from "./types.ts";
import { constantMap } from "./constants.ts";

/** Clamp `v` to [min, max] (max omitted => no upper bound). NaN/±Inf -> fallback. */
function clamp(v: number, min: number, max: number | null, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  let out = v < min ? min : v;
  if (max !== null && out > max) out = max;
  return out;
}

/** Integer clamp: round then clamp to [min, max]. NaN/±Inf -> fallback. */
function clampInt(v: number, min: number, max: number | null, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return clamp(Math.round(v), min, max, fallback);
}

/**
 * Sanitize a full StackInputs to the spec-derived bounds. Identity for in-spec
 * inputs. Non-numeric / structural fields (enums, booleans) are passed through
 * unchanged — the UI already constrains them and the engine indexes by them.
 */
export function sanitizeInputs(inputs: StackInputs): StackInputs {
  const a = inputs.authz;
  return {
    ...inputs,
    // Load: lower bound only (constraint A — never cap rps above).
    rps: clampInt(inputs.rps, 1, null, 100000),
    // Bounded ratios (spec §1.2).
    readFrac: clamp(inputs.readFrac, 0.5, 1, 0.9),
    hitRatio: clamp(inputs.hitRatio, 0, 0.99, 0.9),
    // Physical config knobs with documented max (spec §1.1).
    cores: clampInt(inputs.cores, 1, 64, 8),
    ramGB: clampInt(inputs.ramGB, 1, 128, 16),
    authz: {
      ...a,
      ttl: clampInt(a.ttl, 30, 3600, 300),
      tokensPerReq: clamp(a.tokensPerReq, 0.5, 4, 1),
      regions: clampInt(a.regions, 1, 40, 12),
      aclTuples: clampInt(a.aclTuples, 1, null, 2.5e9),
    },
  };
}

/**
 * Sanitize GrowthInputs. startRps is growth-driven (lower bound only,
 * constraint A); ratePerYear / horizonMonths are documented in constants §6.2.
 */
export function sanitizeGrowth(g: GrowthInputs): GrowthInputs {
  return {
    ...g,
    startRps: clampInt(g.startRps, 1, null, 20000),
    ratePerYear: clamp(g.ratePerYear, 0, 3, 0.6),
    horizonMonths: clampInt(g.horizonMonths, 6, 60, 36),
  };
}

/**
 * Sanitize a user-supplied constant-override map. DROPS keys that are not
 * editable constants and any non-finite value; CLAMPS the rest to each
 * constant's editable [min, max]. The editable set + ranges are derived from
 * constants.ts (constantMap → editable metadata) so they never drift.
 */
export function sanitizeOverrides(
  overrides: Record<string, number>,
): Record<string, number> {
  const map = constantMap();
  const out: Record<string, number> = {};
  for (const [path, value] of Object.entries(overrides)) {
    if (!Number.isFinite(value)) continue; // drop NaN / ±Inf
    const c = map.get(path);
    if (!c || !c.editable) continue; // drop unknown / non-editable paths
    const [min, max] = c.editable;
    out[path] = clamp(value, min, max, c.value);
  }
  return out;
}
