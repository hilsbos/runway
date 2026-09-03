/**
 * Runway — LatencyOverTime chart.
 *
 * p50 and p99 latency (ms) over the growth horizon, with a horizontal
 * degradation-threshold reference line. p99 is the headline (solid, bright);
 * p50 is the floor (dimmer). Optional event markers reuse the cost-chart shape.
 *
 * Plain data props only — no model imports.
 */

import type { ReactElement } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  msTick,
  refLabelProps,
  REF_LABEL_STYLE,
  TOKENS,
} from "./chartTheme";
import type { CostEventMarker } from "./CostOverTime";

/** One latency point on the horizon. */
export interface LatencyPoint {
  month: number;
  p50: number;
  p99: number;
}

export interface LatencyOverTimeProps {
  points: LatencyPoint[];
  /**
   * Degradation threshold in ms. When p99 crosses this, the design is
   * "degraded". Rendered as a dashed red horizontal reference line. Optional.
   */
  thresholdMs?: number;
  /** Label for the threshold line (default "p99 budget"). */
  thresholdLabel?: string;
  /** Optional vertical event markers (dated scaling events). */
  events?: CostEventMarker[];
  height?: number;
}

export function LatencyOverTime({
  points,
  thresholdMs,
  thresholdLabel = "p99 budget",
  events = [],
  height,
}: LatencyOverTimeProps): ReactElement {
  return (
    <ChartFrame height={height} ariaLabel="p50 and p99 latency over the growth horizon">
      <AreaChart data={points} margin={CHART_MARGIN}>
        <GlowDefs />
        <defs>
          <linearGradient id="ag-lat-p99" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TOKENS.amber} stopOpacity={0.28} />
            <stop offset="100%" stopColor={TOKENS.amber} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="ag-lat-p50" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TOKENS.cyan} stopOpacity={0.22} />
            <stop offset="100%" stopColor={TOKENS.cyan} stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
          tickFormatter={msTick}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          width={40}
          unit=""
        />
        <Tooltip
          cursor={{ stroke: TOKENS.faint, strokeDasharray: "3 3" }}
          content={
            <ChartTooltip
              labelFormatter={(l) => `Month ${l}`}
              valueFormatter={(v) => msTick(v)}
              unitSuffix=" ms"
            />
          }
        />
        <Legend wrapperStyle={LEGEND_STYLE} iconType="plainline" />

        {thresholdMs !== undefined ? (
          <ReferenceLine
            y={thresholdMs}
            stroke={TOKENS.red}
            strokeDasharray="5 4"
            strokeOpacity={0.85}
            label={{
              value: thresholdLabel,
              position: "insideTopRight",
              ...REF_LABEL_STYLE,
              fill: TOKENS.red,
            }}
          />
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
              strokeOpacity={0.7}
              {...refLabelProps(e.label, "top", color)}
            />
          );
        })}

        {/* p50 first (under), then p99 (over). */}
        <Area
          type="monotone"
          dataKey="p50"
          name="p50"
          stroke={TOKENS.cyan}
          strokeWidth={1.5}
          fill="url(#ag-lat-p50)"
          dot={false}
          activeDot={{ r: 3, fill: TOKENS.cyan, stroke: TOKENS.bg }}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="p99"
          name="p99"
          stroke={TOKENS.amber}
          strokeWidth={2}
          fill="url(#ag-lat-p99)"
          dot={false}
          activeDot={{ r: 3, fill: TOKENS.amber, stroke: TOKENS.bg }}
          filter={`url(#${GLOW_FILTER_ID})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartFrame>
  );
}
