"use client";

import dynamic from "next/dynamic";

import { Card, CardTitle, Pill, Stat } from "@/components/ui";
import {
  compactMoney,
  count,
  pct,
  price as fmtPrice,
  signedCompactMoney,
  signedCount,
  signedPct,
  shortDate,
} from "@/lib/format";
import type { MetalPositioning, PerpPositioning } from "@/lib/providers/types";
import { SYMBOL_META } from "@/lib/symbols";

const MiniChart = dynamic(
  () => import("@/components/chart/MiniChart").then((m) => m.MiniChart),
  { ssr: false, loading: () => <div className="h-11 w-full" aria-hidden /> },
);

function Series({
  title,
  points,
  height,
  zeroLine,
  caption,
}: {
  title: string;
  points: { time: number; value: number }[];
  height: number;
  zeroLine?: boolean;
  caption: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] uppercase tracking-[0.06em] text-faint">{title}</span>
        <span className="text-[12px] text-faint">{caption}</span>
      </div>
      <div className="mt-2">
        <MiniChart points={points} height={height} zeroLine={zeroLine} label={title} />
      </div>
    </div>
  );
}

function range(points: { value: number }[], format: (n: number) => string): string {
  if (points.length === 0) return "";
  const values = points.map((p) => p.value);
  return `${format(Math.min(...values))} – ${format(Math.max(...values))}`;
}

/** XRP perp: what funding and the liquidation map are doing. */
export function PerpCard({ data }: { data: PerpPositioning }) {
  const meta = SYMBOL_META[data.symbol];
  const fundingPaysLongs = data.funding > 0;

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <CardTitle>{data.symbol} · perp</CardTitle>
        <span className="text-[12px] text-faint">{shortDate(data.time)}</span>
      </div>

      <div className="mt-3">
        <MiniChart points={data.priceSeries} height={44} label="XRP price" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat
          label="Funding · 8h"
          value={pct(data.funding, 4)}
          sub={fundingPaysLongs ? "longs are paying" : "shorts are paying"}
        />
        <Stat
          label="Open interest"
          value={compactMoney(data.openInterest)}
          sub={`${signedCompactMoney(data.openInterestChange24h)} in 24h`}
          align="right"
        />
        <Stat
          label="Long liquidations"
          value={compactMoney(data.longLiquidations24h)}
          sub="last 24h"
        />
        <Stat
          label="Short liquidations"
          value={compactMoney(data.shortLiquidations24h)}
          sub="last 24h"
          align="right"
        />
      </div>

      <div className="mt-5 rounded-card bg-raised px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] uppercase tracking-[0.06em] text-faint">
            Nearest liquidation cluster
          </span>
          <Pill>{data.nearestCluster.side === "LONG" ? "Longs" : "Shorts"}</Pill>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-[22px] font-semibold">
            {fmtPrice(data.nearestCluster.price, meta.precision)}
          </span>
          <span className="text-[15px] text-muted">
            {compactMoney(data.nearestCluster.notional)} stacked
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <Series
          title="Funding"
          points={data.fundingSeries}
          height={72}
          zeroLine
          caption={range(data.fundingSeries, (n) => pct(n, 3))}
        />
        <Series
          title="Open interest"
          points={data.openInterestSeries}
          height={72}
          caption={range(data.openInterestSeries, compactMoney)}
        />
      </div>
    </Card>
  );
}

/** Silver: who is positioned where, and the macro series that move it. */
export function MetalCard({ data }: { data: MetalPositioning }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <CardTitle>{data.symbol} · COT &amp; macro</CardTitle>
        <span className="text-[12px] text-faint">week of {shortDate(data.time)}</span>
      </div>

      <div className="mt-3">
        <MiniChart points={data.priceSeries} height={44} label="Silver price" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat
          label="Managed money net"
          value={count(data.managedMoneyNet)}
          sub={`${signedCount(data.managedMoneyChange)} on the week`}
        />
        <Stat
          label="Commercials net"
          value={count(data.commercialsNet)}
          sub={`${signedCount(data.commercialsChange)} on the week`}
          align="right"
        />
        <Stat
          label="10y real yield"
          value={pct(data.realYield10y, 2)}
          sub={`${signedPct(data.realYieldChange, 2)} on the week`}
        />
        <Stat
          label="DXY"
          value={data.dxy.toFixed(2)}
          sub={`${signedCount(data.dxyChange, 2)} on the week`}
          align="right"
        />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <Series
          title="Managed money net"
          points={data.managedMoneySeries}
          height={72}
          caption={range(data.managedMoneySeries, (n) => count(n))}
        />
        <Series
          title="10y real yield"
          points={data.realYieldSeries}
          height={72}
          caption={range(data.realYieldSeries, (n) => pct(n, 2))}
        />
      </div>
    </Card>
  );
}
