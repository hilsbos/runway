/**
 * Runway — request-path flow diagram.
 *
 * A live SVG picture of the configured stack: CLIENT → LB → API → branches to
 * CACHE (when distributed) and DATASTORE. Each tier box shows tech, node count
 * (with now→horizon growth), a utilization bar, and cost; the bottleneck gets an
 * amber ring and over-capacity tiers turn red. Edges carry raw per-hop latency
 * labels and animated flow dots (disabled under prefers-reduced-motion). The
 * boxes are presentational; the svg carries an aria-label summary of the path.
 *
 * Presentational: reads StackResult/StackInputs + formatters only — no model
 * formulas or constants.
 */
import { createElement, useEffect, useState } from "react";
import type {
  StackInputs,
  StackResult,
  TierKey,
} from "../../model/index.ts";
import { money, ms, percent } from "../../model/index.ts";
import {
  TOKENS,
  TIER_COLORS,
  TIER_LABELS,
  healthColor,
  healthLevel,
} from "../charts/chartTheme.ts";

/* -------------------------------------------------------------------------- */
/* reduced-motion                                                             */
/* -------------------------------------------------------------------------- */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* -------------------------------------------------------------------------- */
/* geometry                                                                   */
/* -------------------------------------------------------------------------- */

const VB_W = 1000;
const VB_H = 300;
const FONT = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DB_LABEL: Record<StackInputs["db"], string> = {
  cassandra: "Cassandra",
  mongodb: "MongoDB",
  postgres: "Postgres",
  mysql: "MySQL",
  aurora: "Aurora",
  oracledb: "Oracle",
};

export interface StackDiagramProps {
  now: StackResult;
  future?: StackResult | undefined;
  inputs: StackInputs;
}

