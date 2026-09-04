export const SYMBOLS = ["XAGUSD", "XAUUSD", "XRPUSDT"] as const;
export type Symbol_ = (typeof SYMBOLS)[number];

export const TIMEFRAMES = ["1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TF_SECONDS: Record<Timeframe, number> = {
  "1h": 3600,
  "4h": 4 * 3600,
  "1d": 24 * 3600,
};

export type SymbolMeta = {
  symbol: Symbol_;
  /** What the desk calls it out loud. */
  label: string;
  /** Where it actually trades. */
  venue: string;
  precision: number;
  /** Starting price for the mock walk, and the band it is pulled back toward. */
  anchor: number;
  band: [number, number];
  /** Per-bar volatility as a fraction of price, before timeframe scaling. */
  vol: number;
  /** Typical bar volume, in the symbol's own units. */
  volume: number;
  /** What one unit of position size is called on the ticket. */
  unit: string;
  /** Dollars per 1.00 price move, per unit of size. */
  contractValue: number;
};

export const SYMBOL_META: Record<Symbol_, SymbolMeta> = {
  XAGUSD: {
    symbol: "XAGUSD",
    label: "Silver",
    venue: "FundedNext",
    precision: 3,
    anchor: 41.4,
    band: [40, 43],
    vol: 0.006,
    volume: 4200,
    unit: "lots",
    contractValue: 5000,
  },
  XAUUSD: {
    symbol: "XAUUSD",
    label: "Gold",
    venue: "FundedNext",
    precision: 2,
    anchor: 3572,
    band: [3500, 3650],
    vol: 0.0035,
    volume: 9800,
    unit: "lots",
    contractValue: 100,
  },
  XRPUSDT: {
    symbol: "XRPUSDT",
    label: "XRP perp",
    venue: "BloFin",
    precision: 4,
    anchor: 3.38,
    band: [3.2, 3.6],
    vol: 0.009,
    volume: 2_400_000,
    unit: "XRP",
    contractValue: 1,
  },
};

export function isSymbol(value: string): value is Symbol_ {
  return (SYMBOLS as readonly string[]).includes(value);
}

export function isTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value);
}

export function metaFor(symbol: string): SymbolMeta | null {
  return isSymbol(symbol) ? SYMBOL_META[symbol] : null;
}
