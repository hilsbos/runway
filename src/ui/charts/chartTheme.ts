/**
 * Runway — shared chart theme & helpers.
 *
 * Centralizes the dark instrument-panel look for all Recharts components:
 * grid color, mono tick typography, the accent palette, soft glow, and the
 * health-aware color scale used by utilization charts.
 *
 * No model imports. Pure constants + tiny pure helpers. The values mirror the
 * CSS tokens in docs/MODEL-SPEC.md § Design system so charts read against the
 * surrounding instrument panel. (Recharts needs concrete color strings for SVG
 * stroke/fill, so we resolve the tokens to their hex values here rather than
 * relying on CSS custom properties, which don't apply to SVG presentation
 * attributes consistently.)
 */

/* -------------------------------------------------------------------------- */
/* resolved design tokens (mirror of theme.css :root)                         */
/* -------------------------------------------------------------------------- */

export const TOKENS = {
  bg: "#0b0f0e",
  panel: "#11161a",
  panel2: "#161d23",
  line: "#243038",
  grid: "#1a2329",
  ink: "#cfe3da",
  dim: "#7d9088",
  faint: "#4d605a",
  green: "#39d98a",
  amber: "#ffb547",
  cyan: "#34c3ff",
  red: "#ff5d5d",
  violet: "#b08cff",
  blue: "#6f8cff",
  pink: "#ff7eb6",
  lime: "#c8f04d",
} as const;

/* -------------------------------------------------------------------------- */
/* accent palette for multi-series overlays (comparison)                      */
/* -------------------------------------------------------------------------- */

/**
 * Ordered accent colors for overlaying up to ~5 named series (designs).
 * cyan → violet → green → amber → red. The first three are the legible,
 * non-alarming colors; we keep red last so an overlay color is never confused
 * with a "bad" health signal at a glance.
 */
export const SERIES_COLORS: readonly string[] = [
  TOKENS.cyan,
  TOKENS.violet,
  TOKENS.green,
  TOKENS.amber,
  TOKENS.red,
];

/** Pick an accent color for the i-th series, wrapping if needed. */
export function seriesColor(index: number): string {
  const len = SERIES_COLORS.length;
  return SERIES_COLORS[((index % len) + len) % len] ?? TOKENS.cyan;
}

/* -------------------------------------------------------------------------- */
/* tier accents (per MODEL-SPEC accent convention)                            */
/* -------------------------------------------------------------------------- */

export type TierKey = "lb" | "api" | "cache" | "datastore" | "authz";

/**
 * Per-tier line colors for utilization charts. Capacity tiers lean
 * green/cyan/amber; authz leans violet. Distinct hues so 5 lines read apart.
 */
export const TIER_COLORS: Record<TierKey, string> = {
  lb: TOKENS.cyan,
  api: TOKENS.green,
  cache: TOKENS.amber,
  datastore: TOKENS.violet,
  authz: TOKENS.red,
};

export const TIER_LABELS: Record<TierKey, string> = {
  lb: "Load balancer",
  api: "API",
  cache: "Cache",
  datastore: "Datastore",
  authz: "Authz",
};

/* -------------------------------------------------------------------------- */
/* datastore palette (Datastores lens — one stable hue per engine)            */
/* -------------------------------------------------------------------------- */

export type DbKey =
  | "postgres"
  | "mysql"
  | "aurora"
  | "oracledb"
  | "yugabytedb"
  | "cassandra"
  | "mongodb";

/**
 * Stable per-datastore line colors for the Datastores lens. Seven distinct hues
 * so the overlaid scaling curves read apart; none is red, since the chart marks
 * each single-primary store's "past the write wall" segment dashed/red.
 */
export const DB_COLORS: Record<DbKey, string> = {
  postgres: TOKENS.cyan,
  mysql: TOKENS.blue,
  aurora: TOKENS.amber,
  oracledb: TOKENS.pink,
  yugabytedb: TOKENS.lime,
  cassandra: TOKENS.green,
  mongodb: TOKENS.violet,
};

/** Resolve a DB's line color, falling back to cyan for unknown keys. */
export function dbColor(db: string): string {
  return DB_COLORS[db as DbKey] ?? TOKENS.cyan;
}

