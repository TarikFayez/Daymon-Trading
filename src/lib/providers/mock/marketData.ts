import { prisma } from "@/lib/prisma";
import { CANDLE_COUNT, generateCandles, type OHLCV } from "@/lib/mock/candles";
import type { MarketDataProvider } from "@/lib/providers/types";
import type { Symbol_, Timeframe } from "@/lib/symbols";

/**
 * Candles come out of Postgres, where the seed put them. If the table is empty
 * (a fresh container, an un-seeded database) the same deterministic generator
 * the seed uses fills in, so the chart is never blank.
 */
export class MockMarketDataProvider implements MarketDataProvider {
  async getCandles(symbol: Symbol_, tf: Timeframe): Promise<OHLCV[]> {
    const rows = await prisma.candle.findMany({
      where: { symbol, tf },
      orderBy: { time: "asc" },
      take: CANDLE_COUNT,
    });

    if (rows.length === 0) return generateCandles(symbol, tf);

    return rows.map((r) => ({
      time: Math.floor(r.time.getTime() / 1000),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));
  }

  async getMark(symbol: Symbol_): Promise<number> {
    const row = await prisma.candle.findFirst({
      where: { symbol, tf: "1h" },
      orderBy: { time: "desc" },
    });
    if (row) return row.c;
    const bars = generateCandles(symbol, "1h");
    return bars[bars.length - 1].close;
  }
}
