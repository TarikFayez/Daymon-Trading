import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { providers } from "@/lib/providers";
import { isSymbol, isTimeframe } from "@/lib/symbols";

export const dynamic = "force-dynamic";

/** GET /api/candles?symbol=XAGUSD&tf=1h */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "";
  const tf = url.searchParams.get("tf") ?? "";

  if (!isSymbol(symbol)) {
    return NextResponse.json({ error: `unknown symbol: ${symbol}` }, { status: 400 });
  }
  if (!isTimeframe(tf)) {
    return NextResponse.json({ error: `unknown timeframe: ${tf}` }, { status: 400 });
  }

  const candles = await providers.marketData.getCandles(symbol, tf);
  logger.debug({ symbol, tf, count: candles.length }, "candles served");

  return NextResponse.json({ symbol, tf, candles });
}
