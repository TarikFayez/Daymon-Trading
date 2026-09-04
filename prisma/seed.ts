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

const CONTRACT_VALUE: Record<Symbol_, number> = {
  XAGUSD: 5000,
  XAUUSD: 100,
  XRPUSDT: 1,
};

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
  windowStart: Date,
  windowEnd: Date,
): Prisma.TradeCreateManyInput[] {
  const span = windowEnd.getTime() - windowStart.getTime();

  return specs.map((spec, i) => {
    const cv = CONTRACT_VALUE[spec.symbol];
    const meta = SYMBOL_META[spec.symbol];
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
    };
  });
}

async function seedTrades(accounts: Map<string, string>) {
  const monthStart = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));
  const prevMonthStart = new Date(
    Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 1, 1),
  );

  await prisma.trade.createMany({
    data: [
      ...tradeRows(LAST_MONTH, accounts, prevMonthStart, monthStart),
      ...tradeRows(THIS_MONTH, accounts, monthStart, NOW),
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
/* Entry point                                                                  */
/* -------------------------------------------------------------------------- */

async function main() {
  // Order matters: children before parents.
  await prisma.annotation.deleteMany();
  await prisma.positioningSnapshot.deleteMany();
  await prisma.candle.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.position.deleteMany();
  await prisma.account.deleteMany();

  const accounts = await seedAccounts();
  const candleCount = await seedCandles();
  await seedPlans();
  await seedPositions(accounts);
  await seedTrades(accounts);
  await seedPerpPositioning();
  await seedMetalPositioning();
  await seedAnnotations();

  const counts = {
    accounts: await prisma.account.count(),
    positions: await prisma.position.count(),
    trades: await prisma.trade.count(),
    plans: await prisma.plan.count(),
    candles: candleCount,
    annotations: await prisma.annotation.count(),
    positioningSnapshots: await prisma.positioningSnapshot.count(),
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
