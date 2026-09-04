import { ChartPanel } from "@/components/chart/ChartPanel";
import { providers } from "@/lib/providers";
import { isSymbol, isTimeframe, type Symbol_, type Timeframe } from "@/lib/symbols";

export const dynamic = "force-dynamic";

const DEFAULT_SYMBOL: Symbol_ = "XAGUSD";
const DEFAULT_TF: Timeframe = "1h";

export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawSymbol = typeof params.symbol === "string" ? params.symbol : "";
  const rawTf = typeof params.tf === "string" ? params.tf : "";

  const symbol = isSymbol(rawSymbol) ? rawSymbol : DEFAULT_SYMBOL;
  const tf = isTimeframe(rawTf) ? rawTf : DEFAULT_TF;

  const [candles, sets] = await Promise.all([
    providers.marketData.getCandles(symbol, tf),
    providers.annotations.list(symbol, tf),
  ]);

  return <ChartPanel symbol={symbol} tf={tf} candles={candles} sets={sets} />;
}
