import type { AnnotationItem, AnnotationSet } from "@/lib/annotations";
import type { OHLCV } from "@/lib/mock/candles";
import type { Symbol_, Timeframe } from "@/lib/symbols";

/**
 * Provider interfaces.
 *
 * Everything the UI renders comes through one of these. The mockup ships a
 * Prisma-backed Mock* implementation of each; a real integration (BloFin,
 * FundedNext, Coinglass, CFTC) implements the same interface and gets swapped in
 * `src/lib/providers/index.ts`. No page imports Prisma, and no page knows where
 * its numbers came from.
 */

export type Side = "LONG" | "SHORT";
export type Bias = "LONG" | "SHORT" | "NEUTRAL";

export type AccountView = {
  id: string;
  name: string;
  broker: string;
  kind: "PROP" | "LIVE";
  currency: string;
  equity: number;
};

export type PositionView = {
  id: string;
  symbol: Symbol_;
  side: Side;
  size: number;
  account: string;
  accountId: string;
  entry: number;
  mark: number;
  stop: number;
  target: number | null;
  /** Dollars per 1.0 price move per unit of size. */
  contractValue: number;
  /** Marked-to-market, in account currency. */
  unrealisedPnl: number;
  /** What comes off the book if the stop trades from here. Always negative-signed as a cost. */
  riskToStop: number;
  openedAt: string;
};

export type PlanLevel = {
  label: string;
  price: number;
  kind: "entry" | "target" | "invalidation" | "reference";
};

export type PlanView = {
  id: string;
  symbol: Symbol_;
  weekOf: string;
  bias: Bias;
  levels: PlanLevel[];
  invalidation: number;
  maxSize: number;
  note: string;
};

export interface PositionsProvider {
  listAccounts(): Promise<AccountView[]>;
  listPositions(): Promise<PositionView[]>;
  /** The written plan each open position is being held against. */
  listPlans(): Promise<PlanView[]>;
}

export interface MarketDataProvider {
  getCandles(symbol: Symbol_, tf: Timeframe): Promise<OHLCV[]>;
  getMark(symbol: Symbol_): Promise<number>;
}

export type TradeContext = {
  funding: number | null;
  openInterest: number | null;
  session: string;
  note: string;
};

export type TradeView = {
  id: string;
  symbol: Symbol_;
  side: Side;
  size: number;
  account: string;
  entry: number;
  exit: number;
  pnl: number;
  rMultiple: number;
  inPlan: boolean;
  deviation: string | null;
  context: TradeContext;
  openedAt: string;
  closedAt: string;
};

export type ComplianceView = {
  /** e.g. "September 2026" */
  monthLabel: string;
  total: number;
  inPlan: number;
  /** 0–100, rounded. */
  pct: number;
  pnlInPlan: number;
  pnlOffPlan: number;
  /** One line summarising what the off-plan trades have in common. */
  pattern: string;
};

export interface JournalProvider {
  listTrades(opts?: { month?: Date; limit?: number }): Promise<TradeView[]>;
  getCompliance(month?: Date): Promise<ComplianceView>;
}

export type MetricPoint = {
  time: number;
  value: number;
};

export type LiquidationCluster = {
  price: number;
  notional: number;
  side: Side;
};

/** Perp positioning — XRPUSDT. */
export type PerpPositioning = {
  kind: "perp";
  symbol: Symbol_;
  time: string;
  funding: number;
  fundingSeries: MetricPoint[];
  openInterest: number;
  openInterestChange24h: number;
  openInterestSeries: MetricPoint[];
  longLiquidations24h: number;
  shortLiquidations24h: number;
  nearestCluster: LiquidationCluster;
  priceSeries: MetricPoint[];
};

/** COT + macro positioning — XAGUSD. */
export type MetalPositioning = {
  kind: "metal";
  symbol: Symbol_;
  time: string;
  managedMoneyNet: number;
  managedMoneyChange: number;
  commercialsNet: number;
  commercialsChange: number;
  realYield10y: number;
  realYieldChange: number;
  dxy: number;
  dxyChange: number;
  managedMoneySeries: MetricPoint[];
  realYieldSeries: MetricPoint[];
  dxySeries: MetricPoint[];
  priceSeries: MetricPoint[];
};

export type PositioningView = PerpPositioning | MetalPositioning;

export interface PositioningProvider {
  getPerp(symbol: Symbol_): Promise<PerpPositioning>;
  getMetal(symbol: Symbol_): Promise<MetalPositioning>;
}

