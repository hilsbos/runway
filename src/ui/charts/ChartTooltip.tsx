/**
 * Runway — shared dark tooltip for time-series charts.
 *
 * A single Recharts custom-tooltip renderer parameterized by a value formatter
 * so cost / latency / utilization charts all read the same. No model imports;
 * formatters are passed in by the chart component.
 */

import type { ReactElement } from "react";
import {
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOKENS,
} from "./chartTheme";

/** Minimal shape of the props Recharts passes to a custom tooltip. */
export interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  /** Format the x-axis label (e.g. month index -> "Month 14"). */
  labelFormatter?: (label: string | number) => string;
  /** Format each series value (e.g. usd -> "$1,997"). */
  valueFormatter?: (value: number, item: TooltipPayloadItem) => string;
  /** Optional suffix appended after the formatted value (e.g. " ms"). */
  unitSuffix?: string;
}

const numberFromValue = (
  v: number | string | Array<number | string> | undefined,
): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(v) && v.length) {
    const n = Number(v[v.length - 1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  unitSuffix = "",
}: ChartTooltipProps): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;

  const labelText =
    labelFormatter && label !== undefined
      ? labelFormatter(label)
      : label !== undefined
        ? String(label)
        : "";

  return (
    <div style={TOOLTIP_CONTENT_STYLE}>
      {labelText ? <div style={TOOLTIP_LABEL_STYLE}>{labelText}</div> : null}
      <div style={{ display: "grid", rowGap: 2 }}>
        {payload.map((item, i) => {
          const num = numberFromValue(item.value);
          const formatted =
            num !== null && valueFormatter
              ? valueFormatter(num, item)
              : num !== null
                ? String(num)
                : "—";
          return (
            <div
              key={`${String(item.dataKey)}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  aria-hidden
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: item.color ?? TOKENS.cyan,
                    boxShadow: `0 0 6px ${item.color ?? TOKENS.cyan}`,
                  }}
                />
                <span style={{ color: TOKENS.dim }}>{String(item.name ?? "")}</span>
              </span>
              <span style={{ color: TOKENS.ink, fontWeight: 600 }}>
                {formatted}
                {unitSuffix}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
