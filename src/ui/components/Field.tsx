import type { ReactNode } from "react";

export interface FieldProps {
  /** Short uppercase mono label shown above/left of the control. */
  label?: ReactNode | undefined;
  /** Live value rendered right-aligned in the header (e.g. the slider value). */
  value?: ReactNode | undefined;
  /** Optional unit appended after `value`. */
  unit?: string | undefined;
  /** One-line helper text under the control. */
  hint?: ReactNode | undefined;
  /** Dim + disable interaction for the whole field. */
  disabled?: boolean | undefined;
  /** Associates the label with a control for a11y. */
  htmlFor?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * Vertical labelled wrapper for a single control: a header row
 * (label left, live value right), the control, and an optional hint.
 * Presentational only.
 */
export function Field({
  label,
  value,
  unit,
  hint,
  disabled = false,
  htmlFor,
  className,
  children,
}: FieldProps) {
  const cls = ["ag-field", disabled && "ag-field--disabled", className]
    .filter(Boolean)
    .join(" ");
  const showHead = label != null || value != null;
  return (
    <div className={cls}>
      {showHead && (
        <div className="ag-field__head">
          {label != null && (
            <label className="ag-field__label" htmlFor={htmlFor}>
              {label}
            </label>
          )}
          {value != null && (
            <span className="ag-field__value">
              {value}
              {unit && <span className="ag-field__unit">{unit}</span>}
            </span>
          )}
        </div>
      )}
      {children}
      {hint != null && <div className="ag-field__hint">{hint}</div>}
    </div>
  );
}

export interface ControlRowProps {
  /** Left-hand label. */
  label: ReactNode;
  /** Optional smaller sub-label under the main label. */
  sub?: ReactNode;
  /** Stack the control under the label instead of beside it. */
  stack?: boolean;
  className?: string;
  /** The control rendered on the right (or below, when `stack`). */
  children: ReactNode;
}

/**
 * Horizontal labelled row with a bottom divider: label (and optional sub-label)
 * on the left, control on the right. Use inside a panel for assumption lists
 * and control stacks.
 */
export function ControlRow({
  label,
  sub,
  stack = false,
  className,
  children,
}: ControlRowProps) {
  const cls = ["ag-controlrow", stack && "ag-controlrow--stack", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <div className="ag-controlrow__label">
        {label}
        {sub != null && <span className="ag-controlrow__sub">{sub}</span>}
      </div>
      <div className="ag-controlrow__control">{children}</div>
    </div>
  );
}
