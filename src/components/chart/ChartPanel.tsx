"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, Hero } from "@/components/ui";
import type { AnnotationItem, AnnotationSet } from "@/lib/annotations";
import { describeAnnotationSet } from "@/lib/annotations";
import { price as fmtPrice, signedPct, shortDateTime } from "@/lib/format";
import type { OHLCV } from "@/lib/mock/candles";
import {
  SYMBOLS,
  SYMBOL_META,
  TIMEFRAMES,
  type Symbol_,
  type Timeframe,
} from "@/lib/symbols";

const CandleChart = dynamic(
  () => import("@/components/chart/CandleChart").then((m) => m.CandleChart),
  {
    ssr: false,
    loading: () => <div className="h-[436px] w-full" aria-hidden />,
  },
);

export type ChartPanelProps = {
  symbol: Symbol_;
  tf: Timeframe;
  candles: OHLCV[];
  sets: AnnotationSet[];
};

type Loaded = {
  candles: OHLCV[];
  sets: AnnotationSet[];
};

export function ChartPanel(props: ChartPanelProps) {
  const [symbol, setSymbol] = useState<Symbol_>(props.symbol);
  const [tf, setTf] = useState<Timeframe>(props.tf);
  const [data, setData] = useState<Loaded>({
    candles: props.candles,
    sets: props.sets,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server already rendered one series; don't refetch it on mount.
  const initialKey = useRef(`${props.symbol}:${props.tf}`);

  const load = useCallback(async (nextSymbol: Symbol_, nextTf: Timeframe, signal: AbortSignal) => {
    const query = `symbol=${nextSymbol}&tf=${nextTf}`;
    const [candleRes, annotationRes] = await Promise.all([
      fetch(`/api/candles?${query}`, { signal }),
      fetch(`/api/annotations?${query}`, { signal }),
    ]);
    if (!candleRes.ok) throw new Error(`candles: ${candleRes.status}`);
    if (!annotationRes.ok) throw new Error(`annotations: ${annotationRes.status}`);

    const candleBody = (await candleRes.json()) as { candles: OHLCV[] };
    const annotationBody = (await annotationRes.json()) as { sets: AnnotationSet[] };
    return { candles: candleBody.candles, sets: annotationBody.sets };
  }, []);

  useEffect(() => {
    const key = `${symbol}:${tf}`;
    if (key === initialKey.current) return;

    const controller = new AbortController();
    setPending(true);
    setError(null);

    load(symbol, tf, controller.signal)
      .then((next) => {
        setData(next);
        setPending(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "could not load series");
        setPending(false);
      });

    return () => controller.abort();
  }, [symbol, tf, load]);

  const meta = SYMBOL_META[symbol];
  const { candles, sets } = data;
  const latest = sets[0] ?? null;

  const items: AnnotationItem[] = useMemo(
    () => sets.flatMap((set) => set.items),
    [sets],
  );

  const last = candles.at(-1);
  const first = candles[0];
  const changePct =
    last && first && first.open !== 0 ? ((last.close - first.open) / first.open) * 100 : 0;

  return (
    <>
      <Hero
        label={`${meta.label} · ${symbol}`}
        value={last ? fmtPrice(last.close, meta.precision) : "—"}
        sub={
          <span>
            <span className={changePct >= 0 ? "text-up" : "text-down"}>
              {signedPct(changePct)}
            </span>{" "}
            over {candles.length} bars · {meta.venue}
          </span>
        }
      />

      <div className="flex flex-col gap-4">
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
            <Switcher
              options={SYMBOLS}
              value={symbol}
              onChange={(v) => setSymbol(v)}
              label="Symbol"
            />
            <Switcher
              options={TIMEFRAMES}
              value={tf}
              onChange={(v) => setTf(v)}
              label="Timeframe"
            />
          </div>

          <div
            className="px-1 pb-2 transition-opacity duration-150"
            style={{ opacity: pending ? 0.45 : 1 }}
          >
            <CandleChart
              candles={candles}
              annotations={items}
              precision={meta.precision}
              seriesKey={`${symbol}:${tf}`}
            />
          </div>

          {error ? (
            <p className="px-4 pb-4 text-[13px] text-down">Could not load: {error}</p>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
            Latest annotation
          </h2>
          {latest ? (
            <>
              <p className="mt-2 text-[16px] leading-snug text-ink">
                {describeAnnotationSet(latest)}
              </p>
              <p className="mt-2 text-[13px] text-muted">
                {latest.items.length} drawings · {latest.symbol} {latest.tf} ·{" "}
                {shortDateTime(latest.createdAt)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-muted">
              Nothing drawn on {symbol} {tf} yet.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Switcher<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={[
              "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              active ? "bg-ink text-canvas" : "bg-raised text-muted hover:text-ink",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