/* -------------------------------------------------------------------------- */
/* health scale (utilization bands)                                           */
/* -------------------------------------------------------------------------- */

/** Health color for a utilization value: green < 0.75, amber < 0.9, red >= 0.9. */
export function healthColor(util: number): string {
  if (util >= 0.9) return TOKENS.red;
  if (util >= 0.75) return TOKENS.amber;
  return TOKENS.green;
}

export type HealthLevel = "ok" | "warn" | "bad";

export function healthLevel(util: number): HealthLevel {
  if (util >= 0.9) return "bad";
  if (util >= 0.75) return "warn";
  return "ok";
}

/* -------------------------------------------------------------------------- */
/* shared Recharts style fragments                                            */
/* -------------------------------------------------------------------------- */

/** Mono, dimmed axis tick label styling. */
export const AXIS_TICK = {
  fill: TOKENS.dim,
  fontSize: 11,
  fontFamily:
    '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

/** Axis line / tick-mark color. */
export const AXIS_LINE = TOKENS.line;

/** Cartesian grid color (subtle). */
export const GRID_COLOR = TOKENS.grid;

/** Tooltip container styling (dark panel, mono numbers). */
export const TOOLTIP_CONTENT_STYLE = {
  background: TOKENS.panel2,
  border: `1px solid ${TOKENS.line}`,
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  fontFamily:
    '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 12,
} as const;

export const TOOLTIP_LABEL_STYLE = {
  color: TOKENS.ink,
  fontWeight: 700,
  marginBottom: 4,
} as const;

export const TOOLTIP_ITEM_STYLE = {
  color: TOKENS.ink,
  padding: 0,
} as const;

export const LEGEND_STYLE = {
  fontFamily:
    '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 11,
  color: TOKENS.dim,
} as const;

/** Reference-line label styling (mono, dim). */
export const REF_LABEL_STYLE = {
  fill: TOKENS.dim,
  fontSize: 10,
  fontFamily:
    '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

export type RefLabelPosition =
  | "top"
  | "insideTopRight"
  | "insideBottomRight"
  | "insideTopLeft"
  | "insideBottomLeft";

/**
 * Build a Recharts ReferenceLine `label` object in the mono/dim house style.
 * Returns a partial-props object meant to be spread, so callers can omit the
 * `label` prop entirely when there's no text (required under
 * exactOptionalPropertyTypes — passing `label={undefined}` is a type error).
 *
 *   <ReferenceLine x={m} {...refLabelProps(text, "top", color)} />
 */
export function refLabelProps(
  value: string | undefined,
  position: RefLabelPosition,
  color: string,
): { label?: Record<string, unknown> } {
  if (!value) return {};
  return {
    label: { ...REF_LABEL_STYLE, fill: color, value, position },
  };
}

/** Default chart height; callers can override via prop. */
export const DEFAULT_HEIGHT = 260;

/** Default outer margins; tuned so mono tick labels never clip on narrow widths. */
export const CHART_MARGIN = { top: 12, right: 16, bottom: 4, left: 4 } as const;

/* -------------------------------------------------------------------------- */
/* glow filter (soft accent bloom on lines)                                   */
/* -------------------------------------------------------------------------- */

/**
 * A unique-ish id for the shared SVG glow filter. Each chart renders its own
 * <defs> with this filter so lines get a subtle bloom matching the panel glow.
 */
export const GLOW_FILTER_ID = "ag-chart-glow";

/* -------------------------------------------------------------------------- */
/* axis formatters (kept here so charts stay model-free)                       */
/* -------------------------------------------------------------------------- */

/** Compact month tick: 0 -> "M0", 12 -> "M12". */
export function monthTick(m: number): string {
  return "M" + Math.round(m);
}

/** Compact USD tick: 1997 -> "$2.0K", 71878 -> "$71.9K", 1.2e6 -> "$1.2M". */
export function usdTick(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${trim(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** Compact ms tick: 7.9 -> "7.9", 240 -> "240". */
export function msTick(v: number): string {
  return v < 10 ? trim(v) : String(Math.round(v));
}

/** Percent tick for utilization (0..1): 0.73 -> "73%". */
export function pctTick(v: number): string {
  return Math.round(v * 100) + "%";
}

function trim(n: number): string {
  return n
    .toFixed(1)
    .replace(/\.0$/, "");
}
