/**
 * Number / money / duration formatting helpers for Runway.
 *
 * Pure, dependency-free, framework-free. Safe to import in plain Node, in
 * tests, and in the UI. Keep ALL display formatting here (per CLAUDE.md) so
 * the model output and the UI agree on how a number reads.
 */

/* -------------------------------------------------------------------------- */
/* compact magnitudes (K / M / B / T)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Format a number compactly with a K/M/B/T suffix.
 * e.g. 1_500 -> "1.5K", 2_500_000 -> "2.5M", 950 -> "950".
 *
 * @param n        value to format
 * @param digits   max significant fraction digits (default 1)
 */
export function compact(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return String(n);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];

  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      const scaled = abs / threshold;
      return sign + trimZeros(scaled.toFixed(digits)) + suffix;
    }
  }
  return sign + trimZeros(abs.toFixed(abs < 1 && abs > 0 ? digits : 0));
}

/* -------------------------------------------------------------------------- */
/* money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Format a USD amount. Uses K/M compaction for large values.
 * e.g. 1600 -> "$1,600", 19717 -> "$19,717", 1_250_000 -> "$1.25M".
 *
 * @param usd       amount in USD
 * @param opts.compact  force compact form for >= 1e4 (default true)
 */
export function money(
  usd: number,
  opts: { compact?: boolean } = {},
): string {
  const useCompact = opts.compact ?? true;
  if (!Number.isFinite(usd)) return "$" + String(usd);
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);

  if (useCompact && abs >= 1e6) {
    return sign + "$" + trimZeros((abs / 1e6).toFixed(2)) + "M";
  }
  if (useCompact && abs >= 1e4) {
    return sign + "$" + trimZeros((abs / 1e3).toFixed(1)) + "K";
  }
  return sign + "$" + Math.round(abs).toLocaleString("en-US");
}

/** Money with cents, no compaction. e.g. 209.6 -> "$209.60". */
export function moneyExact(usd: number): string {
  if (!Number.isFinite(usd)) return "$" + String(usd);
  return (
    (usd < 0 ? "-" : "") +
    "$" +
    Math.abs(usd).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/* -------------------------------------------------------------------------- */
/* percentage                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Format a ratio (0..1) as a percentage string.
 * e.g. 0.734 -> "73%", 0.9 -> "90%".
 *
 * @param ratio    value where 1 === 100%
 * @param digits   fraction digits (default 0)
 */
export function percent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return String(ratio);
  return trimZeros((ratio * 100).toFixed(digits)) + "%";
}

/**
 * Format a signed delta as a percentage, with explicit + / - sign.
 * e.g. -0.3 -> "-30%", 0.12 -> "+12%". Useful for comparison deltas.
 */
export function deltaPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return String(ratio);
  const sign = ratio > 0 ? "+" : "";
  return sign + trimZeros((ratio * 100).toFixed(digits)) + "%";
}

/* -------------------------------------------------------------------------- */
/* latency / duration                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Format a millisecond latency.
 * e.g. 7.1 -> "7.1 ms", 239.9 -> "240 ms", 0.42 -> "0.42 ms".
 */
export function ms(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const digits = value < 10 ? (value < 1 ? 2 : 1) : 0;
  return trimZeros(value.toFixed(digits)) + " ms";
}

/**
 * Format a duration given in seconds into a human label.
 * e.g. 3 -> "3s", 90 -> "1m 30s", 3600 -> "1h", 5400 -> "1h 30m".
 */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return String(seconds);
  const sign = seconds < 0 ? "-" : "";
  let s = Math.round(Math.abs(seconds));

  if (s < 60) return sign + s + "s";

  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;

  const parts: string[] = [];
  if (h > 0) parts.push(h + "h");
  if (m > 0) parts.push(m + "m");
  if (s > 0 && h === 0) parts.push(s + "s");
  return sign + parts.join(" ");
}

/* -------------------------------------------------------------------------- */
/* growth-horizon month labels                                                */
/* -------------------------------------------------------------------------- */

/**
 * Label a zero-based month index on the growth horizon.
 * e.g. 0 -> "M0", 14 -> "M14". Compact for axis ticks.
 */
export function monthLabel(monthIndex: number): string {
  return "M" + Math.round(monthIndex);
}

/**
 * Verbose month label: 0 -> "now", 1 -> "month 1", 14 -> "month 14",
 * 24 -> "year 2". Useful for prose like bottleneck banners.
 */
export function monthLong(monthIndex: number): string {
  const m = Math.round(monthIndex);
  if (m <= 0) return "now";
  if (m % 12 === 0) return "year " + m / 12;
  return "month " + m;
}

/* -------------------------------------------------------------------------- */
/* internal                                                                   */
/* -------------------------------------------------------------------------- */

/** Drop trailing ".0" / ".00" and trailing zeros after a decimal point. */
function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/* -------------------------------------------------------------------------- */
/* contract-named aliases (MODEL-SPEC public API)                             */
/* -------------------------------------------------------------------------- */

/** Alias of {@link money}. */
export const formatMoney = money;
/** Alias of {@link compact} (K/M/B counts). */
export const formatCount = compact;
/** Alias of {@link ms}. */
export const formatMs = ms;
/** Alias of {@link percent}. */
export const formatPct = percent;

/**
 * Format a month count as a runway/duration label.
 * e.g. 0 -> "0 mo", 18 -> "18 mo", 24 -> "24 mo (2 yr)".
 */
export function formatMonths(months: number): string {
  if (!Number.isFinite(months)) return String(months);
  const m = Math.round(months);
  if (m >= 12 && m % 12 === 0) return `${m} mo (${m / 12} yr)`;
  return `${m} mo`;
}
