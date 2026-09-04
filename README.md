# DAYEMON

Internal trading-operations dashboard for a two-person desk (research + execution) trading gold, silver (XAGUSD) and crypto perps (XRPUSDT).

This is the **high-fidelity mockup phase**: the full UI on mock data, with real, interactive charts and a working one-click execution path against a mock venue. No live integrations yet — every data source sits behind a provider interface so they can be wired in without touching the UI.

Six panels, one big number each:

| Panel | Hero | What's on it |
| --- | --- | --- |
| `/positions` | Dollar risk to stop, all accounts | Open positions with side, size, account, entry/stop, unrealised PnL, risk; this week's plan per symbol |
| `/journal` | Plan compliance % for the month | Trades with in-plan / off-plan, result, context snapshot (funding, OI, session); a derived "Pattern" line |
| `/positioning` | XRP perp funding | XRP funding / OI / liquidations / nearest cluster; silver COT, 10y real yield, DXY; sparklines and series charts |
| `/chart` | Last price | lightweight-charts candles + volume, symbol and timeframe switchers, JSON-driven annotation layer |
| `/strategy` | Proposals awaiting approval | Every strategy → a control dashboard: the agent's proposals (one-click approve), scanner setups, rules, history |
| `/terminal` | Events hitting open positions | News, data, flow, venue and agent lines, matched to the positions they touch |

## Run locally

Prerequisites: Node 22, Docker (for Postgres) or a local Postgres 16.

```bash
cp .env.example .env               # DATABASE_URL points at the compose db below
docker compose up -d db            # Postgres 16 on localhost:5432
npm install                        # also runs `prisma generate`
npm run db:reset                   # prisma db push + seed (safe to re-run any time)
npm run dev                        # http://localhost:3000
```

Useful scripts:

| Script | Does |
| --- | --- |
| `npm run db:seed` | Re-seed mock data (wipes and reloads everything the seed owns) |
| `npm run db:reset` | Drop-and-recreate schema, then seed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals + typescript) |
| `npm run build` | `prisma generate` + `next build` (standalone output) |

The seed is deterministic in price and anchored to "now" in time, so a fresh seed always looks current and every seeded annotation still lines up with the candles it was drawn on.

## Run in Docker

The Dockerfile has three targets: `runner` (the app, standalone Next server on :8080), `seeder` (dev deps + sources, runs `prisma db push` and the seed), and the intermediate `builder`.

```bash
docker compose up -d db
docker compose run --rm seed       # push schema + load mock data
docker compose up app              # http://localhost:3000 → container :8080
```

Or build and run the image alone against any Postgres:

```bash
docker build --target runner -t dayemon .
docker run --rm -p 8080:8080 -e DATABASE_URL="postgresql://…" dayemon
```

## Deploy to Cloud Run

`cloudbuild.yaml` builds the `runner` image, pushes it to Artifact Registry and deploys it to Cloud Run with `DATABASE_URL` read from Secret Manager.

One-time setup:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create dayemon --repository-format=docker --location=europe-west1
printf '%s' 'postgresql://user:pass@host/dayemon' | gcloud secrets create dayemon-database-url --data-file=-
# Grant the Cloud Run service account roles/secretmanager.secretAccessor on that secret.
```

Then, per deploy:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=europe-west1,_REPO=dayemon,_SERVICE=dayemon
```

Set `_CLOUDSQL_INSTANCE=project:region:instance` to attach a Cloud SQL Postgres over the Unix socket; otherwise point `DATABASE_URL` at any reachable Postgres. Run the schema push and seed from your machine (or a one-off Cloud Run job built from the `seeder` target) — the runtime image deliberately does not carry dev dependencies.

Logs are pino JSON with `severity` and `message` fields, so Cloud Logging parses levels natively. `LOG_LEVEL` controls verbosity.

## Architecture

```
src/
  app/                  Next.js 15 App Router — pages are thin: fetch via providers, render
    api/annotations     GET/POST annotation sets per symbol/timeframe
    api/candles         GET OHLCV per symbol/timeframe
    api/proposals/[id]/decide   POST { decision: APPROVE | REJECT } — the one-click path
  components/           UI primitives (Card, Hero, Pill, Stat…), chart, strategy, terminal
  lib/
    providers/types.ts  the provider interfaces — the only contract the UI knows
    providers/mock/*    Prisma-backed Mock* implementations
    providers/index.ts  the single wiring point
    annotations.ts      the annotation JSON contract + validator
    mock/candles.ts     deterministic OHLCV generator (shared by seed and fallback)
    symbols.ts          symbol metadata: precision, band, unit, contract value
prisma/
  schema.prisma         Account, Position, Trade, Plan, Candle, Annotation,
                        PositioningSnapshot, Strategy, Setup, Proposal, TerminalEvent
  seed.ts               all mock data
```

Rules the code follows:

- **UI only talks to providers.** No page or component imports Prisma. Every number on screen came through an interface in `src/lib/providers/types.ts`.
- **Green and red mean money.** `#19c37d` / `#ff5c5c` appear only on PnL, targets, invalidation and candles. Side, bias, status and direction are words in grey pills.
- **The annotation JSON is the contract.** The API validates it, the database stores it, the seed writes it, and `src/components/chart/annotationRenderer.ts` is the only code that turns it into pixels.

