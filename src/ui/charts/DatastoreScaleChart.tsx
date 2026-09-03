/**
 * Runway — DatastoreScaleChart (datastore scaling overlay).
 *
 * Overlays the scaling curves of the three datastores (one colored line each)
 * against load (rps) on the x-axis, plotting a chosen per-point scalar (node
 * count or cost). A single-primary store (Postgres) gets:
 *   - a vertical ReferenceLine at its write wall (the rps past which writes
 *     exceed one primary), labeled, and
 *   - its line re-drawn dashed/red past that wall, so you can see at a glance
 *     that adding nodes there does NOT add write capacity — you must shard.
 *
 * Plain data props only — no model imports. The view maps DbScaleCurve[] into
 * these series via a small helper in chartmap.ts.
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
  dbColor,
  GLOW_FILTER_ID,
  GRID_COLOR,
  LEGEND_STYLE,
  refLabelProps,
  TOKENS,
} from "./chartTheme";

/** One datastore's curve of a chosen per-point scalar vs load. */
export interface DbScaleSeries {
  /** Series key / DB id (e.g. "postgres"); also drives the line color. */
  key: string;
  /** Display name (e.g. "Postgres"). */
  name: string;
  /** { rps, value } samples; value is in the metric's native unit. */
  points: Array<{ rps: number; value: number }>;
  /** Override the auto color (defaults to the per-DB palette hue). */
  color?: string;
  /**
   * For a single-primary store: total rps past which writes exceed one primary.
   * Draws a labeled vertical wall and re-draws this line dashed/red beyond it.
   * `null`/omitted for stores whose writes scale out horizontally.
   */
  writeWallRps?: number | null;
}

export interface DatastoreScaleChartProps {
  series: DbScaleSeries[];
  /** Format a value for the y-axis ticks + tooltip (e.g. nodes or $/mo). */
  valueFormatter: (v: number) => string;
  /** Format an rps value for the x-axis ticks + tooltip label. */
  rpsFormatter: (v: number) => string;
  /** Tooltip unit suffix (e.g. " nodes", ""). */
  unitSuffix?: string;
  height?: number;
  yAxisWidth?: number;
  ariaLabel?: string;
}

type Row = { rps: number } & Record<string, number>;

/** Merge series into Recharts row form keyed by rps, plus per-DB wall splits. */
function toRows(series: DbScaleSeries[]): Row[] {
  const byRps = new Map<number, Row>();
  for (const s of series) {
    const wall = s.writeWallRps ?? null;
    for (const p of s.points) {
      let row = byRps.get(p.rps);
      if (!row) {
        row = { rps: p.rps };
        byRps.set(p.rps, row);
      }
      if (wall != null) {
        // Split into a "before the wall" segment and a dashed "past the wall"
        // segment; overlap one sample so the two lines visually join.
        if (p.rps <= wall) row[`${s.key}__ok`] = p.value;
        if (p.rps >= wall) row[`${s.key}__wall`] = p.value;
      } else {
        row[s.key] = p.value;
      }
    }
  }
  return [...byRps.values()].sort((a, b) => a.rps - b.rps);
}

export function DatastoreScaleChart({
  series,
  valueFormatter,
  rpsFormatter,
  unitSuffix,
  height,
  yAxisWidth,
  ariaLabel,
}: DatastoreScaleChartProps): ReactElement {
  const rows = toRows(series);
  const colorOf = (s: DbScaleSeries) => s.color ?? dbColor(s.key);

  return (
    <ChartFrame
      height={height}
      ariaLabel={ariaLabel ?? `Datastore scaling: ${series.length} engines vs load`}
    >
      <LineChart data={rows} margin={CHART_MARGIN}>
        <GlowDefs />
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="rps"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={rpsFormatter}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={valueFormatter}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={{ stroke: AXIS_LINE }}
          width={yAxisWidth ?? 52}
        />
        <Tooltip
          cursor={{ stroke: TOKENS.faint, strokeDasharray: "3 3" }}
          content={
            <ChartTooltip
              labelFormatter={(l) => `${rpsFormatter(Number(l))} rps`}
              valueFormatter={(v) => valueFormatter(v)}
              unitSuffix={unitSuffix ?? ""}
            />
          }
        />
        <Legend wrapperStyle={LEGEND_STYLE} iconType="plainline" />

        {/* Vertical write walls (single-primary stores). */}
        {series.map((s) =>
          s.writeWallRps != null ? (
            <ReferenceLine
              key={`wall-${s.key}`}
              x={s.writeWallRps}
              stroke={TOKENS.red}
              strokeDasharray="4 3"
              strokeOpacity={0.85}
              {...refLabelProps(
                `${s.name} write wall`,
                "insideTopLeft",
                TOKENS.red,
              )}
            />
          ) : null,
        )}

        {series.map((s) => {
          const color = colorOf(s);
          const wall = s.writeWallRps ?? null;
          if (wall == null) {
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
          }
          // Single-primary: solid up to the wall, dashed/red past it.
          return [
            <Line
              key={`${s.key}__ok`}
              type="monotone"
              dataKey={`${s.key}__ok`}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: color, stroke: TOKENS.bg }}
              filter={`url(#${GLOW_FILTER_ID})`}
              isAnimationActive={false}
              connectNulls
            />,
            <Line
              key={`${s.key}__wall`}
              type="monotone"
              dataKey={`${s.key}__wall`}
              name={`${s.name} (write wall)`}
              stroke={TOKENS.red}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 3, fill: TOKENS.red, stroke: TOKENS.bg }}
              isAnimationActive={false}
              connectNulls
              legendType="none"
            />,
          ];
        })}
      </LineChart>
    </ChartFrame>
  );
}
