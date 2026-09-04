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
};
