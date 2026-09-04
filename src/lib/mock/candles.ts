import { makeGaussian, makeRng } from "@/lib/mock/rng";
import {
  SYMBOL_META,
  TF_SECONDS,
  type Symbol_,
  type Timeframe,
} from "@/lib/symbols";

export type OHLCV = {
  /** Bar open time, unix seconds UTC. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const CANDLE_COUNT = 300;

/**
 * Floor a timestamp onto the timeframe grid so bar times are clean and every
 * consumer (chart, seed, annotations) lands on the same boundaries.
 */
export function floorToTf(unixSeconds: number, tf: Timeframe): number {
  const step = TF_SECONDS[tf];
  return Math.floor(unixSeconds / step) * step;
}

/**
 * Mean-reverting random walk inside the symbol's band.
 *
 * Deterministic in price: bar `i` for a given symbol/timeframe is always the
 * same number. Only the time axis moves, anchored to `endTime` so a freshly
 * seeded database looks current.
 */
export function generateCandles(
  symbol: Symbol_,
  tf: Timeframe,
  opts: { count?: number; endTime?: number } = {},
): OHLCV[] {
  const meta = SYMBOL_META[symbol];
  const count = opts.count ?? CANDLE_COUNT;
  const step = TF_SECONDS[tf];
  const lastOpen = floorToTf(opts.endTime ?? Math.floor(Date.now() / 1000), tf);
  const firstOpen = lastOpen - (count - 1) * step;

  const rng = makeRng(`${symbol}:${tf}:v1`);
  const gauss = makeGaussian(rng);

  // Longer bars move more. Vol aggregates with the square root of time; the
  // exponent is pulled slightly below 0.5 so the daily series still spends most
  // of its life inside the symbol's quoted band.
  const bars_per_hour = step / TF_SECONDS["1h"];
  const tfScale = bars_per_hour ** 0.42;
  const sigma = meta.vol * tfScale;
  const [low, high] = meta.band;
  const mid = (low + high) / 2;
  const halfWidth = (high - low) / 2;

  const bars: OHLCV[] = [];
  let price = meta.anchor;
  // A slow drift term so the series has legible swings rather than pure noise.
  let drift = 0;

  for (let i = 0; i < count; i += 1) {
    const open = price;

    drift = drift * 0.94 + gauss() * sigma * 0.35;
    // Pull toward the middle of the band, harder the further out we are.
    const stretch = (price - mid) / halfWidth;
    const reversion = -stretch * sigma * 0.3;
    const shock = gauss() * sigma;

    let close = open * (1 + drift + reversion + shock);
    close = Math.min(Math.max(close, low * 0.995), high * 1.005);

    // Wicks: proportional to the bar's own body, plus a floor so flat bars still
    // have a little range.
    const body = Math.abs(close - open);
    const wickBase = open * sigma * 0.45;
    const upperWick = wickBase * rng() + body * 0.18 * rng();
    const lowerWick = wickBase * rng() + body * 0.18 * rng();

    const barHigh = Math.max(open, close) + upperWick;
    const barLow = Math.min(open, close) - lowerWick;

    // Volume tracks range — big bars trade more — with a session-shaped ripple.
    const range = (barHigh - barLow) / open;
    const session = 1 + 0.25 * Math.sin((i / 6) * Math.PI);
    // Volume aggregates linearly with time, unlike volatility.
    const volume =
      meta.volume * bars_per_hour * session * (0.55 + (range / sigma) * 0.42) * (0.85 + rng() * 0.3);

    bars.push({
      time: firstOpen + i * step,
      open: round(open, meta.precision),
      high: round(barHigh, meta.precision),
      low: round(barLow, meta.precision),
      close: round(close, meta.precision),
      volume: Math.round(volume),
    });

    price = close;
  }

  return bars;
}

function round(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}

/** Last close of the primary (1h) series — the mark price the rest of the app quotes. */
export function markPrice(symbol: Symbol_, endTime?: number): number {
  const bars = generateCandles(symbol, "1h", { endTime });
  return bars[bars.length - 1].close;
}
