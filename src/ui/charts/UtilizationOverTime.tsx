/**
 * Runway — UtilizationOverTime chart.
 *
 * Per-tier utilization (0..1+) over the growth horizon as multiple lines, with
 * the health bands made legible by horizontal reference lines at the 0.75
 * (amber) and 0.90 (red) thresholds plus a "100% capacity" cap line. Each tier
 * line is drawn in its tier accent color (per MODEL-SPEC convention); the
 * health bands communicate where any line has gone amber/red.
 *
 * Plain data props only — no model imports.
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
  pctTick,
  REF_LABEL_STYLE,
  TIER_COLORS,
  TIER_LABELS,
  TOKENS,
  type TierKey,
} from "./chartTheme";

/** One utilization point: month + per-tier ratios (authz optional). */
export interface UtilizationPoint {
  month: number;
  lb?: number;
  api?: number;
  cache?: number;
  datastore?: number;
  authz?: number;
}

export interface UtilizationOverTimeProps {
  points: UtilizationPoint[];
  /**
   * Which tiers to draw. Defaults to every tier that has at least one defined,
   * non-zero value in `points`. Pass explicitly to force order/visibility.
   */
  tiers?: TierKey[];
  /** Show the 0.75 (amber) and 0.90 (red) health-band reference lines. */
  showHealthBands?: boolean;
  height?: number;
  /** Emphasize one tier's line (others dimmed) — focused from the diagram. */
  highlight?: TierKey | undefined;
}

const ALL_TIERS: TierKey[] = ["lb", "api", "cache", "datastore", "authz"];

function detectTiers(points: UtilizationPoint[]): TierKey[] {
  return ALL_TIERS.filter((t) =>
    points.some((p) => {
      const v = p[t];
      return typeof v === "number" && v > 0;
    }),
  );
}

export function UtilizationOverTime({
  points,
  tiers,
  showHealthBands = true,
  height,
  highlight,
}: UtilizationOverTimeProps): ReactElement {
  const drawn = tiers ?? detectTiers(points);

  return (
    <ChartFrame height={height} ariaLabel="Per-tier utilization over the growth horizon">
      <LineChart data={points} margin={CHART_MARGIN}>
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
          tickFormatter={pctTick}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          width={42}
          domain={[0, (max: number) => Math.max(1, Math.ceil(max * 10) / 10)]}
          allowDataOverflow={false}
        />
        <Tooltip
          cursor={{ stroke: TOKENS.faint, strokeDasharray: "3 3" }}
          content={
            <ChartTooltip
              labelFormatter={(l) => `Month ${l}`}
              valueFormatter={(v) => pctTick(v)}
            />
          }
        />
        <Legend wrapperStyle={LEGEND_STYLE} iconType="plainline" />

        {showHealthBands ? (
          <>
            <ReferenceLine
              y={0.75}
              stroke={TOKENS.amber}
              strokeDasharray="3 5"
              strokeOpacity={0.55}
              label={{
                value: "75%",
                position: "insideTopRight",
                ...REF_LABEL_STYLE,
                fill: TOKENS.amber,
              }}
            />
            <ReferenceLine
              y={0.9}
              stroke={TOKENS.red}
              strokeDasharray="3 5"
              strokeOpacity={0.6}
              label={{
                value: "90%",
                position: "insideTopRight",
                ...REF_LABEL_STYLE,
                fill: TOKENS.red,
              }}
            />
            <ReferenceLine
              y={1}
              stroke={TOKENS.red}
              strokeOpacity={0.8}
              label={{
                value: "capacity",
                position: "insideBottomRight",
                ...REF_LABEL_STYLE,
                fill: TOKENS.red,
              }}
            />
          </>
        ) : null}

        {drawn.map((tier) => {
          const color = TIER_COLORS[tier];
          const dim = highlight != null && highlight !== tier;
          return (
            <Line
              key={tier}
              type="monotone"
              dataKey={tier}
              name={TIER_LABELS[tier]}
              stroke={color}
              strokeWidth={highlight === tier ? 3 : 2}
              strokeOpacity={dim ? 0.22 : 1}
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