### The agent and the one-click path

A `Strategy` carries written rules. The scanner (mock: seeded) produces `Setup`s with a confluence score and a condition checklist. When a setup is ready and every plan check passes, the agent (mock: seeded) writes a `Proposal`: a complete ticket plus a rationale plus the checks it ran.

Approving is a state machine, not a flag:

```
PROPOSED ──approve──▶ APPROVED ──▶ SENT ──▶ FILLED   (position opened, setup TRIGGERED, terminal line written)
    │
    ├──reject──▶ REJECTED (reason recorded)
    └──ttl────▶ EXPIRED
```

- Any failing check **blocks** approval (the button is disabled and the card says why). The gate is the plan, not a warning.
- `APPROVED` and `SENT` are written before the venue is touched, so a crash mid-way leaves an honest record rather than a phantom fill.
- The fill, the new `Position`, the setup update and the terminal event land in one transaction.
- A second click on anything not in `PROPOSED` is a 409.

## Wiring guide

Each mock is one class. The real integration implements the same interface and replaces one line in `src/lib/providers/index.ts`. Nothing above the provider changes.

| Provider | Interface | Mock today | Real source | Notes |
| --- | --- | --- | --- | --- |
| `positions` | `PositionsProvider` | `Position`, `Account`, `Plan` tables | **BloFin** `GET /api/v1/account/positions` + `GET /api/v1/account/balance` for perps; **FundedNext** account/positions API for the prop accounts | Map venue rows to `PositionView`; `contractValue` comes from `SYMBOL_META`. Plans stay in Postgres — they are written by the desk, not fetched. |
| `marketData` | `MarketDataProvider` | `Candle` table, generator fallback | **BloFin** `GET /api/v1/market/candles` for XRPUSDT; the metals broker's OHLC feed (or FundedNext's platform data) for XAGUSD/XAUUSD | Return unix-second `OHLCV`. Cache the last 300 bars per symbol/timeframe; the chart reads through `/api/candles`. |
| `positioning` | `PositioningProvider` | `PositioningSnapshot` table | **Coinglass** funding, open interest, liquidation and liquidation-map endpoints for perps; **CFTC** COT (disaggregated futures-only, silver) plus a macro source for the 10y TIPS yield and DXY | Keep writing snapshots into the table on a schedule and leave the read side alone — the series charts and the journal's context snapshots both read from it. |
| `journal` | `JournalProvider` | `Trade` table | Venue fills (BloFin `GET /api/v1/trade/fills-history`, FundedNext trade history) reconciled into `Trade` rows | `contextSnapshot` should be captured at entry from `positioning`; `inPlan` / `deviation` are the desk's judgement and stay editable. |
| `annotations` | `AnnotationProvider` | `Annotation` table | Postgres is already the real store | Later: a drawing tool in the chart posts to the same `POST /api/annotations`. |
| `strategies` | `StrategyProvider` | `Strategy`, `Setup` tables | Strategies stay in Postgres (they are the desk's playbook). Setups come from a **scanner** job that evaluates each strategy's conditions against `marketData` + `positioning` and upserts `Setup` rows | The condition checklist shape (`{ label, met, value }`) is what the scanner emits. |
| `agent` | `AgentProvider` | `Proposal` table + `decide()` state machine | A model (Claude) reasoning over the same providers, emitting `Proposal` rows with a rationale and the checks it ran. The **`decide()` path stays exactly as it is** — a human clicks, the state machine runs | Keep the plan-compliance gate deterministic code, never model output. The model proposes; the rules decide whether the button is enabled. |
| `execution` | `ExecutionProvider` | Instant mock fill, one tick of slippage | **BloFin** `POST /api/v1/trade/order` (+ fill polling / websocket) for perps; **FundedNext**'s trading API (or its MT5 bridge) for metals | Return a `Fill`. Handle partials and rejects by extending `ProposalState` before extending the UI. |
| `terminal` | `TerminalProvider` | `TerminalEvent` table | Ingestion jobs writing into the table: news (Reuters/Bloomberg feed or a headline API), Coinglass flow alerts, CFTC releases, venue status webhooks, and the agent's own actions (already written by `decide()`) | Tag every line with `symbols`; the provider matches lines to open positions at read time so nothing goes stale. |

Secrets for the real integrations go in `.env` (see `.env.example`); in Cloud Run they come from Secret Manager via `cloudbuild.yaml`.

## Design tokens

Near-black canvas `#0d0d0d`, dark grey surface `#1c1c1e`, raised `#2c2c2e`, white text, muted `#8e8e93`, faint `#636366`, green `#19c37d`, red `#ff5c5c`. System sans-serif, tabular numbers, 16px radius, no borders, no shadows, no gradients, no tables. Mobile-first, max-width 680px. Defined once in `src/app/globals.css` (Tailwind `@theme`) and mirrored for canvas in `src/components/chart/theme.ts`.
