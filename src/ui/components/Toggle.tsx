import type { CSSProperties, ReactNode } from "react";
import type { SliderAccent } from "./Slider.tsx";

const ACCENT: Record<SliderAccent, { color: string; glow: string }> = {
  cyan: { color: "var(--cyan)", glow: "rgba(52, 195, 255, 0.55)" },
  green: { color: "var(--green)", glow: "rgba(57, 217, 138, 0.55)" },
  amber: { color: "var(--amber)", glow: "rgba(255, 181, 71, 0.55)" },
  violet: { color: "var(--violet)", glow: "rgba(176, 140, 255, 0.55)" },
  red: { color: "var(--red)", glow: "rgba(255, 93, 93, 0.55)" },
  blue: { color: "var(--blue)", glow: "rgba(111, 140, 255, 0.55)" },
  pink: { color: "var(--pink)", glow: "rgba(255, 126, 182, 0.55)" },
};

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text shown to the right of the switch. */
  label?: ReactNode;
  /** Accent color when on (default green). */
  accent?: SliderAccent;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * On/off switch (custom track + thumb). Uses the button + `aria-checked`
 * switch pattern; keyboard-operable. Presentational.
 */
export function Toggle({
  checked,
  onChange,
  label,
  accent = "green",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: ToggleProps) {
  const a = ACCENT[accent];
  const style = {
    "--ag-accent": a.color,
    "--ag-glow": a.glow,
  } as CSSProperties;
  const cls = ["ag-toggle", disabled && "ag-toggle--disabled", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      disabled={disabled}
      className={cls}
      style={style}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="ag-toggle__track">
        <span className="ag-toggle__thumb" />
      </span>
      {label != null && <span className="ag-toggle__label">{label}</span>}
    </button>
  );
}
