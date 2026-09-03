/**
 * Runway — ComparisonChart (generic multi-series time chart).
 *
 * Overlays 2-3 named designs on a single metric over the shared horizon — cost
 * or latency or any per-month scalar. Each design gets an accent color; vertical
 * reference lines mark each design's breaking/warning events in the matching
 * color so you can read "B breaks 4 months after A" at a glance.
 *
 * Plain data props only — no model imports. This is the building block views use
 * for the side-by-side comparison; CostOverTime is the cost-specialized form.
 */

import type { ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { ChartFrame, GlowDefs } from "./ChartFrame";
import { ChartTooltip } from "./ChartTooltip";
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_MARGIN,
  GLOW_FILTER_ID,
  GRID_COLOR,
  LEGEND_STYLE,
  monthTick,
  refLabelProps,
  seriesColor,
  TOKENS,
} from "./chartTheme";

export type MetricKind = "cost" | "latency" | "utilization" | "raw";

/** One design's series of per-month metric values. */
export interface ComparisonSeries {
  key: string;
  name: string;
  /** { month, value } points; value is in the metric's native unit. */
  points: Array<{ month: number; value: number }>;
  color?: string;
  /** Optional dated events for THIS design (rendered in the series color). */
  events?: Array<{
    month: number;
    kind?: "warning" | "breaking";
    label?: string;
  }>;
}

export interface ComparisonChartProps {
  series: ComparisonSeries[];
  /**
   * Metric kind drives the y-axis/tooltip formatter and unit suffix:
   * cost -> "$x", latency -> "x ms", utilization -> "x%", raw -> plain number.
   */
  metric?: MetricKind;
  /** Override the y-axis tick + tooltip value formatter. */
  valueFormatter?: (v: number) => string;
  /** Unit suffix appended in the tooltip (e.g. " ms"). Inferred from metric. */
  unitSuffix?: string;
  /** Optional horizontal threshold line (e.g. latency budget). */
  threshold?: { value: number; label?: string; color?: string };
  height?: number;
  /** Width reserved for the y-axis tick labels. Defaults per metric. */
  yAxisWidth?: number;
}

const FMT: Record<MetricKind, (v: number) => string> = {
  cost: (v) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `$${trim(v / 1e6)}M`;
    if (abs >= 1e3) return `$${trim(v / 1e3)}K`;
    return `$${Math.round(v)}`;
  },
  latency: (v) => (v < 10 ? trim(v) : String(Math.round(v))),
  utilization: (v) => `${Math.round(v * 100)}%`,
  raw: (v) => String(v),
};

const SUFFIX: Record<MetricKind, string> = {
  cost: "",
  latency: " ms",
  utilization: "",
  raw: "",
};

const Y_WIDTH: Record<MetricKind, number> = {
  cost: 52,
  latency: 40,
  utilization: 42,
  raw: 48,
};

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

type Row = { month: number } & Record<string, number>;

/** Merge series into Recharts row form keyed by month. */
function toRows(series: ComparisonSeries[]): Row[] {
  const byMonth = new Map<number, Row>();
  for (const s of series) {
    for (const p of s.points) {
      let row = byMonth.get(p.month);
      if (!row) {
        row = { month: p.month };
        byMonth.set(p.month, row);
      }
      row[s.key] = p.value;
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month - b.month);
}

export function ComparisonChart({
  series,
  metric = "raw",
  valueFormatter,
  unitSuffix,
  threshold,
  height,
  yAxisWidth,
}: ComparisonChartProps): ReactElement {
  const rows = toRows(series);
  const fmt = valueFormatter ?? FMT[metric];
  const suffix = unitSuffix ?? SUFFIX[metric];
  const colorOf = (s: ComparisonSeries, i: number) => s.color ?? seriesColor(i);

  return (
    <ChartFrame
      height={height}
      ariaLabel={`Comparison of ${series.length} designs over the growth horizon`}
    >
      <LineChart data={rows} margin={CHART_MARGIN}>
        <GlowDefs />
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="month"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={monthTick}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={fmt}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          width={yAxisWidth ?? Y_WIDTH[metric]}
        />
        <Tooltip
          cursor={{ stroke: TOKENS.faint, strokeDasharray: "3 3" }}
          content={
            <ChartTooltip
              labelFormatter={(l) => `Month ${l}`}
              valueFormatter={(v) => fmt(v)}
              unitSuffix={suffix}
            />
          }
        />
        <Legend wrapperStyle={LEGEND_STYLE} iconType="plainline" />

        {threshold ? (
          <ReferenceLine
            y={threshold.value}
            stroke={threshold.color ?? TOKENS.red}
            strokeDasharray="5 4"
            strokeOpacity={0.85}
            {...refLabelProps(
              threshold.label,
              "insideTopRight",
              threshold.color ?? TOKENS.red,
            )}
          />
        ) : null}

        {series.map((s, i) =>
          (s.events ?? []).map((e, j) => {
            const color = colorOf(s, i);
            return (
              <ReferenceLine
                key={`evt-${s.key}-${e.month}-${j}`}
                x={e.month}
                stroke={color}
                strokeDasharray={e.kind === "breaking" ? "4 3" : "2 5"}
                strokeOpacity={0.7}
                {...refLabelProps(e.label, "top", color)}
              />
            );
          }),
        )}

        {series.map((s, i) => {
          const color = colorOf(s, i);
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: color, stroke: TOKENS.bg }}
              filter={`url(#${GLOW_FILTER_ID})`}
              isAnimationActive={false}
              connectNulls
            />
          );
        })}
      </LineChart>
    </ChartFrame>
  );
}
