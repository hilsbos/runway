/**
 * Runway — dated scaling-event list ("month N — tier — message").
 */
import type { ScalingEvent } from "../../model/index.ts";
import { compact } from "../../model/index.ts";

const TIER_LABEL: Record<string, string> = {
  lb: "Load balancer",
  api: "API",
  cache: "Cache",
  datastore: "Datastore",
  authz: "Authorization",
};

export interface EventListProps {
  events: ScalingEvent[];
}

export function EventList({ events }: EventListProps) {
  if (events.length === 0) {
    return (
      <p className="events__empty">
        No scaling events in the horizon — the design stays healthy throughout.
      </p>
    );
  }
  return (
    <ul className="events">
      {events.map((e) => (
        <li
          key={`${e.month}-${e.tier}-${e.kind}`}
          className="events__row"
          data-kind={e.kind}
        >
          <span className="events__month">M{e.month}</span>
          <span className="events__dot" data-kind={e.kind} aria-hidden />
          <span className="events__body">
            <b>{TIER_LABEL[e.tier] ?? e.tier}</b>{" "}
            <span className="events__kind">
              {e.kind === "breaking" ? "breaks" : "running hot"}
            </span>{" "}
            at ~{compact(e.rps)} rps — {e.message}
            <em className="events__runway"> buys ~{e.runwayMonths} mo runway</em>
          </span>
        </li>
      ))}
    </ul>
  );
}
