import type { CSSProperties, ReactNode } from "react";
import type { SliderAccent } from "./Slider.tsx";

const ACCENT: Record<SliderAccent, string> = {
  cyan: "var(--cyan)",
  green: "var(--green)",
  amber: "var(--amber)",
  violet: "var(--violet)",
  red: "var(--red)",
  blue: "var(--blue)",
  pink: "var(--pink)",
  lime: "var(--lime)",
};

export interface StatCardProps {
  /** Uppercase mono label. */
  label: ReactNode;
  /** Big mono number (already formatted, e.g. "$4,697" or "18"). */
  value: ReactNode;
  /** Small unit shown after the value (e.g. "/mo", "rps", "ms"). */
  unit?: string;
  /** Delta string, e.g. "-31%" or "+4 mo". */
  delta?: ReactNode;
  /**
   * Direction of the delta arrow. "up"/"down" draw an arrow; "flat" or omitted
   * draws none.
   */
  trend?: "up" | "down" | "flat";
  /**
   * Whether this delta direction is good or bad for THIS metric (cost up = bad,
   * runway up = good). Drives the delta color independent of arrow direction.
   * "neutral" (default) colors by arrow only.
   */
  deltaTone?: "good" | "bad" | "neutral";
  /** Sub-line under the value (context, source, etc.). */
  sub?: ReactNode;
  /** Tint the value + top accent line. */
  accent?: SliderAccent;
  /** Visual size of the number. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Big-number telemetry card: a large mono value with a label, an optional
 * colored delta/trend, and a sub-line. Presentational.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  trend = "flat",
  deltaTone = "neutral",
  sub,
  accent,
  size = "md",
  className,
}: StatCardProps) {
  const cls = [
    "ag-statcard",
    size === "lg" && "ag-statcard--lg",
    size === "sm" && "ag-statcard--sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const style = accent
    ? ({ "--ag-accent": ACCENT[accent] } as CSSProperties)
    : undefined;

  const deltaCls = [
    "ag-statcard__delta",
    trend === "up" && "ag-statcard__delta--up",
    trend === "down" && "ag-statcard__delta--down",
    deltaTone === "good" && "is-good",
    deltaTone === "bad" && "is-bad",
  ]
    .filter(Boolean)
    .join(" ");

  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "";

  return (
    <div className={cls} style={style}>
      <div className="ag-statcard__label">{label}</div>
      <div className="ag-statcard__valuewrap">
        <span className="ag-statcard__value">{value}</span>
        {unit && <span className="ag-statcard__unit">{unit}</span>}
      </div>
      {delta != null && (
        <span className={deltaCls}>
          {arrow && <span aria-hidden>{arrow}</span>}
          {delta}
        </span>
      )}
      {sub != null && <div className="ag-statcard__sub">{sub}</div>}
    </div>
  );
}