export function StackDiagram({
  now,
  future,
  inputs,
}: StackDiagramProps) {
  const reduced = useReducedMotion();
  const hasCacheBox = inputs.cache === "distributed";

  const client: Box = { x: 22, y: 128, w: 84, h: 44 };
  const lb: Box = { x: 175, y: 102, w: 150, h: 96 };
  const api: Box = { x: 375, y: 90, w: 190, h: 120 };
  const cache: Box = { x: 690, y: 26, w: 170, h: 92 };
  const dbCy = hasCacheBox ? 228 : 150;
  const datastore: Box = { x: 690, y: dbCy - 46, w: 170, h: 92 };

  // edges (center-line paths reused by arrows + flow dots)
  const edges: {
    id: string;
    d: string;
    color: string;
    lat: number;
    lx: number;
    ly: number;
  }[] = [
    { id: "e-client", d: "M106,150 L175,150", color: TOKENS.cyan, lat: now.latHops.lb, lx: 140, ly: 142 },
    { id: "e-lb", d: "M325,150 L375,150", color: TOKENS.green, lat: now.latHops.api, lx: 350, ly: 142 },
  ];
  if (hasCacheBox) {
    edges.push({ id: "e-cache", d: "M565,128 C630,128 630,72 690,72", color: TOKENS.amber, lat: now.latHops.cacheHit, lx: 615, ly: 92 });
    edges.push({ id: "e-db", d: "M565,172 C630,172 630,228 690,228", color: TOKENS.violet, lat: now.latHops.db, lx: 615, ly: 214 });
  } else {
    edges.push({ id: "e-db", d: "M565,150 L690,150", color: TOKENS.violet, lat: now.latHops.db, lx: 628, ly: 142 });
  }

  const overCap = (tier: TierKey, util: number): boolean => {
    if (tier === "datastore" && now.writeCeiling) return true;
    if (tier === "api" && now.memOver) return true;
    return healthLevel(util) === "bad";
  };

  const ariaSummary =
    `Request path: client to load balancer (${now.lbNodes} nodes) to API ` +
    `(${now.apiNodes} nodes)${hasCacheBox ? `, branching to cache (${now.cacheNodes} nodes) and` : ", to"} ` +
    `datastore (${now.dbNodes} nodes). Bottleneck: ${TIER_LABELS[now.bottleneck]}. ` +
    `${money(now.total)} per month, p99 ${ms(now.p99)}.`;

  return (
    <div className="stackdiagram">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaSummary}
      >
        <defs>
          <marker
            id="ag-diagram-arrow"
            markerWidth="9"
            markerHeight="9"
            refX="6.5"
            refY="3"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L6.5,3 L0,6 z" fill={TOKENS.dim} />
          </marker>
          <filter id="ag-diagram-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* edges */}
        {edges.map((e) => (
          <path
            key={e.id}
            d={e.d}
            fill="none"
            stroke={TOKENS.line}
            strokeWidth={1.5}
            markerEnd="url(#ag-diagram-arrow)"
            aria-hidden
          />
        ))}

        {/* flow dots */}
        {!reduced &&
          edges.map((e) => (
            <circle key={`${e.id}-dot`} r={3.5} fill={e.color} opacity={0.85} aria-hidden>
              {createElement("animateMotion", {
                path: e.d,
                dur: "1.9s",
                repeatCount: "indefinite",
              })}
            </circle>
          ))}

        {/* per-hop latency labels */}
        {edges.map((e) => (
          <EdgeLatency key={`${e.id}-lat`} x={e.lx} y={e.ly} text={ms(e.lat)} />
        ))}

        {/* CLIENT pill */}
        <g aria-hidden>
          <rect
            x={client.x}
            y={client.y}
            width={client.w}
            height={client.h}
            rx={22}
            fill={TOKENS.panel2}
            stroke={TOKENS.line}
          />
          <text
            x={client.x + client.w / 2}
            y={client.y + 20}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={13}
            fontWeight={600}
            fill={TOKENS.ink}
          >
            CLIENT
          </text>
          <text
            x={client.x + client.w / 2}
            y={client.y + 35}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={10}
            fill={TOKENS.dim}
          >
            {compactRps(inputs.rps)}
          </text>
        </g>

        {/* tier boxes */}
        <TierBox
          tier="lb"
          box={lb}
          sub="HAProxy"
          nodes={now.lb.nodes}
          future={future?.lb.nodes}
          cost={now.lb.cost}
          util={now.lb.util}
          bottleneck={now.bottleneck === "lb"}
          over={overCap("lb", now.lb.util)}
        />

        <TierBox
          tier="api"
          box={api}
          sub={`${inputs.lang}/${inputs.proto} · ${inputs.cores}vCPU·${inputs.ramGB}GB`}
          nodes={now.api.nodes}
          future={future?.api.nodes}
          cost={now.api.cost}
          cpu={now.api.util}
          ram={now.memUtil}
          badge={inputs.cache === "local" ? `local cache ${percent(inputs.hitRatio)}` : undefined}
          bottleneck={now.bottleneck === "api"}
          over={overCap("api", now.api.util)}
        />

        {hasCacheBox && (
          <TierBox
            tier="cache"
            box={cache}
            sub="Redis"
            nodes={now.cache.nodes}
            future={future?.cache.nodes}
            cost={now.cache.cost}
            util={now.cache.util}
            bottleneck={now.bottleneck === "cache"}
            over={overCap("cache", now.cache.util)}
          />
        )}

        <TierBox
          tier="datastore"
          box={datastore}
          sub={DB_LABEL[inputs.db]}
          nodes={now.datastore.nodes}
          future={future?.datastore.nodes}
          cost={now.datastore.cost}
          util={now.datastore.util}
          tag={now.writeCeiling ? "write ceiling" : undefined}
          bottleneck={now.bottleneck === "datastore"}
          over={overCap("datastore", now.datastore.util)}
        />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* edge latency label                                                          */
/* -------------------------------------------------------------------------- */

function EdgeLatency({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 6.2 + 10;
  return (
    <g aria-hidden>
      <rect x={x - w / 2} y={y - 11} width={w} height={15} rx={4} fill={TOKENS.bg} opacity={0.85} />
      <text x={x} y={y} textAnchor="middle" fontFamily={FONT} fontSize={9.5} fill={TOKENS.dim}>
        {text}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* tier box                                                                   */
/* -------------------------------------------------------------------------- */

interface TierBoxProps {
  tier: TierKey;
  box: Box;
  sub: string;
  nodes: number;
  future?: number | undefined;
  cost: number;
  util?: number;
  cpu?: number;
  ram?: number;
  badge?: string | undefined;
  tag?: string | undefined;
  bottleneck: boolean;
  over: boolean;
}

function TierBox({
  tier,
  box,
  sub,
  nodes,
  future,
  cost,
  util,
  cpu,
  ram,
  badge,
  tag,
  bottleneck,
  over,
}: TierBoxProps) {
  const { x, y, w, h } = box;
  const accent = TIER_COLORS[tier];
  const stroke = over ? TOKENS.red : bottleneck ? TOKENS.amber : accent;
  const isCompute = cpu != null || ram != null;
  const grow = future != null && future !== nodes ? ` → ×${future}` : "";

  return (
    <g className="stackdiagram__node" aria-hidden>
      {/* body */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill={over ? "rgba(255,93,93,0.07)" : TOKENS.panel2}
        stroke={stroke}
        strokeWidth={bottleneck || over ? 2 : 1.5}
        {...(bottleneck ? { filter: "url(#ag-diagram-glow)" } : {})}
      />

      {/* name + cost */}
      <text x={x + 12} y={y + 22} fontFamily={FONT} fontSize={14} fontWeight={700} fill={TOKENS.ink}>
        {TIER_LABELS[tier]}
      </text>
      <text x={x + w - 12} y={y + 22} textAnchor="end" fontFamily={FONT} fontSize={11.5} fill={TOKENS.dim}>
        {money(cost)}
      </text>

      {/* tech sublabel */}
      <text x={x + 12} y={y + 39} fontFamily={FONT} fontSize={10.5} fill={TOKENS.dim}>
        {sub}
      </text>

      {/* node count + growth */}
      <text x={x + 12} y={y + 60} fontFamily={FONT} fontSize={14} fill={TOKENS.ink}>
        <tspan fontWeight={700}>×{nodes}</tspan>
        <tspan fill={TOKENS.amber}>{grow}</tspan>
      </text>

      {/* tag (e.g. write ceiling) */}
      {tag && (
        <text x={x + w - 12} y={y + 60} textAnchor="end" fontFamily={FONT} fontSize={10} fill={TOKENS.red}>
          {tag}
        </text>
      )}

      {/* local-cache badge */}
      {badge && (
        <g>
          <rect x={x + 12} y={y + 68} width={w - 24} height={16} rx={8} fill="rgba(52,195,255,0.12)" stroke={TOKENS.cyan} strokeOpacity={0.4} />
          <text x={x + w / 2} y={y + 79} textAnchor="middle" fontFamily={FONT} fontSize={9.5} fill={TOKENS.cyan}>
            {badge}
          </text>
        </g>
      )}

      {/* utilization bars */}
      {isCompute ? (
        <>
          <UtilBarSvg x={x + 38} y={y + h - 30} w={w - 50} util={cpu ?? 0} label="CPU" />
          <UtilBarSvg x={x + 38} y={y + h - 14} w={w - 50} util={ram ?? 0} label="RAM" />
        </>
      ) : (
        <UtilBarSvg x={x + 38} y={y + h - 16} w={w - 50} util={util ?? 0} label="UTIL" />
      )}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* svg util bar                                                                */
/* -------------------------------------------------------------------------- */

function UtilBarSvg({
  x,
  y,
  w,
  util,
  label,
}: {
  x: number;
  y: number;
  w: number;
  util: number;
  label: string;
}) {
  const fillW = Math.max(0, Math.min(1, util)) * w;
  const color = healthColor(util);
  return (
    <g aria-hidden>
      <text x={x - 6} y={y + 6} textAnchor="end" fontFamily={FONT} fontSize={8.5} fill={TOKENS.faint}>
        {label}
      </text>
      <rect x={x} y={y} width={w} height={6} rx={3} fill={TOKENS.grid} />
      <rect x={x} y={y} width={fillW} height={6} rx={3} fill={color} />
      <text x={x + w} y={y - 2} textAnchor="end" fontFamily={FONT} fontSize={8.5} fill={util >= 0.9 ? TOKENS.red : TOKENS.dim}>
        {percent(util)}
      </text>
    </g>
  );
}

/* compact rps for the client pill (avoids a model import beyond formatters) */
function compactRps(rps: number): string {
  if (rps >= 1e6) return `${trim(rps / 1e6)}M rps`;
  if (rps >= 1e3) return `${trim(rps / 1e3)}K rps`;
  return `${Math.round(rps)} rps`;
}
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}
