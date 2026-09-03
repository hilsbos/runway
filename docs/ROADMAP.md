# ROADMAP

Phased build plan for **Runway**. Do them in order, one at a time, stopping at each boundary to report. Each phase lists scope, acceptance, and explicit out-of-scope. Pragmatism over elegance — build the smallest thing that meets the criteria.

This is a **redesign, not a port**. The hard, gating work is up front: getting the redesigned model spec right (Phase 1) before any engine code.

> **Status: all phases delivered (0–6).** The unified engine, growth simulation, template→tune→trajectory UI, comparison mode, and persist/export/share are built and green: `npm run typecheck`, `npm run test` (68 tests), and `npm run build` all pass; deploy configs ship for Vercel, Netlify, and GitHub Pages. Checkboxes below mark each phase's acceptance criteria as met.

---

## Phase 0 — Scaffold ✅ DONE

**Scope:** Vite + React + TypeScript (strict). Vitest. Scripts: `dev`, `build`, `test`, `typecheck`. Minimal ESLint + Prettier. Create the `src/model/` and `src/ui/` skeleton and `src/ui/theme.css` with the design tokens from the spec. Add `src/model/format.ts` (K/M/B, money, duration).

**Acceptance:** `npm run dev` serves a blank shell; `npm run typecheck` and `npm run test` pass (zero tests is fine); theme tokens load.

**Out of scope:** any model logic, any real UI.

---

## Phase 1 — Redesign the model spec (GATE) ✅ DONE

**Scope:** This is design work, not code. Rewrite the body of `docs/MODEL-SPEC.md` for the new goal:
- **Unified stack model** — components (load balancer, API tier, cache, datastore, **authorization**) composed into one request-serving architecture. Define each component's capacity, latency, and cost model, and how they compose into stack-level p50/p99, bottleneck, and total cost.
- **Authorization as a component** — fold the old authz-backbone math (issuance / edge-verify / source-of-truth, TTL ↔ revocation ↔ cost) into the stack as the authz component, not a separate engine.
- **Growth over time** — define the growth-curve inputs (e.g. starting load, growth rate, horizon) and how the snapshot model is swept across the timeline to produce cost/latency/util trajectories and *dated* bottleneck events ("Postgres write ceiling at month 14").
- **Multi-cloud** — per-provider (AWS/GCP/Azure, optionally on-prem) price tables and instance baselines; provider as a model input; price deltas surfaced.
- **Comparison** — define the candidate-design diff: what outputs are compared and how deltas are expressed.
- Draw constants from the **trusted source data appendix** in `MODEL-SPEC.md`; extend with new sources as needed (cited). Author fresh **golden-value tests** for the redesigned model.

**Acceptance:** `docs/MODEL-SPEC.md` body fully describes the unified + growth + multi-cloud model with exact constants, formulas in order, and golden fixtures — reviewed and **approved by the user**. **Stop here for sign-off before any engine code.**

**Out of scope:** all code.

> Why this gate matters: the model is the IP and this is a redesign. A wrong model shape costs far more than a wrong UI. Lock it in writing first.

---

## Phase 2 — Engine: snapshot model ✅ DONE

**Scope:** Implement the pure model exactly per the redesigned spec: `constants.ts` (annotated + multi-cloud price tables), per-component models, `stack.ts` (compose → size one snapshot), `types.ts`, `index.ts`. Vitest covering every golden snapshot scenario plus edge cases (component bottlenecks, capacity ceilings, cache on/off, authz cached/uncached divergence, per-provider price deltas).

**Acceptance:** all snapshot golden tests green (exact node counts + status, ±2% money); `compute()` deterministic and side-effect-free; public API documented in `index.ts`. **Stop and show test output + API surface.**

**Out of scope:** the time dimension, all UI.

---

## Phase 3 — Engine: growth simulation ✅ DONE

**Scope:** `growth.ts` — sweep the snapshot model across a growth curve over the horizon. Produce time-series for cost, p50/p99, per-tier utilization, and a list of **dated bottleneck/scaling events** with the runway each design buys.

**Acceptance:** golden tests for trajectories and event detection (e.g. a known design crosses the Postgres write ceiling at the expected month); pure and deterministic.

**Out of scope:** all UI.

---

## Phase 4 — UI: template → tune → trajectory ✅ DONE

**Scope:** The core single-design experience. Shared components (sliders, segmented toggles, stat/tier cards with util bars, time-series chart). Flow: **pick a template** (preset reference architectures) → **tune** (tech, sizing, traffic mix, growth curve, cloud provider) → **results**: cost-over-time and latency-over-time charts, current-vs-future tier cards, dated bottleneck banner, and an **Assumptions & Sources** panel generated from constant metadata (editing a value re-runs the model live).

**Acceptance:** templates load; editing any input/assumption updates the trajectory; charts render; the dated bottleneck surfaces; mobile-narrow layout doesn't break.

**Out of scope:** comparison mode, persistence/export.

---

## Phase 5 — Comparison mode ✅ DONE

**Scope:** Put 2–3 candidate designs side by side over the same growth horizon. Diff key outputs (cost trajectory, latency, when-it-breaks, runway, per-cloud cost). Make the "which one and why" verdict legible at a glance.

**Acceptance:** comparison highlights deltas across the horizon; clear which design wins on each axis; switching candidates preserves each one's tuned state.

**Out of scope:** export/share.

---

## Phase 6 — Persist, export, share ✅ DONE

**Scope:** Name and save scenarios (full input set + growth curve) to `localStorage`; list/load/delete; JSON export that round-trips; one-page printable summary; shareable URL via encoded query string (no backend).

**Acceptance:** reload preserves saved scenarios; JSON export round-trips back into the app; printable summary captures the decision.

**Out of scope:** anything requiring a server.

---

## Standing guardrails

- No backend, auth service, database, or CI/CD unless asked. Single-page planning tool.
- Don't change a constant or formula to make a test pass. If reality moved (new prices/benchmarks), raise it with the source; updates are deliberate.
- Keep the model importable in plain Node — `import { ... } from './model'` must work with no bundler.
- Authorization is one component of the unified model — don't spin it back out into a separate engine.
- When in doubt, resolve toward `VISION.md`.
