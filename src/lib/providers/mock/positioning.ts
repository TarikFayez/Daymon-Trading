import { prisma } from "@/lib/prisma";
import type {
  MetalPositioning,
  MetricPoint,
  PerpPositioning,
  PositioningProvider,
} from "@/lib/providers/types";
import type { Symbol_ } from "@/lib/symbols";

type SnapshotRow = { time: Date; metrics: unknown };

/** Positioning history lives in `positioning_snapshots`; the last row is "now". */
async function history(symbol: Symbol_): Promise<SnapshotRow[]> {
  return prisma.positioningSnapshot.findMany({
    where: { symbol },
    orderBy: { time: "asc" },
  });
}

function seconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function series(rows: SnapshotRow[], key: string): MetricPoint[] {
  return rows.map((r) => ({
    time: seconds(r.time),
    value: Number((r.metrics as Record<string, unknown>)?.[key] ?? 0),
  }));
}

function num(row: SnapshotRow | undefined, key: string): number {
  return Number((row?.metrics as Record<string, unknown>)?.[key] ?? 0);
}

export class MockPositioningProvider implements PositioningProvider {
  async getPerp(symbol: Symbol_): Promise<PerpPositioning> {
    const rows = await history(symbol);
    if (rows.length === 0) {
      throw new Error(`No positioning snapshots seeded for ${symbol}`);
    }
    const now = rows[rows.length - 1];
    const dayAgo = rows[Math.max(0, rows.length - 25)];
    const cluster = ((now.metrics as Record<string, unknown>).nearestCluster ?? {
      price: 0,
      notional: 0,
      side: "LONG",
    }) as PerpPositioning["nearestCluster"];

    return {
      kind: "perp",
      symbol,
      time: now.time.toISOString(),
      funding: num(now, "funding"),
      fundingSeries: series(rows, "funding"),
      openInterest: num(now, "openInterest"),
      openInterestChange24h: num(now, "openInterest") - num(dayAgo, "openInterest"),
      openInterestSeries: series(rows, "openInterest"),
      longLiquidations24h: num(now, "longLiquidations24h"),
      shortLiquidations24h: num(now, "shortLiquidations24h"),
      nearestCluster: cluster,
      priceSeries: series(rows, "price"),
    };
  }

  async getMetal(symbol: Symbol_): Promise<MetalPositioning> {
    const rows = await history(symbol);
    if (rows.length === 0) {
      throw new Error(`No positioning snapshots seeded for ${symbol}`);
    }
    const now = rows[rows.length - 1];
    const prev = rows[Math.max(0, rows.length - 2)];

    return {
      kind: "metal",
      symbol,
      time: now.time.toISOString(),
      managedMoneyNet: num(now, "managedMoneyNet"),
      managedMoneyChange: num(now, "managedMoneyNet") - num(prev, "managedMoneyNet"),
      commercialsNet: num(now, "commercialsNet"),
      commercialsChange: num(now, "commercialsNet") - num(prev, "commercialsNet"),
      realYield10y: num(now, "realYield10y"),
      realYieldChange: num(now, "realYield10y") - num(prev, "realYield10y"),
      dxy: num(now, "dxy"),
      dxyChange: num(now, "dxy") - num(prev, "dxy"),
      managedMoneySeries: series(rows, "managedMoneyNet"),
      realYieldSeries: series(rows, "realYield10y"),
      dxySeries: series(rows, "dxy"),
      priceSeries: series(rows, "price"),
    };
  }
}
