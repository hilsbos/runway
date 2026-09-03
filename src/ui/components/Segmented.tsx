import type { CSSProperties, ReactNode } from "react";
import type { SliderAccent } from "./Slider.tsx";

const ACCENT_COLOR: Record<SliderAccent, string> = {
  cyan: "var(--cyan)",
  green: "var(--green)",
  amber: "var(--amber)",
  violet: "var(--violet)",
  red: "var(--red)",
  blue: "var(--blue)",
  pink: "var(--pink)",
};

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional per-option disable. */
  disabled?: boolean;
  /** Tooltip / title text. */
  title?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Stretch to fill the container with equal-width segments. */
  block?: boolean;
  /**
   * Lay segments out as a responsive grid that wraps to multiple rows instead
   * of overflowing — use when there are too many options to fit one row.
   */
  wrap?: boolean;
  /** Tint the active segment with an accent color (used for authz planes etc.). */
  accent?: SliderAccent;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Segmented-button toggle group (single select). Builds on the `.ag-segmented`
 * base class; uses `aria-pressed` for state and accent tinting.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  block = false,
  wrap = false,
  accent,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: SegmentedProps<T>) {
  const cls = [
    "ag-segmented",
    block && "ag-segmented--block",
    wrap && "ag-segmented--wrap",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const style = accent
    ? ({ "--ag-accent": ACCENT_COLOR[accent] } as CSSProperties)
    : undefined;
  return (
    <div className={cls} role="group" aria-label={ariaLabel} style={style}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            aria-pressed={active}
            disabled={disabled || opt.disabled}
            className={[active && "is-active", accent && "is-accent"]
              .filter(Boolean)
              .join(" ")}
            onClick={() => !active && onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
