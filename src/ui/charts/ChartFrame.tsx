/**
 * Runway — shared chart frame.
 *
 * Wraps a Recharts chart in a ResponsiveContainer and provides the shared
 * <defs> (soft glow filter) so every chart in the panel reads the same. Keeps
 * the individual chart components small and consistent.
 *
 * No model imports.
 */

import type { ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { DEFAULT_HEIGHT, GLOW_FILTER_ID, TOKENS } from "./chartTheme";

export interface ChartFrameProps {
  /** A single Recharts chart element (e.g. <LineChart>...). */
  children: ReactElement;
  /** Fixed pixel height of the chart area. Width is always responsive. */
  height?: number | undefined;
  /** Optional aria label for the chart region. */
  ariaLabel?: string | undefined;
}

/**
 * Reusable <defs> block: a soft Gaussian-blur glow filter usable by any
 * series via `filter={url(#ag-chart-glow)}`. Rendered inside each chart's SVG.
 */
export function GlowDefs(): ReactElement {
  return (
    <defs>
      <filter id={GLOW_FILTER_ID} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

export function ChartFrame({
  children,
  height = DEFAULT_HEIGHT,
  ariaLabel,
}: ChartFrameProps): ReactElement {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", minWidth: 0, color: TOKENS.ink }}
    >
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Convenience wrapper for arbitrary chart-adjacent content (legends etc.). */
export function ChartCaption({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      className="mono"
      style={{ fontSize: 11, color: TOKENS.dim, marginTop: 6 }}
    >
      {children}
    </div>
  );
}
