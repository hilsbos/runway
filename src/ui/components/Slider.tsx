import { useId } from "react";
import type { CSSProperties } from "react";
import { Field } from "./Field.tsx";

export type SliderAccent =
  | "cyan"
  | "green"
  | "amber"
  | "violet"
  | "red"
  | "blue"
  | "pink";

const ACCENT_VARS: Record<SliderAccent, { color: string; glow: string }> = {
  cyan: { color: "var(--cyan)", glow: "rgba(52, 195, 255, 0.55)" },
  green: { color: "var(--green)", glow: "rgba(57, 217, 138, 0.55)" },
  amber: { color: "var(--amber)", glow: "rgba(255, 181, 71, 0.55)" },
  violet: { color: "var(--violet)", glow: "rgba(176, 140, 255, 0.55)" },
  red: { color: "var(--red)", glow: "rgba(255, 93, 93, 0.55)" },
  blue: { color: "var(--blue)", glow: "rgba(111, 140, 255, 0.55)" },
  pink: { color: "var(--pink)", glow: "rgba(255, 126, 182, 0.55)" },
};

export interface SliderProps {
  /** Current value in real (un-scaled) units. */
  value: number;
  /** Called with the new real-unit value on every change. */
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Step in real units (linear) or in slider-position units (log). Default 1. */
  step?: number;
  /**
   * Log scale: the thumb position is linear in log10(value), so RPS/users feel
   * natural across orders of magnitude. Requires min > 0.
   */
  log?: boolean;
  /** Field label (omit to render a bare slider). */
  label?: string;
  /** Unit shown next to the live value (e.g. "rps", "GB", "%"). */
  unit?: string;
  /** Format the live value for display. Defaults to the raw number. */
  format?: (value: number) => string;
  /** Helper line under the slider. */
  hint?: string;
  /** Optional min/max tick labels under the track. */
  ticks?: boolean;
  accent?: SliderAccent;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/** Map a real value to a 0..1000 slider position (linear or log10). */
function toPos(value: number, min: number, max: number, log: boolean): number {
  const RES = 1000;
  if (log) {
    const lmin = Math.log10(min);
    const lmax = Math.log10(max);
    const lv = Math.log10(Math.max(min, value));
    return ((lv - lmin) / (lmax - lmin)) * RES;
  }
  return ((value - min) / (max - min)) * RES;
}

/** Map a 0..1000 slider position back to a real value. */
function fromPos(pos: number, min: number, max: number, log: boolean): number {
  const RES = 1000;
  const t = pos / RES;
  if (log) {
    const lmin = Math.log10(min);
    const lmax = Math.log10(max);
    return 10 ** (lmin + t * (lmax - lmin));
  }
  return min + t * (max - min);
}

/** Round a log-scale value to a tidy 2-significant-figure step. */
function tidy(value: number): number {
  if (value <= 0) return value;
  const mag = 10 ** Math.floor(Math.log10(value));
  const snap = mag / 10;
  return Math.round(value / snap) * snap;
}

/**
 * Custom-thumb range slider matching the instrument-panel aesthetic, with an
 * optional log scale for values that span orders of magnitude. Presentational:
 * holds no internal value state.
 */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  log = false,
  label,
  unit,
  format,
  hint,
  ticks = false,
  accent = "cyan",
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
}: SliderProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const accentVars = ACCENT_VARS[accent];

  const useLog = log && min > 0 && max > 0;
  const pos = useLog ? toPos(value, min, max, true) : value;
  const fillPct = useLog
    ? toPos(value, min, max, true) / 10
    : ((value - min) / (max - min)) * 100;

  const handle = (raw: number) => {
    if (useLog) {
      onChange(tidy(fromPos(raw, min, max, true)));
    } else {
      onChange(raw);
    }
  };

  const display = format ? format(value) : String(value);

  const style = {
    "--ag-accent": accentVars.color,
    "--ag-glow": accentVars.glow,
    "--ag-fill": `${Math.max(0, Math.min(100, fillPct))}%`,
  } as CSSProperties;

  const track = (
    <>
      <div className="ag-slider-wrap" style={style}>
        <input
          id={inputId}
          type="range"
          className="ag-slider"
          aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
          min={useLog ? 0 : min}
          max={useLog ? 1000 : max}
          step={useLog ? 1 : step}
          value={pos}
          disabled={disabled}
          onChange={(e) => handle(Number(e.target.value))}
        />
      </div>
      {ticks && (
        <div className="ag-slider__ticks">
          <span>{format ? format(min) : min}</span>
          <span>{format ? format(max) : max}</span>
        </div>
      )}
    </>
  );

  if (label == null && unit == null && hint == null) {
    return <div className={className}>{track}</div>;
  }

  return (
    <Field
      label={label}
      value={display}
      unit={unit}
      hint={hint}
      disabled={disabled}
      htmlFor={inputId}
      className={className}
    >
      {track}
    </Field>
  );
}

/**
 * Convenience log-scale slider for RPS / users / data sizes. Identical to
 * `Slider` with `log` forced on and a sensible default formatter.
 */
export function LogSlider(props: Omit<SliderProps, "log">) {
  return <Slider {...props} log />;
}
