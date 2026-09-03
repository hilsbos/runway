/** Utilization color level per the spec: green < 0.75, amber < 0.9, red >= 0.9. */
export type UtilLevel = "ok" | "warn" | "bad";

/** Classify a 0..1+ utilization fraction into a color level. */
export function utilLevel(fraction: number): UtilLevel {
  if (fraction >= 0.9) return "bad";
  if (fraction >= 0.75) return "warn";
  return "ok";
}

export interface UtilBarProps {
  /** Utilization as a fraction (0..1; values > 1 render full + bad). */
  value: number;
  /** Optional left label (e.g. "CPU", "RAM"). */
  label?: string;
  /** Show the right-hand percentage readout. Default true. */
  showPct?: boolean;
  className?: string;
}

/**
 * A single utilization bar, colored green/amber/red by threshold. When given a
 * `label` it renders as a labelled grid row (used for CPU/RAM in TierCard);
 * otherwise just the bar.
 */
export function UtilBar({
  value,
  label,
  showPct = true,
  className,
}: UtilBarProps) {
  const level = utilLevel(value);
  const widthPct = Math.max(0, Math.min(100, value * 100));
  const pct = `${Math.round(value * 100)}%`;

  const bar = (
    <div className="ag-utilbar" data-level={level} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "utilization"}>
      <span style={{ width: `${widthPct}%` }} />
    </div>
  );

  if (label == null && !showPct) {
    return <div className={className}>{bar}</div>;
  }

  return (
    <div className={["ag-utilrow", className].filter(Boolean).join(" ")}>
      {label != null ? (
        <span className="ag-utilrow__label">{label}</span>
      ) : (
        <span />
      )}
      {bar}
      {showPct ? (
        <span className="ag-utilrow__pct" data-level={level}>
          {pct}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}
