# runway

A stack capacity, cost, and **growth-over-time** simulator for deciding *which stack and technology changes to make* — and seeing how each option performs and costs as your system scales.

Built for **staff engineers and the leaders they share with**: rigorous enough to inspect every number, legible enough to pick a direction in a minute. See [`VISION.md`](./VISION.md) for the north star.

## What it does

Models one request-serving stack — **load balancer → API → cache → datastore** — and projects it forward:

1. **Start from a template** — a reference architecture close to your situation.
2. **Tune it** — provider, traffic mix, language/protocol, datastore, cache, node spec, pricing.
3. **Project growth** — starting load, growth model + rate, horizon.
4. **Read the trajectory** — cost / latency / per-tier utilization over time, a **dated scaling wall** (with how much runway it buys), and a plain-English **verdict**.
5. **Compare** — 2–3 candidate designs over one horizon, with a head-to-head delta table and a recommendation.

It is **multi-cloud aware** — AWS / GCP / Azure / on-prem, with per-cloud cost deltas. AWS defaults are verified against public sources; the other providers are sourced, **editable** estimates.

### Highlights
- **Request-path diagram** — a live SVG of the configured stack (CLIENT → LB → API → cache/datastore) with per-tier nodes, utilization, cost, per-hop latency, `×N → ×M` growth, and bottleneck/over-capacity highlighting. Click a tier to focus it across the page.
- **Design** and **Compare** modes.
- **Save / load / delete** named scenarios (localStorage), **shareable `?s=` URLs**, **JSON export/import** (lossless round-trip), and a **printable one-page summary**.
- First load is populated (sensible default + two seeded example scenarios) — never an empty screen.

## Why the model is separate from the UI

The numbers are the point. Capacity/cost/latency constants are traceable to public sources (cloud pricing, TechEmpower, vendor benchmarks, YCSB) or to assumptions you can edit at runtime. They live in a pure, framework-free, unit-tested engine in `src/model/`, so the UI can change without putting the model at risk. Every constant carries `{ value, unit, source }`, and the in-app **Assumptions & Sources** panel is generated from that metadata. **Constants are never invented or silently changed** — see [`docs/MODEL-SPEC.md`](./docs/MODEL-SPEC.md) for the formulas and the golden fixtures the engine is tested against.

> Note: an earlier version also modeled an authorization tier. That has been **removed from the simulation**; some older prose in `VISION.md` / `docs/MODEL-SPEC.md` still references it.

## Status

Built and green: `npm run typecheck`, `npm run test` (145 golden + edge tests), `npm run lint`, and `npm run build` all pass. Deploy configs ship for static hosting (S3 / any), Vercel, Netlify, and GitHub Pages.

## Run / build

```bash
npm install
npm run dev        # http://localhost:5173 (hot reload)

npm run typecheck  # tsc --noEmit
npm run test       # vitest run — pure-engine golden + edge tests
npm run lint       # eslint
npm run build      # production build into dist/  (Vite, base "./")
npm run preview    # serve the production build at http://localhost:4173
```

The output in `dist/` is a **self-contained static SPA** (relative `base: "./"`), so it works from any host or sub-path with no rewrite rules — state lives in the query string, not the path.

## Deploy

Pick a host. The build is just static files in `dist/`.

| Host | Config in repo | Deploy |
|---|---|---|
| **S3 (static website)** | — | `aws s3 sync dist/ s3://YOUR_BUCKET/PREFIX/ --delete` (see below) |
| **Vercel** | `vercel.json` | `vercel --prod` |
| **Netlify** | `netlify.toml` | `netlify deploy --prod` |
| **GitHub Pages** | `.github/workflows/deploy.yml` | `git push origin main` (CI typechecks, tests, builds, publishes) |

**S3** — long-cache the hashed assets, never-cache the HTML so redeploys show up immediately:

```bash
npm run build
aws s3 sync dist/ s3://YOUR_BUCKET/PREFIX/ --delete \
  --cache-control "public,max-age=31536000,immutable" --exclude index.html
aws s3 cp dist/index.html s3://YOUR_BUCKET/PREFIX/index.html --cache-control "no-cache"
# bucket needs static website hosting (index document index.html) + public read,
# or front it with CloudFront. If using a CDN, invalidate /PREFIX/index.html.
```

## Share & export

All app state — mode, single-design inputs, both compare slots, the growth curve, provider, and any edited constants — is JSON-encoded + base64url-packed into the `?s=` query string:

- **Share link** copies a `…/?s=<token>` URL; opening it restores the exact scenario, charts, and verdict — no backend, no account.
- **Export JSON** / **Import** use the same codec, so they round-trip losslessly.
- **Save / Load / Delete** persist named scenarios in `localStorage` (two examples seeded on first visit).
- **Print** renders a clean one-page summary (verdict, key stats, cost trajectory, stack today, assumptions).

## Layout

```
.
├── VISION.md            # the north star
├── CLAUDE.md            # operating manual for working in this repo
├── docs/
│   └── MODEL-SPEC.md    # formulas, constants, golden fixtures (model authority)
├── vercel.json · netlify.toml · .github/workflows/deploy.yml
└── src/
    ├── model/           # pure, framework-free engine
    │   ├── stack.ts growth.ts compare.ts verdict.ts constants.ts presets.ts …
    │   ├── components/  # lb · api · cache · datastore (· authz, dormant)
    │   └── __tests__/   # golden-value + edge-case Vitest suites
    ├── ui/
    │   ├── theme.css    # design tokens
    │   ├── components/  # shared primitives
    │   ├── charts/      # Recharts time-series + chart theme
    │   └── app/         # views, StackDiagram (SVG), persistence/share
    └── App.tsx          # shell: tabs, scenario toolbar, URL sync, print summary
```

## Where to start

1. [`VISION.md`](./VISION.md) → [`CLAUDE.md`](./CLAUDE.md) → [`docs/MODEL-SPEC.md`](./docs/MODEL-SPEC.md).
2. The engine entry points are in [`src/model/index.ts`](./src/model/index.ts): `computeStack`, `simulateGrowth`, `compareDesigns`, `generateVerdict`, `TEMPLATES`, `perCloudDeltas`. Every constant lives in [`src/model/constants.ts`](./src/model/constants.ts) with its source and editable range.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. Read [`CLAUDE.md`](./CLAUDE.md) — it is the operating manual for this repo (model purity, golden tests, conventions).
2. Make sure `npm run typecheck`, `npm run test`, `npm run lint`, and `npm run build` are all green.
3. If you change a constant, cite the source in `src/model/constants.ts`. If you change a formula, update `docs/MODEL-SPEC.md` and the golden fixtures together and say so in the PR.
4. For UI changes, check the result in `npm run preview` — several real bugs here have been render-only.

## License

[MIT](./LICENSE)
