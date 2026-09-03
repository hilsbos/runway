import type { ReactNode } from "react";

export type BannerVariant = "ok" | "warn" | "bad" | "info";

/** Inline status icons (stroke = currentColor, set by the variant accent). */
function BannerIcon({ variant }: { variant: BannerVariant }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (variant) {
    case "ok":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12.5l2.5 2.5 4.5-5" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path d="M12 3l9 16H3z" />
          <path d="M12 9v5" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "bad":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case "info":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export interface BannerProps {
  variant: BannerVariant;
  /** Optional bold display title (e.g. "Recommended", "Running hot"). */
  title?: ReactNode;
  /** The message body. */
  children: ReactNode;
  /** Replace the default variant icon (pass `null` to hide it). */
  icon?: ReactNode;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Status / verdict banner with ok / warn / bad / info variants, each with an
 * accent color, faint background wash, left border, and an icon. Used for the
 * stack status line and the auto-generated recommendation banner.
 * Presentational.
 */
export function Banner({
  variant,
  title,
  children,
  icon,
  actions,
  className,
}: BannerProps) {
  const cls = ["ag-banner", `ag-banner--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} role="status">
      {icon !== null && (
        <span className="ag-banner__icon">
          {icon ?? <BannerIcon variant={variant} />}
        </span>
      )}
      <div className="ag-banner__body">
        {title != null && <div className="ag-banner__title">{title}</div>}
        <div className="ag-banner__text">{children}</div>
      </div>
      {actions != null && <div className="ag-banner__actions">{actions}</div>}
    </div>
  );
}
