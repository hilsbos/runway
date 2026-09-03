import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import type { SliderAccent } from "./Slider.tsx";
import { UtilBar } from "./UtilBar.tsx";

const ACCENT: Record<SliderAccent, string> = {
  cyan: "var(--cyan)",
  green: "var(--green)",
  amber: "var(--amber)",
  violet: "var(--violet)",
  red: "var(--red)",
  blue: "var(--blue)",
  pink: "var(--pink)",
  lime: "var(--lime)",
};

/** A key/value spec chip (e.g. "8 vCPU", "16 GB", "rf 3"). */
export interface TierSpec {
  label: string;
  value: ReactNode;
}

export interface TierCardProps {
  /** Tier / component name (e.g. "API", "Datastore", "Issuance"). */
  name: ReactNode;
  /** Node count headline (omit for tiers without nodes, e.g. local cache). */
  nodes?: number;
  /** Word after the node count. Default "nodes". */
  nodesUnit?: string;
  /** Formatted monthly cost (e.g. "$1,997"). */
  cost?: ReactNode;
  /** Small line under the cost (e.g. "USD/mo"). Default "/mo". */
  costSub?: ReactNode;
  /** Spec chips shown as a meta row. */
  specs?: TierSpec[];
  /**
   * Single overall utilization (0..1). Used by the default variant. Ignored
   * when `cpu`/`ram` are provided (API/compute variant).
   */
  util?: number;
  /** API/compute variant: CPU utilization fraction (0..1). */
  cpu?: number;
  /** API/compute variant: RAM utilization fraction (0..1). */
  ram?: number;
  /** Dot/accent color (capacity tiers green/cyan/amber, authz violet/red). */
  accent?: SliderAccent;
  /** Flag this card as the current bottleneck (amber ring). */
  bottleneck?: boolean;
  /** Render in the error state (red border) — e.g. write ceiling. */
  bad?: boolean;
  /** DOM id (e.g. for scroll-into-view from the request-path diagram). */
  id?: string;
  /** Highlight ring when this tier is focused elsewhere (diagram/chart). */
  focused?: boolean;
  /** Click handler — makes the card selectable to focus its tier. */
  onClick?: () => void;
  /** Extra content under the bars (notes, links). */
  children?: ReactNode;
  className?: string;
}

/**
 * Component/tier card for the stack readout: name + dot, node count, monthly
 * cost, spec chips, and one or more utilization bars (green/amber/red by
 * threshold). The API/compute variant shows separate CPU and RAM bars when
 * `cpu`/`ram` are passed. Presentational.
 */
export function TierCard({
  name,
  nodes,
  nodesUnit = "nodes",
  cost,
  costSub = "/mo",
  specs,
  util,
  cpu,
  ram,
  accent = "cyan",
  bottleneck = false,
  bad = false,
  id,
  focused = false,
  onClick,
  children,
  className,
}: TierCardProps) {
  const isCompute = cpu != null || ram != null;
  const style = { "--ag-accent": ACCENT[accent] } as CSSProperties;
  const cls = [
    "ag-tiercard",
    bottleneck && "ag-tiercard--bottleneck",
    bad && "ag-tiercard--bad",
    focused && "ag-tiercard--focused",
    onClick && "ag-tiercard--clickable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={style}
      {...(id ? { id } : {})}
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
    >
      <div className="ag-tiercard__head">
        <div className="ag-tiercard__name">
          <span className="ag-tiercard__dot" aria-hidden />
          {name}
        </div>
        {cost != null && (
          <div className="ag-tiercard__cost">
            {cost}
            {costSub != null && (
              <span className="ag-tiercard__cost-sub">{costSub}</span>
            )}
          </div>
        )}
      </div>

      {nodes != null && (
        <div className="ag-tiercard__nodes">
          <b>{nodes}</b> {nodesUnit}
        </div>
      )}

      {specs && specs.length > 0 && (
        <div className="ag-tiercard__meta">
          {specs.map((s, i) => (
            <span key={i}>
              {s.label} <b>{s.value}</b>
            </span>
          ))}
        </div>
      )}

      <div className="ag-tiercard__bars">
        {isCompute ? (
          <>
            {cpu != null && <UtilBar label="CPU" value={cpu} />}
            {ram != null && <UtilBar label="RAM" value={ram} />}
          </>
        ) : (
          util != null && <UtilBar label="UTIL" value={util} />
        )}
      </div>

      {children}
    </div>
  );
}
