/**
 * Runway — shared result renderers used by both views:
 *  - VerdictBanner: maps a model Verdict to the <Banner>;
 *  - TierGrid: renders the five-tier card row from a StackResult, with optional
 *    "now vs future" node deltas;
 *  - bottleneck / accent helpers.
 */
import { Banner, TierCard, type SliderAccent } from "../components/index.ts";
import type {
  StackResult,
  TierKey,
  Verdict,
} from "../../model/index.ts";
import { money } from "../../model/index.ts";

/* -------------------------------------------------------------------------- */
/* verdict banner                                                             */
/* -------------------------------------------------------------------------- */

const TONE_TO_VARIANT = { good: "ok", warn: "warn", bad: "bad" } as const;

export function VerdictBanner({ verdict }: { verdict: Verdict }) {
  return (
    <Banner variant={TONE_TO_VARIANT[verdict.tone]} title={verdict.headline}>
      {verdict.detail}
    </Banner>
  );
}

/* -------------------------------------------------------------------------- */
/* tier cards                                                                 */
/* -------------------------------------------------------------------------- */

const TIER_ACCENT: Record<TierKey, SliderAccent> = {
  lb: "cyan",
  api: "green",
  cache: "cyan",
  datastore: "amber",
  authz: "violet",
};

const TIER_NAME: Record<TierKey, string> = {
  lb: "Load balancer",
  api: "API",
  cache: "Cache",
  datastore: "Datastore",
  authz: "Authorization",
};

export interface TierGridProps {
  now: StackResult;
  /** Optional future snapshot to show node-count deltas. */
  future?: StackResult | undefined;
  /** Tier to highlight (focused from the request-path diagram). */
  highlight?: TierKey | undefined;
  /** Select a tier (clicking a card focuses it elsewhere). */
  onSelectTier?: ((t: TierKey) => void) | undefined;
}

function nodeDelta(now: number, future?: number) {
  if (future == null || future === now) return undefined;
  const d = future - now;
  return `${d > 0 ? "+" : ""}${d} by horizon`;
}

export function TierGrid({ now, future, highlight, onSelectTier }: TierGridProps) {
  const az = now.authz;
  // shared focus/select wiring for a capacity tier card
  const focus = (t: TierKey) => ({
    id: `tier-card-${t}`,
    focused: highlight === t,
    ...(onSelectTier ? { onClick: () => onSelectTier(t) } : {}),
  });
  return (
    <div className="tiergrid">
      <TierCard
        name={TIER_NAME.lb}
        nodes={now.lb.nodes}
        cost={money(now.lb.cost)}
        util={now.lb.util}
        accent={TIER_ACCENT.lb}
        bottleneck={now.bottleneck === "lb"}
        {...focus("lb")}
      >
        {future && nodeDelta(now.lb.nodes, future.lb.nodes) && (
          <p className="tiergrid__delta">{nodeDelta(now.lb.nodes, future.lb.nodes)}</p>
        )}
      </TierCard>

      <TierCard
        name={TIER_NAME.api}
        nodes={now.api.nodes}
        cost={money(now.api.cost)}
        cpu={now.api.util}
        ram={now.memUtil}
        accent={TIER_ACCENT.api}
        bottleneck={now.bottleneck === "api"}
        bad={now.memOver}
        {...focus("api")}
      >
        {future && nodeDelta(now.api.nodes, future.api.nodes) && (
          <p className="tiergrid__delta">{nodeDelta(now.api.nodes, future.api.nodes)}</p>
        )}
      </TierCard>

      <TierCard
        name={TIER_NAME.cache}
        nodes={now.cache.nodes}
        cost={money(now.cache.cost)}
        util={now.cache.util}
        accent={TIER_ACCENT.cache}
        bottleneck={now.bottleneck === "cache"}
        {...focus("cache")}
      >
        {now.cache.nodes === 0 && (
          <p className="tiergrid__delta">in-process / none</p>
        )}
      </TierCard>

      <TierCard
        name={TIER_NAME.datastore}
        nodes={now.datastore.nodes}
        cost={money(now.datastore.cost)}
        util={now.datastore.util}
        accent={TIER_ACCENT.datastore}
        bottleneck={now.bottleneck === "datastore"}
        bad={now.writeCeiling}
        {...focus("datastore")}
      >
        {now.writeCeiling && <p className="tiergrid__delta">write ceiling</p>}
        {future && nodeDelta(now.datastore.nodes, future.datastore.nodes) && (
          <p className="tiergrid__delta">{nodeDelta(now.datastore.nodes, future.datastore.nodes)}</p>
        )}
      </TierCard>

      {az.enabled && (
        <TierCard
          name={TIER_NAME.authz}
          nodes={az.issNodes + az.verNodes + az.sotNodes}
          cost={money(az.cost)}
          util={az.util}
          accent={TIER_ACCENT.authz}
          bottleneck={now.bottleneck === "authz"}
          specs={[
            { label: "iss", value: az.issNodes },
            { label: "ver", value: az.verNodes },
            { label: "sot", value: az.sotNodes },
          ]}
        >
          <p className="tiergrid__delta">staleness ~{az.staleness}s</p>
        </TierCard>
      )}
    </div>
  );
}
