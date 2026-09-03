# VISION

The north star for **Runway**. If a decision about scope, model, or UI is unclear, it should be resolved in favor of this document.

## The decision we support

A staff engineer or technical decision-maker is choosing **which stack and technology changes to make** — and needs to know how each option will **perform and cost as their system grows over the next months and years**, not just today.

> "We're at 40K RPS on Postgres. If we grow 60%/year, when does the write path break, what does it cost to stay ahead, and is moving the hot path to Cassandra + Redis worth it — on AWS vs GCP?"

Runway turns that question into a simulation they can run, tune, and defend.

## Who uses it

- **Staff / principal engineers** — want the model to be *rigorous and inspectable*. Every number traceable to a source or an editable assumption. No black boxes.
- **Decision-makers (eng leadership, architects)** — want the answer to be *legible*: cost trajectory, where it breaks, how options compare, and what it buys. A chart and a verdict, not a spreadsheet.

The same tool has to serve both: defensible underneath, clear on top.

## What the tool is

**One unified stack planner and growth simulator.** Not a collection of separate calculators — a single model of a request-serving architecture (load balancing → API → caching → datastore, **with authorization as a first-class component of that stack, not a separate app**).

The core loop:

1. **Start from a template** — pick a reference architecture close to your situation.
2. **Tune it** — edit tech choices, sizing, traffic mix, and any assumption.
3. **Project growth** — define how load grows over time (RPS / users / data over months–years).
4. **Read the trajectory** — cost over time, latency, and *when and where* the design hits a wall, with how much runway it buys.
5. **Compare** — put 2–3 candidate designs side by side and see the deltas.

## What "good" looks like

- The headline output is a **trajectory, not a snapshot** — you see the future unfold, and bottlenecks surface *with a date attached*.
- A decision-maker can look at two designs and say, in under a minute, **which one and why**.
- An engineer can open the assumptions, change any constant, and watch every number re-derive — and trust it because the sources are right there.
- It is **multi-cloud aware**: AWS / GCP / Azure (and on-prem) price deltas are part of the recommendation, not an afterthought.
- It is genuinely **nice to use** — fast, clear, an instrument panel a senior engineer is happy to live in.

## Explicit non-goals

- Not a billing-accurate cloud cost calculator. Order-of-magnitude planning estimates, transparently sourced.
- Not a live observability / APM tool. It models *designs*, not running systems.
- Not a backend product. Single-page app, local persistence, no server.

## Principles that survive any rewrite

- **The model is the asset.** Numbers are traceable to sources or to editable assumptions — never invented, never silently changed.
- **The engine is pure and tested**, framework-free, runnable in plain Node. The UI is replaceable; the model is not.
- **Pragmatism over elegance.** Build the smallest thing that answers the decision well.
