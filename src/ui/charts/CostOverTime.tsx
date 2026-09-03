/**
 * Runway — CostOverTime chart.
 *
 * Monthly cost trajectory over the growth horizon. Supports overlaying multiple
 * named series (for comparison) with accent colors, plus optional vertical
 * reference lines marking dated scaling events ("Postgres write ceiling @ M18").
 *
 * Plain data props only — no model imports. Views feed it engine output mapped
 * to { month, <seriesKey>: usd } rows.
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
  usdTick,
} from "./chartTheme";

/** One series of monthly cost points. */
export interface CostSeries {
  /** Stable key used as the row property + React key. */
  key: string;
  /** Human label shown in legend/tooltip. */
  name: string;
  /** Monthly points: { month, usd }. month is 0-based on the horizon. */
  points: Array<{ month: number; usd: number }>;
  /** Optional explicit color; otherwise assigned from the accent palette. */
  color?: string;
}

/** A dated scaling event to mark with a vertical reference line. */
export interface CostEventMarker {
  month: number;
  /** Short label rendered at the line (e.g. "DB wall"). */
  label?: string;
  /** "breaking" -> red, "warning" -> amber. Defaults to "warning". */
  kind?: "warning" | "breaking";
  /** Optionally associate with a series color instead of kind color. */
  color?: string;
}

export interface CostOverTimeProps {
  /** One or more named cost series (1 = single scenario, 2-3 = comparison). */
  series: CostSeries[];
  /** Optional dated scaling-event markers as vertical reference lines. */
  events?: CostEventMarker[];
  height?: number;
  /** Hide the legend (e.g. when a single series). Default: show iff >1 series. */
  showLegend?: boolean;
}

type Row = { month: number } & Record<string, number>;

/** Merge multiple series into Recharts row form keyed by month. */
function toRows(series: CostSeries[]): Row[] {
  const byMonth = new Map<number, Row>();
  for (const s of series) {
    for (const p of s.points) {
      let row = byMonth.get(p.month);
      if (!row) {
        row = { month: p.month };
        byMonth.set(p.month, row);
      }
      row[s.key] = p.usd;
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month - b.month);
}

export function CostOverTime({
  series,
  events = [],
  height,
  showLegend,
}: CostOverTimeProps): ReactElement {
  const rows = toRows(series);
  const legend = showLegend ?? series.length > 1;

  return (
    <ChartFrame height={height} ariaLabel="Monthly cost over the growth horizon">
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
          tickFormatter={usdTick}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          width={52}
        />
        <Tooltip
          cursor={{ stroke: TOKENS.faint, strokeDasharray: "3 3" }}
          content={
            <ChartTooltip
              labelFormatter={(l) => `Month ${l}`}
              valueFormatter={(v) => usdTick(v)}
            />
          }
        />
        {legend ? (
          <Legend wrapperStyle={LEGEND_STYLE} iconType="plainline" />
        ) : null}

        {events.map((e, i) => {
          const color =
            e.color ?? (e.kind === "breaking" ? TOKENS.red : TOKENS.amber);
          return (
            <ReferenceLine
              key={`evt-${e.month}-${i}`}
              x={e.month}
              stroke={color}
              strokeDasharray="4 4"
              strokeOpacity={0.8}
              {...refLabelProps(e.label, "top", color)}
            />
          );
        })}

        {series.map((s, i) => {
          const color = s.color ?? seriesColor(i);
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
