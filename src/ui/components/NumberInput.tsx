import { useEffect, useState } from "react";

export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Increment for the stepper buttons and arrow keys. Default 1. */
  step?: number;
  /** Unit suffix shown inside the field (e.g. "ms", "USD/GB", "x"). */
  unit?: string;
  /** Show the up/down stepper buttons. Default true. */
  steppers?: boolean;
  /** Round committed values to this many decimal places. */
  precision?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

function clamp(n: number, min?: number, max?: number): number {
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

function round(n: number, precision?: number): number {
  if (precision == null) return n;
  const f = 10 ** precision;
  return Math.round(n * f) / f;
}

/**
 * Small numeric input for editable assumptions. Keeps a local draft string so
 * partial input (e.g. "-", "0.") doesn't fight the controlled value, and
 * commits a clamped/rounded number on blur, Enter, or stepper click.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  steppers = true,
  precision,
  placeholder,
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  // Re-sync the draft when the external value changes and we're not editing.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const parsed = Number(draft);
  const invalid = draft.trim() !== "" && Number.isNaN(parsed);

  const commit = (raw: number) => {
    if (Number.isNaN(raw)) {
      setDraft(String(value));
      return;
    }
    const next = round(clamp(raw, min, max), precision);
    onChange(next);
    setDraft(String(next));
  };

  const bump = (dir: 1 | -1) => {
    const base = Number.isNaN(parsed) ? value : parsed;
    commit(base + dir * step);
  };

  const cls = ["ag-numinput", invalid && "is-invalid", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        value={draft}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(parsed);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit && <span className="ag-numinput__unit">{unit}</span>}
      {steppers && !disabled && (
        <span className="ag-numinput__step">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Increment"
            onClick={() => bump(1)}
          >
            ▲
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Decrement"
            onClick={() => bump(-1)}
          >
            ▼
          </button>
        </span>
      )}
    </div>
  );
}
