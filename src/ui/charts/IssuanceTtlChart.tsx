/**
 * Runway — IssuanceTtlChart (log-log TTL sweep for the authz component).
 *
 * TTL is the master dial of the authorization model (MODEL-SPEC §2): shorter
 * token TTL means more frequent refresh, which raises issuanceQPS and therefore
 * issuance node count. This chart plots that relationship as a log-log curve —
 * issuanceQPS (and optionally issuance nodes) versus TTL seconds — making the
 * power-law trade-off legible (halve TTL, ~double issuance load).
 *
 * Plain data props only — no model imports. The view sweeps `computeStack`
 * across TTL values and feeds the resulting points here.
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
  REF_LABEL_STYLE,
  TOKENS,
} from "./chartTheme";

/** One TTL-sweep sample. */
export interface IssuanceTtlPoint {
  /** Token TTL in seconds (x, log scale). */
  ttl: number;
  /** Token mint/refresh rate at this TTL (y, log scale). */
  issuanceQPS: number;
  /** Optional issuance node count at this TTL (secondary line). */
  issNodes?: number;
}

export interface IssuanceTtlChartProps {
  points: IssuanceTtlPoint[];
  /** Mark the currently selected TTL with a vertical reference line. */
  currentTtl?: number;
  /** Also plot issuance node count as a second line (right-reading). */
  showNodes?: boolean;
  height?: number;
}

const log10Ticks = (max: number): number[] => {
  const out: number[] = [];
  for (let e = 0; Math.pow(10, e) <= max * 1.0001; e++) out.push(Math.pow(10, e));
  return out;
};

const qpsTick = (v: number): string => {
  if (v >= 1e6) return `${trim(v / 1e6)}M`;
  if (v >= 1e3) return `${trim(v / 1e3)}K`;
  return String(Math.round(v));
};

const ttlTick = (v: number): string => {
  if (v >= 3600) return `${trim(v / 3600)}h`;
  if (v >= 60) return `${trim(v / 60)}m`;
  return `${Math.round(v)}s`;
};

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function IssuanceTtlChart({
  points,
  currentTtl,
  showNodes = false,
  height,
}: IssuanceTtlChartProps): ReactElement {
  const maxTtl = points.reduce((m, p) => Math.max(m, p.ttl), 0);
  const maxQps = points.reduce((m, p) => Math.max(m, p.issuanceQPS), 0);

  return (
    <ChartFrame
      height={height}
      ariaLabel="Issuance load versus token TTL (log-log)"
    >
      <LineChart data={points} margin={CHART_MARGIN}>
        <GlowDefs />
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" />
        <XAxis
          dataKey="ttl"
          type="number"
          scale="log"
          domain={["dataMin", "dataMax"]}
          ticks={log10Ticks(maxTtl)}
          tickFormatter={ttlTick}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          allowDataOverflow
        />
        <YAxis
          yAxisId="qps"
          type="number"
          scale="log"
          domain={["auto", "auto"]}
          ticks={log10Ticks(maxQps)}
          tickFormatter={qpsTick}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          width={48}
          allowDataOverflow
        />
        {showNodes ? (
          <YAxis
            yAxisId="nodes"
            orientation="right"
            type="number"
            domain={[0, "auto"]}
            tick={AXIS_TICK}
            axisLine={{ stroke: AXIS_LINE }}
            tickLine={{ stroke: AXIS_LINE }}
            width={36}
          />
        ) : null}
        <Tooltip
          cursor={{ stroke: TOKENS.faint, strokeDasharray: "3 3" }}
          content={
            <ChartTooltip
              labelFormatter={(l) => `TTL ${ttlTick(Number(l))}`}
              valueFormatter={(v, item) =>
                item.dataKey === "issNodes"
                  ? `${Math.round(v)} nodes`
                  : `${qpsTick(v)} qps`
              }
            />
          }
        />
        <Legend wrapperStyle={LEGEND_STYLE} iconType="plainline" />

        {currentTtl !== undefined ? (
          <ReferenceLine
            x={currentTtl}
            yAxisId="qps"
            stroke={TOKENS.cyan}
            strokeDasharray="4 4"
            strokeOpacity={0.85}
            label={{
              value: `TTL ${ttlTick(currentTtl)}`,
              position: "top",
              ...REF_LABEL_STYLE,
              fill: TOKENS.cyan,
            }}
          />
        ) : null}

        <Line
          yAxisId="qps"
          type="monotone"
          dataKey="issuanceQPS"
          name="Issuance QPS"
          stroke={TOKENS.violet}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: TOKENS.violet, stroke: TOKENS.bg }}
          filter={`url(#${GLOW_FILTER_ID})`}
          isAnimationActive={false}
        />
        {showNodes ? (
          <Line
            yAxisId="nodes"
            type="monotone"
            dataKey="issNodes"
            name="Issuance nodes"
            stroke={TOKENS.amber}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 3, fill: TOKENS.amber, stroke: TOKENS.bg }}
            isAnimationActive={false}
          />
        ) : null}
      </LineChart>
    </ChartFrame>
  );
}