export interface AnnotationProvider {
  list(symbol: Symbol_, tf: Timeframe): Promise<AnnotationSet[]>;
  create(input: {
    symbol: Symbol_;
    tf: Timeframe;
    items: AnnotationItem[];
    note?: string | null;
  }): Promise<AnnotationSet>;
}

export type Providers = {
  positions: PositionsProvider;
  marketData: MarketDataProvider;
  positioning: PositioningProvider;
  journal: JournalProvider;
  annotations: AnnotationProvider;
  strategies: StrategyProvider;
  agent: AgentProvider;
  execution: ExecutionProvider;
  terminal: TerminalProvider;
};

/* -------------------------------------------------------------------------- */
/* Strategy, setups, agent, execution, terminal                                 */
/* -------------------------------------------------------------------------- */

export type StrategyStatus = "ACTIVE" | "PAUSED" | "RETIRED";

export type StrategyRules = {
  entry: string[];
  invalidation: string;
  sizing: { riskPct: number; maxSize: number };
  sessions: string[];
};

export type StrategyStats = {
  trades: number;
  winRate: number;
  expectancyR: number;
  pnl30d: number;
  avgHoldHours: number;
};

export type StrategyView = {
  id: string;
  slug: string;
  name: string;
  symbol: Symbol_;
  tf: Timeframe;
  bias: Bias;
  status: StrategyStatus;
  thesis: string;
  rules: StrategyRules;
  stats: StrategyStats;
  readySetups: number;
  openProposals: number;
};

export type SetupState = "WATCHING" | "READY" | "TRIGGERED" | "EXPIRED";

export type SetupCondition = { label: string; met: boolean; value: string };

export type SetupView = {
  id: string;
  strategyId: string;
  symbol: Symbol_;
  tf: Timeframe;
  state: SetupState;
  score: number;
  trigger: string;
  conditions: SetupCondition[];
  entry: number;
  stop: number;
  target: number;
  detectedAt: string;
  expiresAt: string;
};

export type ProposalState =
  | "PROPOSED"
  | "APPROVED"
  | "SENT"
  | "FILLED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export type ProposalCheck = { label: string; pass: boolean; detail: string };

export type ProposalView = {
  id: string;
  strategyId: string;
  strategySlug: string;
  strategyName: string;
  setupId: string | null;
  account: string;
  accountId: string;
  symbol: Symbol_;
  side: Side;
  size: number;
  entry: number;
  stop: number;
  target: number;
  riskUsd: number;
  rr: number;
  rationale: string;
  checks: ProposalCheck[];
  /** True when any check fails — approval is refused, not just discouraged. */
  blocked: boolean;
  state: ProposalState;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  fillPrice: number | null;
  venueOrderId: string | null;
  rejectReason: string | null;
};

export interface StrategyProvider {
  list(): Promise<StrategyView[]>;
  get(slug: string): Promise<StrategyView | null>;
  setups(strategyId: string): Promise<SetupView[]>;
}

export type Decision = "APPROVE" | "REJECT";

/**
 * The strategy agent. Today it is the scanner's proposals coming out of
 * Postgres; later it is a model reasoning over the same providers this UI
 * reads. Either way the human clicks, and the state machine is the same.
 */
export interface AgentProvider {
  proposals(opts?: { strategyId?: string; states?: ProposalState[] }): Promise<ProposalView[]>;
  get(id: string): Promise<ProposalView | null>;
  /** APPROVE runs PROPOSED → APPROVED → SENT → FILLED via the ExecutionProvider. */
  decide(id: string, decision: Decision, reason?: string): Promise<ProposalView>;
}

export type Fill = { venueOrderId: string; fillPrice: number; filledAt: string };

/** Sends the order. Mock fills instantly; BloFin and FundedNext replace it. */
export interface ExecutionProvider {
  execute(proposal: ProposalView): Promise<Fill>;
}

export type TerminalKind = "NEWS" | "DATA" | "FLOW" | "SYSTEM" | "AGENT";
export type Impact = "HIGH" | "MEDIUM" | "LOW";
export type Direction = "BULLISH" | "BEARISH" | "NEUTRAL";

export type TerminalEventView = {
  id: string;
  time: string;
  source: string;
  kind: TerminalKind;
  headline: string;
  body: string | null;
  symbols: Symbol_[];
  impact: Impact;
  direction: Direction;
  /** Open positions this touches, as short labels: "XAGUSD long 0.55 · FundedNext 200K". */
  touches: string[];
};

export interface TerminalProvider {
  feed(opts?: { sinceHours?: number }): Promise<TerminalEventView[]>;
}
