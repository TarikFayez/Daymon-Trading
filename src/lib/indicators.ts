import type { OHLCV } from "@/lib/mock/candles";

export type LinePoint = { time: number; value: number };

/** Exponential moving average of closes. Starts once `period` bars exist. */
export function ema(candles: OHLCV[], period: number): LinePoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];

  // Seed with the simple average of the first `period` closes.
  let value = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  out.push({ time: candles[period - 1].time, value });

  for (let i = period; i < candles.length; i += 1) {
    value = candles[i].close * k + value * (1 - k);
    out.push({ time: candles[i].time, value });
  }
  return out;
}

const DAY = 86_400;
const WEEK = 7 * DAY;

/** Monday 00:00 UTC of the week containing `t`. */
function weekStart(t: number): number {
  const date = new Date(t * 1000);
  const dow = (date.getUTCDay() + 6) % 7; // Monday = 0
  const midnight = t - (t % DAY);
  return midnight - dow * DAY;
}

/**
 * Volume-weighted average price, reset at each anchor boundary. The silver plan
 * is written against the weekly one, so that is the default.
 */
export function anchoredVwap(candles: OHLCV[], anchor: "week" | "day" = "week"): LinePoint[] {
  const out: LinePoint[] = [];
  let bucket = -1;
  let pv = 0;
  let volume = 0;

  for (const c of candles) {
    const key = anchor === "week" ? weekStart(c.time) : c.time - (c.time % DAY);
    if (key !== bucket) {
      bucket = key;
      pv = 0;
      volume = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    volume += c.volume;
    out.push({ time: c.time, value: volume > 0 ? pv / volume : c.close });
  }
  return out;
}

export const VWAP_ANCHOR_SECONDS = { week: WEEK, day: DAY } as const;
