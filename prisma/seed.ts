/**
 * Mock data for the DAYEMON mockup.
 *
 * Everything here is fabricated but internally consistent: position marks are
 * the last close of the generated 1h series, journal context snapshots line up
 * with the positioning history, and seeded chart annotations sit on real swing
 * points of the candles they are drawn against.
 *
 * Re-running is safe — the script truncates what it owns first.
 */
import { PrismaClient, type Prisma } from "../src/generated/prisma";
import type { AnnotationItem } from "../src/lib/annotations";
import { generateCandles, floorToTf, type OHLCV } from "../src/lib/mock/candles";
import { makeRng } from "../src/lib/mock/rng";
import {
  SYMBOLS,
  SYMBOL_META,
  TIMEFRAMES,
  type Symbol_,
  type Timeframe,
} from "../src/lib/symbols";

const prisma = new PrismaClient();

const NOW = new Date();
const NOW_S = Math.floor(NOW.getTime() / 1000);
const HOUR = 3600;
const DAY = 24 * HOUR;

function at(secondsAgo: number): Date {
  return new Date((NOW_S - secondsAgo) * 1000);
}

/** Monday of the current week, UTC. */
function weekStart(d: Date): Date {
  const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (c.getUTCDay() + 6) % 7; // Monday = 0
  c.setUTCDate(c.getUTCDate() - dow);
  return c;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/* -------------------------------------------------------------------------- */
/* Candles                                                                      */
/* -------------------------------------------------------------------------- */

const candlesBySeries = new Map<string, OHLCV[]>();

function seriesFor(symbol: Symbol_, tf: Timeframe): OHLCV[] {
  const key = `${symbol}:${tf}`;
  let bars = candlesBySeries.get(key);
  if (!bars) {
    bars = generateCandles(symbol, tf, { endTime: NOW_S });
    candlesBySeries.set(key, bars);
  }
  return bars;
}

function markOf(symbol: Symbol_): number {
  const bars = seriesFor(symbol, "1h");
  return bars[bars.length - 1].close;
}

async function seedCandles() {
  const rows: Prisma.CandleCreateManyInput[] = [];
  for (const symbol of SYMBOLS) {
    for (const tf of TIMEFRAMES) {
      for (const bar of seriesFor(symbol, tf)) {
        rows.push({
          symbol,
          tf,
          time: new Date(bar.time * 1000),
          o: bar.open,
          h: bar.high,
          l: bar.low,
          c: bar.close,
          v: bar.volume,
        });
      }
    }
  }
  await prisma.candle.createMany({ data: rows });
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Accounts, plans, positions                                                   */
/* -------------------------------------------------------------------------- */

const ACCOUNTS = [
  {
    name: "FundedNext 200K",
    broker: "FundedNext",
    kind: "PROP" as const,
    equity: "207430.00",
  },
  {
    name: "FundedNext 100K",
    broker: "FundedNext",
    kind: "PROP" as const,
    equity: "103880.00",
  },
  {
    name: "BloFin Perps",
    broker: "BloFin",
    kind: "LIVE" as const,
    equity: "48220.00",
  },
];

async function seedAccounts() {
  await prisma.account.createMany({ data: ACCOUNTS });
  const rows = await prisma.account.findMany();
  return new Map(rows.map((a) => [a.name, a.id]));
}

async function seedPlans() {
  const monday = weekStart(NOW);
  const silver = markOf("XAGUSD");
  const gold = markOf("XAUUSD");
  const xrp = markOf("XRPUSDT");

  await prisma.plan.createMany({
    data: [
      {
        symbol: "XAGUSD",
        weekOf: monday,
        bias: "LONG",
        levels: [
          { label: "Accumulation", price: round(silver - 1.15, 3), kind: "entry" },
          { label: "Reclaim trigger", price: round(silver - 0.2, 3), kind: "entry" },
          { label: "Weekly VWAP", price: round(silver - 0.42, 3), kind: "reference" },
          { label: "Target 1", price: round(silver + 1.3, 3), kind: "target" },
          { label: "Invalidation", price: round(silver - 1.55, 3), kind: "invalidation" },
        ],
        invalidation: round(silver - 1.55, 3).toFixed(3),
        maxSize: "1.000000",
        note: "Add only on a reclaim above the weekly VWAP with the 4h closing there. Nothing new after Thursday's London fix.",
      },
      {
        symbol: "XAUUSD",
        weekOf: monday,
        bias: "SHORT",
        levels: [
          { label: "Supply", price: round(gold + 34, 2), kind: "entry" },
          { label: "Prior high", price: round(gold + 52, 2), kind: "reference" },
          { label: "Target 1", price: round(gold - 78, 2), kind: "target" },
          { label: "Invalidation", price: round(gold + 62, 2), kind: "invalidation" },
        ],
        invalidation: round(gold + 62, 2).toFixed(2),
        maxSize: "0.750000",
        note: "Fade into supply only while the 10y real yield holds above 1.35. Cut on a daily close over the prior high.",
      },
      {
        symbol: "XRPUSDT",
        weekOf: monday,
        bias: "LONG",
        levels: [
          { label: "Bid zone", price: round(xrp - 0.14, 4), kind: "entry" },
          { label: "Liquidation shelf", price: round(xrp - 0.22, 4), kind: "reference" },
          { label: "Target 1", price: round(xrp + 0.24, 4), kind: "target" },
          { label: "Invalidation", price: round(xrp - 0.26, 4), kind: "invalidation" },
        ],
        invalidation: round(xrp - 0.26, 4).toFixed(4),
        maxSize: "40000.000000",
        note: "Bid the shelf while funding stays negative. Do not add into positive funding — that is where last month's damage came from.",
      },
    ],
  });
}

async function seedPositions(accounts: Map<string, string>) {
  const silver = markOf("XAGUSD");
  const gold = markOf("XAUUSD");
  const xrp = markOf("XRPUSDT");

  // contractValue = dollars per 1.00 move, per unit of size.
  //   XAGUSD 1 lot = 5,000 oz · XAUUSD 1 lot = 100 oz · XRPUSDT 1 contract = 1 XRP
  const data: Prisma.PositionCreateManyInput[] = [
    {
      accountId: accounts.get("FundedNext 200K")!,
      symbol: "XAGUSD",
      side: "LONG",
      size: "0.550000",
      entry: round(silver - 0.94, 3).toFixed(3),
      markPrice: silver.toFixed(3),
      stop: round(silver - 1.55, 3).toFixed(3),
      target: round(silver + 1.3, 3).toFixed(3),
      contractValue: "5000.000000",
      openedAt: at(6 * DAY + 3 * HOUR),
    },
    {
      accountId: accounts.get("FundedNext 100K")!,
      symbol: "XAGUSD",
      side: "LONG",
      size: "0.300000",
      // Underwater: added on the reclaim, price came back through it.
      entry: round(silver + 0.31, 3).toFixed(3),
      markPrice: silver.toFixed(3),
      stop: round(silver - 1.55, 3).toFixed(3),
      target: round(silver + 1.3, 3).toFixed(3),
      contractValue: "5000.000000",
      openedAt: at(2 * DAY + 5 * HOUR),
    },
    {
      accountId: accounts.get("FundedNext 200K")!,
      symbol: "XAUUSD",
      side: "SHORT",
      size: "0.400000",
      entry: round(gold + 21.4, 2).toFixed(2),
      markPrice: gold.toFixed(2),
      stop: round(gold + 62, 2).toFixed(2),
      target: round(gold - 78, 2).toFixed(2),
      contractValue: "100.000000",
      openedAt: at(4 * DAY + 9 * HOUR),
    },
    {
      accountId: accounts.get("BloFin Perps")!,
      symbol: "XRPUSDT",
      side: "LONG",
      size: "26000.000000",
      entry: round(xrp - 0.098, 4).toFixed(4),
      markPrice: xrp.toFixed(4),
      stop: round(xrp - 0.26, 4).toFixed(4),
      target: round(xrp + 0.24, 4).toFixed(4),
      contractValue: "1.000000",
      openedAt: at(3 * DAY + 11 * HOUR),
    },
    {
      accountId: accounts.get("BloFin Perps")!,
      symbol: "XRPUSDT",
      side: "SHORT",
      size: "9000.000000",
      // Underwater: the hedge was put on below where price is now.
      entry: round(xrp - 0.071, 4).toFixed(4),
      markPrice: xrp.toFixed(4),
      stop: round(xrp + 0.152, 4).toFixed(4),
      target: round(xrp - 0.11, 4).toFixed(4),
      contractValue: "1.000000",
      openedAt: at(19 * HOUR),
    },
  ];

  await prisma.position.createMany({ data });
}

/* -------------------------------------------------------------------------- */
/* Journal                                                                      */
/* -------------------------------------------------------------------------- */

type TradeSpec = {
  symbol: Symbol_;
  side: "LONG" | "SHORT";
  size: number;
  account: string;
  /** Entry, as an offset from the symbol's current mark. */
  entryOffset: number;
  pnl: number;
  rMultiple: number;
  inPlan: boolean;
  deviation?: string;
  session: "Asia" | "London" | "New York";
  funding: number | null;
  openInterest: number | null;
  note: string;
  heldHours: number;
};

/** 13 trades, 9 of them inside the written plan. */
const THIS_MONTH: TradeSpec[] = [
  { symbol: "XAGUSD", side: "LONG", size: 0.5, account: "FundedNext 200K", entryOffset: -1.32, pnl: 2150, rMultiple: 1.8, inPlan: true, session: "London", funding: null, openInterest: null, note: "Reclaim of the weekly VWAP, took target 1.", heldHours: 29 },
  { symbol: "XRPUSDT", side: "LONG", size: 24000, account: "BloFin Perps", entryOffset: -0.164, pnl: 1680, rMultiple: 1.4, inPlan: true, session: "Asia", funding: -0.0092, openInterest: 402_000_000, note: "Bid the shelf on negative funding.", heldHours: 14 },
  { symbol: "XAUUSD", side: "SHORT", size: 0.6, account: "FundedNext 200K", entryOffset: 46.2, pnl: -1240, rMultiple: -1, inPlan: true, session: "New York", funding: null, openInterest: null, note: "Supply fade, stopped on the CPI reaction.", heldHours: 7 },
  { symbol: "XRPUSDT", side: "LONG", size: 38000, account: "BloFin Perps", entryOffset: 0.043, pnl: -2280, rMultiple: -1.5, inPlan: false, deviation: "added into positive funding", session: "Asia", funding: 0.0241, openInterest: 448_000_000, note: "Chased the breakout with funding already paying longs.", heldHours: 5 },
  { symbol: "XAGUSD", side: "LONG", size: 0.35, account: "FundedNext 100K", entryOffset: -0.86, pnl: 940, rMultiple: 1.1, inPlan: true, session: "London", funding: null, openInterest: null, note: "Partial into the prior week's high.", heldHours: 21 },
  { symbol: "XRPUSDT", side: "SHORT", size: 12000, account: "BloFin Perps", entryOffset: 0.128, pnl: 620, rMultiple: 0.9, inPlan: true, session: "New York", funding: 0.0188, openInterest: 431_000_000, note: "Faded the funding spike back to the shelf.", heldHours: 9 },
  { symbol: "XRPUSDT", side: "LONG", size: 41000, account: "BloFin Perps", entryOffset: 0.061, pnl: -1910, rMultiple: -1.3, inPlan: false, deviation: "added into positive funding", session: "Asia", funding: 0.0276, openInterest: 456_000_000, note: "Same mistake, one day later.", heldHours: 4 },
  { symbol: "XAUUSD", side: "SHORT", size: 0.45, account: "FundedNext 200K", entryOffset: 58.9, pnl: 1780, rMultiple: 2.1, inPlan: true, session: "London", funding: null, openInterest: null, note: "Real yields held above 1.35, target taken.", heldHours: 34 },
  { symbol: "XAGUSD", side: "LONG", size: 0.4, account: "FundedNext 200K", entryOffset: -0.55, pnl: 480, rMultiple: 0.5, inPlan: true, session: "London", funding: null, openInterest: null, note: "Scratched into the Thursday fix, per plan.", heldHours: 16 },
  { symbol: "XRPUSDT", side: "LONG", size: 52000, account: "BloFin Perps", entryOffset: -0.021, pnl: -1420, rMultiple: -0.9, inPlan: false, deviation: "sized above the weekly cap", session: "Asia", funding: -0.0034, openInterest: 439_000_000, note: "52k against a 40k cap. Right idea, wrong size.", heldHours: 11 },
  { symbol: "XRPUSDT", side: "LONG", size: 22000, account: "BloFin Perps", entryOffset: -0.142, pnl: 1340, rMultiple: 1.6, inPlan: true, session: "London", funding: -0.0118, openInterest: 397_000_000, note: "Clean shelf bid.", heldHours: 18 },
  { symbol: "XRPUSDT", side: "LONG", size: 35000, account: "BloFin Perps", entryOffset: 0.052, pnl: -1310, rMultiple: -1.1, inPlan: false, deviation: "added into positive funding", session: "New York", funding: 0.0219, openInterest: 452_000_000, note: "Third time this month.", heldHours: 6 },
  { symbol: "XAGUSD", side: "LONG", size: 0.45, account: "FundedNext 100K", entryOffset: -0.71, pnl: 1120, rMultiple: 1.3, inPlan: true, session: "London", funding: null, openInterest: null, note: "Held over the weekend, closed into strength.", heldHours: 52 },
];

/** Prior month, for depth behind the current month's hero number. */
const LAST_MONTH: TradeSpec[] = [
  { symbol: "XAGUSD", side: "LONG", size: 0.5, account: "FundedNext 200K", entryOffset: -1.85, pnl: 1980, rMultiple: 1.7, inPlan: true, session: "London", funding: null, openInterest: null, note: "Range low bid.", heldHours: 27 },
  { symbol: "XRPUSDT", side: "SHORT", size: 18000, account: "BloFin Perps", entryOffset: 0.176, pnl: -980, rMultiple: -1, inPlan: true, session: "Asia", funding: 0.0142, openInterest: 421_000_000, note: "Stopped at the shelf.", heldHours: 8 },
  { symbol: "XAUUSD", side: "SHORT", size: 0.5, account: "FundedNext 200K", entryOffset: 71.5, pnl: 2240, rMultiple: 2.4, inPlan: true, session: "New York", funding: null, openInterest: null, note: "DXY bid, gold gave it back.", heldHours: 41 },
  { symbol: "XRPUSDT", side: "LONG", size: 46000, account: "BloFin Perps", entryOffset: 0.084, pnl: -2640, rMultiple: -1.8, inPlan: false, deviation: "added into positive funding", session: "Asia", funding: 0.0298, openInterest: 461_000_000, note: "The trade that started the rule.", heldHours: 3 },
  { symbol: "XAGUSD", side: "LONG", size: 0.3, account: "FundedNext 100K", entryOffset: -1.44, pnl: 760, rMultiple: 0.9, inPlan: true, session: "London", funding: null, openInterest: null, note: "Small, per the reduced cap.", heldHours: 19 },
  { symbol: "XRPUSDT", side: "LONG", size: 28000, account: "BloFin Perps", entryOffset: -0.198, pnl: 2010, rMultiple: 2.2, inPlan: true, session: "London", funding: -0.0157, openInterest: 388_000_000, note: "Best entry of the month.", heldHours: 23 },
  { symbol: "XAUUSD", side: "SHORT", size: 0.35, account: "FundedNext 200K", entryOffset: 39.8, pnl: -890, rMultiple: -1, inPlan: true, session: "London", funding: null, openInterest: null, note: "Fade failed, cut at the level.", heldHours: 12 },
];

function tradeRows(
  specs: TradeSpec[],
  accounts: Map<string, string>,
  strategies: Map<Symbol_, string>,
  windowStart: Date,
  windowEnd: Date,
): Prisma.TradeCreateManyInput[] {
  const span = windowEnd.getTime() - windowStart.getTime();

  return specs.map((spec, i) => {
    const meta = SYMBOL_META[spec.symbol];
    const cv = meta.contractValue;
    const dir = spec.side === "LONG" ? 1 : -1;
    const entry = round(markOf(spec.symbol) + spec.entryOffset, meta.precision);
    const exit = round(entry + (spec.pnl / (spec.size * cv)) * dir, meta.precision);

    const closedAt = new Date(
      windowStart.getTime() + ((i + 0.5) / specs.length) * span,
    );
    const openedAt = new Date(closedAt.getTime() - spec.heldHours * HOUR * 1000);

    return {
      accountId: accounts.get(spec.account)!,
      symbol: spec.symbol,
      side: spec.side,
      size: spec.size.toFixed(6),
      entry: entry.toFixed(6),
      exit: exit.toFixed(6),
      pnl: spec.pnl.toFixed(2),
      rMultiple: spec.rMultiple.toFixed(2),
      inPlan: spec.inPlan,
      deviation: spec.deviation ?? null,
      contextSnapshot: {
        funding: spec.funding,
        openInterest: spec.openInterest,
        session: spec.session,
        note: spec.note,
      },
      openedAt,
      closedAt,
      strategyId: strategies.get(spec.symbol) ?? null,
    };
  });
}

async function seedTrades(accounts: Map<string, string>, strategies: Map<Symbol_, string>) {
  const monthStart = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));
  const prevMonthStart = new Date(
    Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 1, 1),
  );

  await prisma.trade.createMany({
    data: [
      ...tradeRows(LAST_MONTH, accounts, strategies, prevMonthStart, monthStart),
      ...tradeRows(THIS_MONTH, accounts, strategies, monthStart, NOW),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Positioning                                                                  */
/* -------------------------------------------------------------------------- */

const POSITIONING_POINTS = 30;

/** Price at (or just before) a given time, from the seeded series. */
function priceAt(symbol: Symbol_, tf: Timeframe, unixSeconds: number): number {
  const bars = seriesFor(symbol, tf);
  let out = bars[0].close;
  for (const bar of bars) {
    if (bar.time > unixSeconds) break;
    out = bar.close;
  }
  return out;
}

/** XRP perp: funding, open interest and liquidations, every 8h for 10 days. */
async function seedPerpPositioning() {
  const rng = makeRng("XRPUSDT:positioning:v1");
  const step = 8 * HOUR;
  const last = Math.floor(NOW_S / step) * step;
  const mark = markOf("XRPUSDT");

  const data: Prisma.PositioningSnapshotCreateManyInput[] = [];

  for (let i = 0; i < POSITIONING_POINTS; i += 1) {
    const t = last - (POSITIONING_POINTS - 1 - i) * step;
    const phase = i / POSITIONING_POINTS;

    // Funding oscillates, but the regime drifts from paying longs at the start of
    // the window to paying shorts now — which is exactly what the plan is bidding
    // into, and what the off-plan trades in the journal ignored.
    const wave =
      0.011 * Math.sin(phase * Math.PI * 3.1 + 0.9) + 0.006 * Math.sin(phase * Math.PI * 6.7);
    const regime = 0.011 * (0.5 - phase);
    const funding = round(wave + regime + (rng() - 0.5) * 0.004, 4);
    const openInterest = Math.round(
      398_000_000 + 46_000_000 * Math.sin(phase * Math.PI * 1.8) + (rng() - 0.5) * 18_000_000,
    );
    const longLiquidations24h = Math.round(
      3_100_000 + 9_400_000 * Math.max(0, Math.sin(phase * Math.PI * 3.3)) + rng() * 2_400_000,
    );
    const shortLiquidations24h = Math.round(
      2_200_000 + 5_800_000 * Math.max(0, Math.cos(phase * Math.PI * 2.7)) + rng() * 1_800_000,
    );

    data.push({
      symbol: "XRPUSDT",
      time: new Date(t * 1000),
      metrics: {
        funding,
        openInterest,
        longLiquidations24h,
        shortLiquidations24h,
        price: priceAt("XRPUSDT", "1h", t),
        // The shelf the plan is bidding: stacked long liquidations below spot.
        nearestCluster: {
          price: round(mark - 0.223, 4),
          notional: 38_400_000,
          side: "LONG",
        },
      },
    });
  }

  await prisma.positioningSnapshot.createMany({ data });
}

/** Silver: weekly COT plus the two macro series the desk reads it against. */
async function seedMetalPositioning() {
  const rng = makeRng("XAGUSD:positioning:v1");
  const week = 7 * DAY;
  // COT is published Friday for the prior Tuesday.
  const last = Math.floor(NOW_S / week) * week;

  const data: Prisma.PositioningSnapshotCreateManyInput[] = [];

  for (let i = 0; i < POSITIONING_POINTS; i += 1) {
    const t = last - (POSITIONING_POINTS - 1 - i) * week;
    const phase = i / POSITIONING_POINTS;

    const managedMoneyNet = Math.round(
      52_000 + 17_500 * Math.sin(phase * Math.PI * 1.7 - 0.4) + (rng() - 0.5) * 4_200,
    );
    // Commercials are the other side of managed money, roughly.
    const commercialsNet = Math.round(
      -managedMoneyNet - 14_800 + (rng() - 0.5) * 3_600,
    );
    const realYield10y = round(
      1.44 - 0.24 * Math.sin(phase * Math.PI * 1.9) + (rng() - 0.5) * 0.06,
      3,
    );
    const dxy = round(
      97.6 + 2.4 * Math.sin(phase * Math.PI * 1.4 + 1.1) + (rng() - 0.5) * 0.5,
      2,
    );

    data.push({
      symbol: "XAGUSD",
      time: new Date(t * 1000),
      metrics: {
        managedMoneyNet,
        commercialsNet,
        realYield10y,
        dxy,
        price: priceAt("XAGUSD", "1d", t),
      },
    });
  }

  await prisma.positioningSnapshot.createMany({ data });
}

/* -------------------------------------------------------------------------- */
/* Chart annotations                                                            */
/* -------------------------------------------------------------------------- */

const INK = "#ffffff";
const MUTED = "#8e8e93";
const UP = "#19c37d";
const DOWN = "#ff5c5c";

function swing(bars: OHLCV[], from: number, to: number, kind: "low" | "high") {
  const window = bars.slice(from, to);
  let best = window[0];
  for (const bar of window) {
    if (kind === "low" ? bar.low < best.low : bar.high > best.high) best = bar;
  }
  return { time: best.time, price: kind === "low" ? best.low : best.high };
}

/**
 * Six drawings per symbol/timeframe, anchored to real swing points of the series
 * they are drawn on — so the chart is never empty and never nonsense.
 */
function annotationItems(symbol: Symbol_, tf: Timeframe): AnnotationItem[] {
  const bars = seriesFor(symbol, tf);
  const meta = SYMBOL_META[symbol];
  const n = bars.length;
  const mark = bars[n - 1].close;

  // Plan levels, expressed in the symbol's own scale.
  const scale = (mark / meta.anchor) * (meta.band[1] - meta.band[0]);
  const target = round(mark + scale * 0.42, meta.precision);
  const invalidation = round(mark - scale * 0.5, meta.precision);

  // Anchored inside the window the chart opens on, so every drawing is visible
  // without scrolling back.
  const swingLow = swing(bars, n - 120, n - 60, "low");
  const swingHigh = swing(bars, n - 60, n - 10, "high");
  const trendFrom = swing(bars, n - 105, n - 80, "low");
  const trendTo = swing(bars, n - 55, n - 25, "low");

  const zoneMid = bars[n - 45].close;
  const noteBar = bars[n - 92];

  return [
    {
      type: "hline",
      price: target,
      label: "Target 1",
      color: UP,
    },
    {
      type: "hline",
      price: invalidation,
      label: "Invalidation",
      color: DOWN,
    },
    {
      type: "trendline",
      from: trendFrom,
      to: trendTo,
      label: "Rising lows",
      color: INK,
    },
    {
      type: "fib",
      from: swingLow,
      to: swingHigh,
      label: "Swing retrace",
      color: MUTED,
    },
    {
      type: "zone",
      priceTop: round(zoneMid + scale * 0.11, meta.precision),
      priceBottom: round(zoneMid - scale * 0.11, meta.precision),
      fromTime: bars[n - 70].time,
      toTime: bars[n - 1].time,
      label: "Accumulation",
      color: MUTED,
    },
    {
      type: "note",
      time: noteBar.time,
      price: round(noteBar.high + scale * 0.08, meta.precision),
      text: NOTE_TEXT[symbol],
      color: INK,
    },
  ];
}

const NOTE_TEXT: Record<Symbol_, string> = {
  XAGUSD: "Reclaimed the weekly VWAP here — this is the add level, not the entry.",
  XAUUSD: "Failed at supply on rising real yields. Short bias holds below the prior high.",
  XRPUSDT: "Funding flipped negative into this low. Shelf below is where the bid sits.",
};

const SET_NOTE: Record<Symbol_, string> = {
  XAGUSD: "Long silver from the accumulation band. Adds only above the weekly VWAP; out below the invalidation.",
  XAUUSD: "Short gold into supply while the 10y real yield holds above 1.35. Daily close over the prior high ends it.",
  XRPUSDT: "Long XRP off the liquidation shelf while funding stays negative. No adds into positive funding.",
};

async function seedAnnotations() {
  const data: Prisma.AnnotationCreateManyInput[] = [];
  for (const symbol of SYMBOLS) {
    for (const tf of TIMEFRAMES) {
      data.push({
        symbol,
        tf,
        items: annotationItems(symbol, tf) as unknown as Prisma.InputJsonValue,
        note: SET_NOTE[symbol],
        createdAt: at(4 * HOUR),
      });
    }
  }
  await prisma.annotation.createMany({ data });
}


/* -------------------------------------------------------------------------- */
/* Strategies, setups, agent proposals                                          */
/* -------------------------------------------------------------------------- */

type StrategyIds = { byId: Map<string, string>; bySymbol: Map<Symbol_, string> };

async function seedStrategies(): Promise<StrategyIds> {
  await prisma.strategy.createMany({
    data: [
      {
        slug: "silver-vwap-reclaim",
        name: "Silver VWAP Reclaim",
        symbol: "XAGUSD",
        tf: "4h",
        bias: "LONG",
        status: "ACTIVE",
        thesis:
          "Silver trends when managed money is adding and price holds the weekly VWAP. Buy the reclaim, not the dip: the 4h has to close back above it with the prior low intact.",
        rules: {
          entry: [
            "4h close above the weekly VWAP",
            "Prior 4h swing low held on the reclaim bar",
            "Managed money net long rising on the week",
          ],
          invalidation: "4h close back below the weekly VWAP",
          sizing: { riskPct: 1.0, maxSize: 1.0 },
          sessions: ["London"],
        },
        stats: { trades: 14, winRate: 57, expectancyR: 0.62, pnl30d: 6410, avgHoldHours: 31 },
      },
      {
        slug: "gold-supply-fade",
        name: "Gold Supply Fade",
        symbol: "XAUUSD",
        tf: "1h",
        bias: "SHORT",
        status: "ACTIVE",
        thesis:
          "Gold fails at marked supply while real yields are rising. Sell the rejection, never the level itself, and get out on a daily close over the prior high.",
        rules: {
          entry: [
            "Price into the marked supply band",
            "10y real yield above 1.35%",
            "1h rejection wick larger than 60% of the bar's range",
          ],
          invalidation: "Daily close over the prior high",
          sizing: { riskPct: 0.75, maxSize: 0.75 },
          sessions: ["London", "New York"],
        },
        stats: { trades: 9, winRate: 44, expectancyR: 0.41, pnl30d: 2890, avgHoldHours: 18 },
      },
      {
        slug: "xrp-liquidation-shelf",
        name: "XRP Liquidation Shelf",
        symbol: "XRPUSDT",
        tf: "1h",
        bias: "LONG",
        status: "ACTIVE",
        thesis:
          "Stacked long liquidations below spot get run and reversed when funding is negative and leverage is leaving. Rest bids just above the shelf; the stop sits under it.",
        rules: {
          entry: [
            "Price within 0.5% of the nearest long-liquidation cluster",
            "Funding negative at the last settlement",
            "Open interest down over 24h",
          ],
          invalidation: "1h close below the cluster",
          sizing: { riskPct: 1.5, maxSize: 40000 },
          sessions: ["Asia", "London"],
        },
        stats: { trades: 22, winRate: 55, expectancyR: 0.48, pnl30d: 4120, avgHoldHours: 12 },
      },
      {
        slug: "gold-asia-breakout",
        name: "Gold Asia Breakout",
        symbol: "XAUUSD",
        tf: "1h",
        bias: "LONG",
        status: "PAUSED",
        thesis:
          "Buy the Asia-session range break into London. Paused after three straight failed breaks in August; back on when the range contracts again.",
        rules: {
          entry: ["Asia range under 0.4% of price", "1h close above the Asia high", "DXY flat or lower on the session"],
          invalidation: "1h close back inside the Asia range",
          sizing: { riskPct: 0.5, maxSize: 0.5 },
          sessions: ["London"],
        },
        stats: { trades: 11, winRate: 36, expectancyR: -0.18, pnl30d: -1840, avgHoldHours: 6 },
      },
    ],
  });

  const rows = await prisma.strategy.findMany({ where: { status: "ACTIVE" } });
  const byId = new Map(rows.map((r) => [r.slug, r.id]));
  const bySymbol = new Map<Symbol_, string>(rows.map((r) => [r.symbol as Symbol_, r.id]));
  return { byId, bySymbol };
}

async function seedSetups(strategies: StrategyIds): Promise<Map<string, string>> {
  const silver = markOf("XAGUSD");
  const gold = markOf("XAUUSD");
  const xrp = markOf("XRPUSDT");
  const shelf = round(xrp - 0.223, 4);

  const specs: Array<Prisma.SetupCreateManyInput & { key: string }> = [
    {
      key: "silver-ready",
      strategyId: strategies.byId.get("silver-vwap-reclaim")!,
      symbol: "XAGUSD",
      tf: "4h",
      state: "READY",
      score: 78,
      trigger: `4h closed above the weekly VWAP at ${round(silver - 0.42, 3).toFixed(3)}`,
      conditions: [
        { label: "4h close above weekly VWAP", met: true, value: `${silver.toFixed(3)} vs ${round(silver - 0.42, 3).toFixed(3)}` },
        { label: "Prior 4h low held", met: true, value: `${round(silver - 0.71, 3).toFixed(3)} untouched` },
        { label: "Managed money rising w/w", met: false, value: "−2,534 contracts" },
      ],
      entry: round(silver - 0.2, 3).toFixed(3),
      stop: round(silver - 1.55, 3).toFixed(3),
      target: round(silver + 1.3, 3).toFixed(3),
      detectedAt: at(3 * HOUR + 12 * 60),
      expiresAt: at(-(9 * HOUR)),
    },
    {
      key: "silver-watch",
      strategyId: strategies.byId.get("silver-vwap-reclaim")!,
      symbol: "XAGUSD",
      tf: "4h",
      state: "WATCHING",
      score: 41,
      trigger: `Retest of the accumulation band at ${round(silver - 1.15, 3).toFixed(3)}`,
      conditions: [
        { label: "Price inside the band", met: false, value: `${round(silver - (silver - 1.15), 3).toFixed(3)} above` },
        { label: "Weekly VWAP still above", met: true, value: "yes" },
        { label: "Managed money rising w/w", met: false, value: "−2,534 contracts" },
      ],
      entry: round(silver - 1.15, 3).toFixed(3),
      stop: round(silver - 1.55, 3).toFixed(3),
      target: round(silver + 0.5, 3).toFixed(3),
      detectedAt: at(7 * HOUR),
      expiresAt: at(-(2 * DAY)),
    },
    {
      key: "gold-ready",
      strategyId: strategies.byId.get("gold-supply-fade")!,
      symbol: "XAUUSD",
      tf: "1h",
      state: "READY",
      score: 84,
      trigger: `1h rejection from supply at ${round(gold + 34, 2).toFixed(2)}`,
      conditions: [
        { label: "Into the supply band", met: true, value: `${round(gold + 34, 2).toFixed(2)}–${round(gold + 52, 2).toFixed(2)}` },
        { label: "10y real yield above 1.35%", met: true, value: "1.56%" },
        { label: "Rejection wick > 60% of range", met: true, value: "71%" },
      ],
      entry: round(gold + 34, 2).toFixed(2),
      stop: round(gold + 62, 2).toFixed(2),
      target: round(gold - 78, 2).toFixed(2),
      detectedAt: at(55 * 60),
      expiresAt: at(-(5 * HOUR)),
    },
    {
      key: "xrp-triggered",
      strategyId: strategies.byId.get("xrp-liquidation-shelf")!,
      symbol: "XRPUSDT",
      tf: "1h",
      state: "TRIGGERED",
      score: 91,
      trigger: `Bid resting above the $38.4M shelf at ${shelf.toFixed(4)}`,
      conditions: [
        { label: "Within 0.5% of the cluster", met: true, value: "0.18% above" },
        { label: "Funding negative at settlement", met: true, value: "−0.0061%" },
        { label: "Open interest down 24h", met: true, value: "−$80.6M" },
      ],
      entry: round(shelf + 0.006, 4).toFixed(4),
      stop: round(shelf - 0.04, 4).toFixed(4),
      target: round(xrp + 0.018, 4).toFixed(4),
      detectedAt: at(52 * 60 + 40),
      expiresAt: at(-(4 * HOUR)),
    },
    {
      key: "xrp-watch",
      strategyId: strategies.byId.get("xrp-liquidation-shelf")!,
      symbol: "XRPUSDT",
      tf: "1h",
      state: "WATCHING",
      score: 52,
      trigger: `Second shelf at ${round(shelf - 0.078, 4).toFixed(4)} · $21.7M stacked`,
      conditions: [
        { label: "Within 0.5% of the cluster", met: false, value: "8.9% above" },
        { label: "Funding negative at settlement", met: true, value: "−0.0061%" },
        { label: "Open interest down 24h", met: true, value: "−$80.6M" },
      ],
      entry: round(shelf - 0.072, 4).toFixed(4),
      stop: round(shelf - 0.118, 4).toFixed(4),
      target: round(shelf + 0.006, 4).toFixed(4),
      detectedAt: at(5 * HOUR),
      expiresAt: at(-(20 * HOUR)),
    },
  ];

  const ids = new Map<string, string>();
  for (const { key, ...data } of specs) {
    const row = await prisma.setup.create({ data });
    ids.set(key, row.id);
  }
  return ids;
}

async function seedProposals(
  accounts: Map<string, string>,
  strategies: StrategyIds,
  setups: Map<string, string>,
) {
  const silver = markOf("XAGUSD");
  const gold = markOf("XAUUSD");
  const xrp = markOf("XRPUSDT");
  const shelf = round(xrp - 0.223, 4);

  // P1 — XRP, clean: every check passes, one click sends it.
  const xrpEntry = round(shelf + 0.006, 4);
  const xrpStop = round(shelf - 0.04, 4);
  const xrpTarget = round(xrp + 0.018, 4);
  const xrpSize = 15000;
  const xrpRisk = round(xrpSize * (xrpEntry - xrpStop), 2);
  await prisma.proposal.create({
    data: {
      strategyId: strategies.byId.get("xrp-liquidation-shelf")!,
      setupId: setups.get("xrp-triggered")!,
      accountId: accounts.get("BloFin Perps")!,
      symbol: "XRPUSDT",
      side: "LONG",
      size: xrpSize.toFixed(6),
      entry: xrpEntry.toFixed(4),
      stop: xrpStop.toFixed(4),
      target: xrpTarget.toFixed(4),
      riskUsd: xrpRisk.toFixed(2),
      rr: ((xrpTarget - xrpEntry) / (xrpEntry - xrpStop)).toFixed(2),
      rationale: `Rest a bid at ${xrpEntry.toFixed(4)}, 0.2% above the $38.4M long-liquidation shelf. Funding has paid longs for six settlements and $80.6M of open interest left in 24h — leverage is leaving while the shelf holds. Stop under the shelf, first target at the plan's ${xrpTarget.toFixed(2)}.`,
      checks: [
        { label: "Funding negative", pass: true, detail: "−0.0061% at the last settlement" },
        { label: "Size within cap", pass: true, detail: "15,000 of 40,000 XRP; book holds 17,000 net" },
        { label: "Risk within 1.5%", pass: true, detail: `$${xrpRisk.toFixed(0)} = ${((xrpRisk / 48220) * 100).toFixed(2)}% of $48,220` },
        { label: "Session allowed", pass: true, detail: "London" },
      ],
      state: "PROPOSED",
      createdAt: at(52 * 60),
      expiresAt: at(-(38 * 60)),
    },
  });

  // P2 — Silver: right setup, wrong book. The size cap blocks it.
  const agEntry = round(silver - 0.2, 3);
  const agStop = round(silver - 1.55, 3);
  const agTarget = round(silver + 1.3, 3);
  const agSize = 0.3;
  const agRisk = round(agSize * 5000 * (agEntry - agStop), 2);
  await prisma.proposal.create({
    data: {
      strategyId: strategies.byId.get("silver-vwap-reclaim")!,
      setupId: setups.get("silver-ready")!,
      accountId: accounts.get("FundedNext 200K")!,
      symbol: "XAGUSD",
      side: "LONG",
      size: agSize.toFixed(6),
      entry: agEntry.toFixed(3),
      stop: agStop.toFixed(3),
      target: agTarget.toFixed(3),
      riskUsd: agRisk.toFixed(2),
      rr: ((agTarget - agEntry) / (agEntry - agStop)).toFixed(2),
      rationale: `4h closed above the weekly VWAP at ${round(silver - 0.42, 3).toFixed(3)} and the prior 4h low held. This is the add level written in the plan, not a new entry. Proposing 0.30 lots on the 200K against the existing 0.55.`,
      checks: [
        { label: "Above weekly VWAP", pass: true, detail: `${silver.toFixed(3)} vs ${round(silver - 0.42, 3).toFixed(3)}` },
        { label: "Size within cap", pass: false, detail: "book holds 0.85 lots against a 1.00 cap — 0.30 would take it to 1.15" },
        { label: "Risk within 1.0%", pass: true, detail: `$${agRisk.toFixed(0)} = ${((agRisk / 207430) * 100).toFixed(2)}% of $207,430` },
        { label: "Session allowed", pass: true, detail: "London" },
      ],
      state: "PROPOSED",
      createdAt: at(2 * HOUR + 20 * 60),
      expiresAt: at(-(6 * HOUR)),
    },
  });

  // P3 — Gold: approved four days ago; it is the open XAUUSD short on the book.
  const auEntry = round(gold + 21.4, 2);
  const auStop = round(gold + 62, 2);
  const auTarget = round(gold - 78, 2);
  const auRisk = round(0.4 * 100 * (auStop - auEntry), 2);
  const filledAt = at(4 * DAY + 9 * HOUR);
  const goldProposal = await prisma.proposal.create({
    data: {
      strategyId: strategies.byId.get("gold-supply-fade")!,
      setupId: null,
      accountId: accounts.get("FundedNext 200K")!,
      symbol: "XAUUSD",
      side: "SHORT",
      size: "0.400000",
      entry: auEntry.toFixed(2),
      stop: auStop.toFixed(2),
      target: auTarget.toFixed(2),
      riskUsd: auRisk.toFixed(2),
      rr: ((auEntry - auTarget) / (auStop - auEntry)).toFixed(2),
      rationale: `Rejection from the ${round(gold + 34, 2).toFixed(2)} supply band on a 71% wick with the 10y real yield at 1.58%. Selling the rejection per the plan; out on a daily close over ${round(gold + 52, 2).toFixed(2)}.`,
      checks: [
        { label: "Into supply", pass: true, detail: "rejection wick 71% of range" },
        { label: "Real yield above 1.35%", pass: true, detail: "1.58%" },
        { label: "Size within cap", pass: true, detail: "0.40 of 0.75 lots" },
        { label: "Risk within 0.75%", pass: true, detail: `$${auRisk.toFixed(0)} = ${((auRisk / 207430) * 100).toFixed(2)}%` },
      ],
      state: "FILLED",
      createdAt: new Date(filledAt.getTime() - 4 * 60 * 1000),
      expiresAt: new Date(filledAt.getTime() + 55 * 60 * 1000),
      decidedAt: new Date(filledAt.getTime() - 20 * 1000),
      executedAt: filledAt,
      fillPrice: round(auEntry - 0.01, 2).toFixed(2),
      venueOrderId: "FN-8842103",
    },
  });
  await prisma.position.updateMany({
    where: { symbol: "XAUUSD", side: "SHORT" },
    data: { proposalId: goldProposal.id },
  });

  // P4 — XRP, rejected yesterday: the plan changed under it.
  await prisma.proposal.create({
    data: {
      strategyId: strategies.byId.get("xrp-liquidation-shelf")!,
      setupId: null,
      accountId: accounts.get("BloFin Perps")!,
      symbol: "XRPUSDT",
      side: "LONG",
      size: "20000.000000",
      entry: round(xrp - 0.072, 4).toFixed(4),
      stop: round(xrp - 0.118, 4).toFixed(4),
      target: round(xrp + 0.16, 4).toFixed(4),
      riskUsd: (20000 * 0.046).toFixed(2),
      rr: (0.232 / 0.046).toFixed(2),
      rationale: "Shelf at 3.49 with $22M stacked and funding at −0.0018%. Thin, but the OI drain supports it.",
      checks: [
        { label: "Funding negative", pass: true, detail: "−0.0018% at proposal time" },
        { label: "Size within cap", pass: true, detail: "20,000 of 40,000 XRP" },
        { label: "Risk within 1.5%", pass: true, detail: "$920 = 1.91% — over" },
      ],
      state: "REJECTED",
      createdAt: at(26 * HOUR + 15 * 60),
      expiresAt: at(25 * HOUR + 15 * 60),
      decidedAt: at(26 * HOUR),
      rejectReason: "Funding flipped positive before the click — off plan by the time it mattered.",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Terminal                                                                     */
/* -------------------------------------------------------------------------- */

type EventSpec = [
  secondsAgo: number,
  source: string,
  kind: "NEWS" | "DATA" | "FLOW" | "SYSTEM" | "AGENT",
  headline: string,
  body: string | null,
  symbols: Symbol_[],
  impact: "HIGH" | "MEDIUM" | "LOW",
  direction: "BULLISH" | "BEARISH" | "NEUTRAL",
];

async function seedTerminal() {
  const xrp = markOf("XRPUSDT");
  const shelf = round(xrp - 0.223, 4);
  const gold = markOf("XAUUSD");

  const events: EventSpec[] = [
    [14 * 60, "Coinglass", "FLOW", "$14.2M of XRP longs liquidated in the last hour", `Cluster at ${round(xrp - 0.04, 2).toFixed(2)} cleared; next stack sits at ${shelf.toFixed(4)}.`, ["XRPUSDT"], "HIGH", "BEARISH"],
    [38 * 60, "BloFin", "SYSTEM", "XRPUSDT funding settled at −0.0061%", "Sixth negative settlement in a row. Shorts are paying longs.", ["XRPUSDT"], "MEDIUM", "BULLISH"],
    [52 * 60, "Agent", "AGENT", `Proposed long XRPUSDT 15,000 at ${round(shelf + 0.006, 4).toFixed(4)} · BloFin Perps`, "XRP Liquidation Shelf. Resting bid 0.2% above the $38.4M shelf. Awaiting approval.", ["XRPUSDT"], "MEDIUM", "NEUTRAL"],
    [70 * 60, "Reuters", "NEWS", "Fed's Waller: case for a September cut has strengthened", "Front-end yields lower on the headline; 10y real yield −4bp on the day.", ["XAUUSD", "XAGUSD"], "HIGH", "BULLISH"],
    [105 * 60, "Bloomberg", "DATA", "10y TIPS yield 1.56%, −0.04 on the week", "Gold fade needs real yields above 1.35% — still holds, margin narrowing.", ["XAUUSD"], "MEDIUM", "BULLISH"],
    [140 * 60, "Agent", "AGENT", "Proposed long XAGUSD 0.30 lots · FundedNext 200K — blocked", "Silver VWAP Reclaim. Book already at 0.85 lots against a 1.00 cap.", ["XAGUSD"], "LOW", "NEUTRAL"],
    [185 * 60, "LBMA", "DATA", "London silver fix 41.42", null, ["XAGUSD"], "LOW", "NEUTRAL"],
    [230 * 60, "Coinglass", "FLOW", "XRP open interest −$80.6M in 24h to $356M", "Leverage coming out while price holds — constructive for the shelf bid.", ["XRPUSDT"], "MEDIUM", "BULLISH"],
    [5 * HOUR, "Reuters", "NEWS", "DXY slips below 96 as euro rallies on the ECB hold", null, ["XAUUSD", "XAGUSD"], "MEDIUM", "BULLISH"],
    [6 * HOUR + 30 * 60, "CFTC", "DATA", "COT: managed money silver net long 32,710, −2,534 w/w", "Commercials covered 2,997. Specs lightening into the move.", ["XAGUSD"], "MEDIUM", "BEARISH"],
    [8 * HOUR, "Reuters", "NEWS", "Ripple: RLUSD supply passes $2B", null, ["XRPUSDT"], "LOW", "BULLISH"],
    [9 * HOUR + 40 * 60, "Bloomberg", "DATA", "US ISM services 52.1 vs 51.0 expected", "Prices paid 58.9. Yields bid on the print.", ["XAUUSD", "XAGUSD"], "MEDIUM", "BEARISH"],
    [11 * HOUR, "BloFin", "SYSTEM", "Maintenance window complete — perps matching resumed", null, ["XRPUSDT"], "LOW", "NEUTRAL"],
    [13 * HOUR, "Reuters", "NEWS", "China August silver imports +18% y/y", "Fourth straight monthly rise; Shanghai physical premium at $1.90/oz.", ["XAGUSD"], "MEDIUM", "BULLISH"],
    [16 * HOUR, "FundedNext", "SYSTEM", "Daily drawdown reset · 200K account used 3.7% of the 5% limit", null, ["XAGUSD", "XAUUSD"], "MEDIUM", "NEUTRAL"],
    [20 * HOUR, "Coinglass", "FLOW", `$9.1M of XRP shorts liquidated on the move through ${round(xrp - 0.06, 2).toFixed(2)}`, null, ["XRPUSDT"], "MEDIUM", "BULLISH"],
    [26 * HOUR, "Agent", "AGENT", "Rejected long XRPUSDT 20,000 — funding flipped positive before approval", null, ["XRPUSDT"], "LOW", "NEUTRAL"],
    [28 * HOUR, "Reuters", "NEWS", `Gold prints record ${round(gold + 44, 0).toLocaleString("en-US")} before fading into the London close`, null, ["XAUUSD"], "HIGH", "BEARISH"],
    [30 * HOUR, "Bloomberg", "DATA", "US jobless claims 231K vs 229K expected", null, ["XAUUSD"], "LOW", "NEUTRAL"],
  ];

  await prisma.terminalEvent.createMany({
    data: events.map(([secondsAgo, source, kind, headline, body, symbols, impact, direction]) => ({
      time: at(secondsAgo),
      source,
      kind,
      headline,
      body,
      symbols,
      impact,
      direction,
      positionIds: [],
    })),
  });
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                  */
/* -------------------------------------------------------------------------- */

async function main() {
  // Order matters: children before parents.
  await prisma.terminalEvent.deleteMany();
  await prisma.annotation.deleteMany();
  await prisma.positioningSnapshot.deleteMany();
  await prisma.candle.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.setup.deleteMany();
  await prisma.strategy.deleteMany();
  await prisma.position.deleteMany();
  await prisma.account.deleteMany();

  const accounts = await seedAccounts();
  const candleCount = await seedCandles();
  await seedPlans();
  await seedPositions(accounts);
  const strategies = await seedStrategies();
  const setups = await seedSetups(strategies);
  await seedProposals(accounts, strategies, setups);
  await seedTrades(accounts, strategies.bySymbol);
  await seedPerpPositioning();
  await seedMetalPositioning();
  await seedAnnotations();
  await seedTerminal();

  const counts = {
    accounts: await prisma.account.count(),
    positions: await prisma.position.count(),
    trades: await prisma.trade.count(),
    plans: await prisma.plan.count(),
    candles: candleCount,
    annotations: await prisma.annotation.count(),
    positioningSnapshots: await prisma.positioningSnapshot.count(),
    strategies: await prisma.strategy.count(),
    setups: await prisma.setup.count(),
    proposals: await prisma.proposal.count(),
    terminalEvents: await prisma.terminalEvent.count(),
  };

  console.log("seeded", counts);
  console.log(
    "marks",
    Object.fromEntries(SYMBOLS.map((s) => [s, markOf(s)])),
    "last bar",
    new Date(floorToTf(NOW_S, "1h") * 1000).toISOString(),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
