# CLAUDE.md

Operating manual for **runway** — a stack capacity / cost / growth simulator. Read this before changing code. The north star is [`VISION.md`](./VISION.md); the authoritative model is [`docs/MODEL-SPEC.md`](./docs/MODEL-SPEC.md).

## What this is
A single-page app that helps staff engineers and their leaders decide **which stack/technology changes to make**, by simulating how a request-serving stack (load balancer → API → cache → datastore) **performs and costs as load grows over months/years**, across AWS / GCP / Azure / on-prem. It is built and working — this is ongoing maintenance, not a greenfield build.

## Non-negotiables
- **The model is the asset.** Every number is either traceable to a cited source or exposed as an editable assumption. Never invent, mis-derive, round away, or silently change a constant. If a value looks wrong or stale, surface it with the source — constant changes are deliberate.
- **The model is pure & framework-free.** Everything in `src/model/` is plain TypeScript with zero React/DOM imports, deterministic (no `Date.now()` in formula paths), runnable in plain Node. **UI imports the model, never the reverse.** The UI must not duplicate model formulas or import model *constants* — if the UI needs a derived value (e.g. per-hop latency), expose it from the model (see `latParts`).
- **Golden tests pin behavior.** `src/model/__tests__/` holds scenario→expected fixtures derived from `docs/MODEL-SPEC.md`. A golden failure is an engine bug to fix in code — not a fixture to weaken — unless the spec deliberately changed (then update spec + fixtures together and say so).
- **Pragmatism over elegance.** Smallest thing that does the job. No speculative abstraction or dependency you can't justify in one sentence.
- **Agents can't see pixels.** Visual/behavioral bugs slip past typecheck/test/build. After UI changes, verify in `npm run preview` (or ask the user to) — several real bugs here were render-only.

## Authorization is removed
The product no longer simulates authorization. Inputs are sanitized so `authz.enabled` is always `false`, and there are no authz controls/cards/charts. The engine code (`components/authz.ts`, `authz-standalone.ts`, the authz branch in `stack.ts`, the `authz` fields on result types) is **dormant/unreachable** kept only so the golden tests stay green. Don't surface authz in the UI or re-enable it without an explicit ask. (Older prose in `VISION.md` / `docs/MODEL-SPEC.md` still describes authz as a component — treat the code and this file as current.)

## Tech stack
- **Vite + React + TypeScript**, strict (incl. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`).
- **Vitest** for the model (near-100%); the UI isn't unit-tested.
- **Recharts** for time-series/comparison charts; **hand-rolled SVG** for the request-path diagram. No heavy dashboard framework.
- **Plain CSS** with CSS variables (dark "instrument-panel" aesthetic; tokens in `src/ui/theme.css`, mirrored as hex in `src/ui/charts/chartTheme.ts` because SVG presentation attrs don't read CSS vars reliably). No Tailwind.
- **React state + `localStorage`**; state also encodes into the `?s=` URL for sharing. No backend, no router.

## Repo layout
```
src/
  model/                  # pure engine (no React/DOM)
    constants.ts          # annotated constants + multi-cloud PRICE table (value/unit/source/editable)
    components/           # per-tier models: lb, api, cache, datastore, authz (authz dormant)
    stack.ts              # computeStack(inputs) -> snapshot (nodes/util/cost/p50/p99/latParts/bottleneck/status)
    growth.ts             # simulateGrowth(base, growth) -> month-by-month trajectory + dated scaling events
    compare.ts            # compareDesigns(...) -> per-design diff + winners
    verdict.ts            # generateVerdict / generateCompareVerdict (deterministic plain-English)
    presets.ts            # defaultInputs + TEMPLATES + perCloudDeltas
    format.ts, types.ts, index.ts   # formatters, types, public barrel
    __tests__/            # golden-value + edge-case suites
  ui/
    theme.css             # design tokens
    components/           # Slider, Segmented, Toggle, StatCard, TierCard, UtilBar, Banner, Field…
    charts/               # Recharts time-series + chartTheme (TOKENS, TIER_COLORS, healthColor…)
    app/                  # views: SingleDesignView, ComparisonView, StackDiagram (SVG), TunePanel,
                          #        AssumptionsPanel, ScenarioBar, results, chartmap, share, app.css
  App.tsx, main.tsx       # shell: Design|Compare tabs, scenario toolbar, URL sync, print summary
docs/MODEL-SPEC.md        # formulas, constants, golden fixtures (model authority)
vercel.json · netlify.toml · .github/workflows/deploy.yml   # deploy configs (base "./")
```

## Conventions & gotchas
- Constants carry `{ value, unit, source, editable?: [min,max] }`; the in-app **Assumptions & Sources panel is generated** from `listConstants()`, never hand-written. Multi-cloud pricing is editable per-provider tables; provider is a model input.
- Units explicit in names: `rps`, `opsPerSec`, `MB`, `usdPerMonth`, `ms`, `seconds`; growth is an integer `month` axis (0 = today).
- Keep all number formatting in `src/model/format.ts`.
- `exactOptionalPropertyTypes` is on → pass optional props as `value ?? undefined` (don't pass an implicitly-`undefined` value); follow the `refLabelProps` omit-vs-undefined pattern.
- Invariant to preserve: `latParts.{lb+verify+api+cacheHit+db} === p50`.
- Two documented model deviations live in `src/model/stack.ts` (`RUNNING_HOT_UTIL = 0.95`) and `verdict.ts` (runway-tie handling); both have comments + regression tests — don't "fix" them blindly.

## Commands
- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — Vitest (run once)
- `npm run lint` — ESLint
- `npm run build` — production build → `dist/`
- `npm run preview` — serve the production build (http://localhost:4173)

## Definition of done
`npm run typecheck`, `npm run test`, `npm run lint`, and `npm run build` all green (goldens included), and — for UI changes — eyeballed in `preview`. Then report what changed and the test/build status plainly.
