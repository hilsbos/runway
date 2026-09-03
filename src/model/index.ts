/**
 * Runway — public model API barrel.
 *
 * Pure, framework-free TypeScript. The UI imports from here; the model never
 * imports the UI. See MODEL-SPEC.md §0–§6 + Appendices A/B for the contract.
 */

/* ---- core engine ---- */
export { computeStack } from "./stack.ts";
export { simulateGrowth } from "./growth.ts";
export { compareDesigns } from "./compare.ts";
export { generateVerdict, generateCompareVerdict } from "./verdict.ts";

/* ---- datastore head-to-head scaling lens ---- */
export {
  datastoreFacts,
  datastoreScaling,
  type DbFacts,
  type DbScalePoint,
  type DbScaleCurve,
  type DatastoreScalingOptions,
} from "./datastores.ts";

/* ---- model explainer (How it works tab) ---- */
export {
  explainStack,
  type ExplainRow,
  type ExplainSection,
  type StackExplanation,
} from "./explain.ts";

/* ---- input-validation boundary ---- */
export {
  sanitizeInputs,
  sanitizeGrowth,
  sanitizeOverrides,
} from "./sanitize.ts";

/* ---- presets / defaults / multi-cloud ---- */
export { defaultInputs, TEMPLATES, perCloudDeltas } from "./presets.ts";

/* ---- standalone authz harness (Appendix A.2 scale; advanced/testing) ---- */
export {
  computeAuthzStandalone,
  type AuthzStandaloneInputs,
  type AuthzStandaloneResult,
} from "./authz-standalone.ts";

/* ---- constants + generated assumptions panel rows ---- */
export { listConstants } from "./constants.ts";
export { CAPACITY, AUTHZ, ALG, PRICE, GROWTH_DEFAULTS } from "./constants.ts";

/* ---- formatting helpers ---- */
export {
  formatMoney,
  formatCount,
  formatMs,
  formatMonths,
  formatPct,
  // original names also available for richer UI needs
  money,
  moneyExact,
  compact,
  percent,
  deltaPercent,
  ms,
  duration,
  monthLabel,
  monthLong,
} from "./format.ts";

/* ---- types ---- */
export * from "./types.ts";
