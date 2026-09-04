# Decisions

One line per architectural choice, and why.

- **Next.js 15 App Router, server components for pages** — pages fetch through providers on the server and pass plain data down; only charts and buttons are client components, so the mock-to-real swap never touches a page.
- **Providers as the only data boundary** (`src/lib/providers/types.ts`) — the UI knows interfaces, not Prisma or venues; BloFin, FundedNext, Coinglass and CFTC each replace one class in `index.ts`.
- **Prisma 6, not 7** — Prisma 7 requires a driver adapter (`@prisma/adapter-pg` + `pg`) and a config file; 6.19 gives the same schema and client with no extra dependencies, which the brief asked us to avoid.
- **Postgres as the mock store, not JSON fixtures** — the seed exercises the real schema, the API writes to the same tables the UI reads, and the real integrations inherit working persistence.
- **Deterministic OHLCV from a seeded mean-reverting walk** — same symbol/timeframe always yields the same bars, so seeded annotations stay pinned to the swings they were drawn on; only the time axis is anchored to "now".
- **Candle generator shared by seed and provider fallback** — an unseeded database still renders a chart instead of a blank card.
- **lightweight-charts v5 with a separate volume pane** — panes are native in v5; the histogram sits below the candles instead of overlaying them.
- **Custom drawing renderers on `lightweight-charts-drawing`'s base classes** — the library's shipped fib and price-line renderers paint TradingView blue/orange/purple and hardcode two decimals; we keep its `Drawing`/`DrawingManager` plumbing and own the pixels, which is what keeps green and red reserved for money.
- **Annotation JSON as a validated contract** (`src/lib/annotations.ts`) — hand-written validator, no schema library; hex colours only, because these strings end up on a canvas.
- **Hand-rolled request validation instead of zod** — the brief lists the stack; nothing outside it was added for input checks.
- **Tailwind v4 `@theme` for design tokens** — tokens live in CSS once and become utilities (`bg-surface`, `text-up`); the chart theme mirrors them because canvas cannot read custom properties.
- **Green and red only on PnL, targets, invalidation and candles** — side, bias, plan status and event direction are words in grey pills, so colour always means money.
- **One hero number per screen, chosen for the decision it drives** — risk to stop, compliance %, funding, last price, proposals waiting, events hitting positions.
- **The journal's "Pattern" line is derived, not written** — mode of deviation reason, symbol and session over the off-plan trades, so it stays true as trades arrive.
- **Positions and trades carry `contractValue` from symbol metadata** — dollar risk and PnL are computed in the provider, once, the same way for lots and coins.
- **Proposal approval is a state machine** (PROPOSED → APPROVED → SENT → FILLED) — `APPROVED` and `SENT` are persisted before the venue is called, so a crash leaves an honest record rather than a phantom fill; fill, position, setup and terminal line commit in one transaction.
- **Plan checks block, they do not warn** — a failing check disables Approve and prints why; the gate is deterministic code and stays that way when a model starts writing proposals.
- **Execution injected into the agent** — `MockAgentProvider(execution)`; the venue changes without the decision path noticing.
- **Terminal lines matched to positions at read time** — an event stores symbols, not position ids, so a headline from this morning still names the exposure you have now.
- **Tab bar wraps instead of scrolling** — six tabs on a phone must all be visible; a hidden active tab is a bug.
- **`output: "standalone"` + three-stage Dockerfile** — the runtime image is the Next server and its traced files only; a `seeder` target keeps dev dependencies out of production while still letting `docker compose run seed` load data.
- **pino with `severity`/`message` keys** — Cloud Logging parses levels natively; no log shipper needed on Cloud Run.
- **Cloud Build → Artifact Registry → Cloud Run, secrets from Secret Manager** — one `gcloud builds submit`; `DATABASE_URL` never lives in the image or the repo.
- **Design reference rebuilt from the written spec** — `dayemon-dashboard.html` was not in the repository; tokens follow the brief exactly and the two extra greys (`#8e8e93`, `#636366`) were derived from the same family as the surface colour. Diff against the file when it lands.
