"use client";

import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DrawingManager, IDrawing } from "lightweight-charts-drawing";
import { useEffect, useRef } from "react";

import type { AnnotationItem } from "@/lib/annotations";
import { anchoredVwap, ema } from "@/lib/indicators";
import type { OHLCV } from "@/lib/mock/candles";
import {
  buildDrawing,
  createAnnotationLayer,
  renderAnnotations,
} from "@/components/chart/annotationRenderer";
import {
  CHART_COLORS,
  VOLUME_DOWN,
  VOLUME_UP,
  candleSeriesOptions,
  chartOptions,
  volumeSeriesOptions,
} from "@/components/chart/theme";

/** A place on the chart in domain units. `index` may sit past the last bar. */
export type ChartPoint = { time: number; price: number; index: number };

export type Overlays = { ema20: boolean; vwap: boolean };

export type CandleChartProps = {
  candles: OHLCV[];
  annotations: AnnotationItem[];
  /** The drawing in progress, rendered on top of everything else. */
  draft?: AnnotationItem | null;
  precision: number;
  /** Changing this refits the visible range — a new symbol should not inherit the old zoom. */
  seriesKey: string;
  overlays: Overlays;
  /** Bar under the crosshair, or null when the pointer leaves the chart. */
  onHover?: (bar: OHLCV | null) => void;
  /** A click in the price pane, in domain units. */
  onPoint?: (point: ChartPoint) => void;
  /** Pointer movement in the price pane, for rubber-banding a two-point drawing. */
  onMove?: (point: ChartPoint | null) => void;
};

const VISIBLE_BARS = 140;

/**
 * Candles on top, volume in its own pane below, annotations drawn over both,
 * sized to whatever box it is put in.
 *
 * The chart instance is created once and kept: symbol and timeframe changes push
 * new data into the existing series rather than tearing the canvas down.
 */
export function CandleChart({
  candles,
  annotations,
  draft = null,
  precision,
  seriesKey,
  overlays,
  onHover,
  onPoint,
  onMove,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const layerRef = useRef<DrawingManager | null>(null);
  const draftRef = useRef<IDrawing | null>(null);

  // Latest data and callbacks, readable from subscriptions made once on mount.
  const candlesRef = useRef(candles);
  const precisionRef = useRef(precision);
  const handlersRef = useRef({ onHover, onPoint, onMove });
  candlesRef.current = candles;
  precisionRef.current = precision;
  handlersRef.current = { onHover, onPoint, onMove };

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      ...chartOptions(),
      autoSize: true,
      timeScale: { ...chartOptions().timeScale, timeVisible: true, secondsVisible: false },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, candleSeriesOptions(2));
    const volumeSeries = chart.addSeries(HistogramSeries, volumeSeriesOptions, 1);

    const panes = chart.panes();
    panes[0]?.setStretchFactor(78);
    panes[1]?.setStretchFactor(22);

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    layerRef.current = createAnnotationLayer(chart, candleSeries, container);

    /** Logical bar index + price → domain units. The index may sit past the last bar. */
    const fromLogical = (logical: number, price: number): ChartPoint | null => {
      const bars = candlesRef.current;
      if (bars.length === 0) return null;
      const index = Math.round(logical);
      const last = bars.length - 1;
      const step = bars.length > 1 ? bars[1].time - bars[0].time : 3600;
      const time =
        index < 0
          ? bars[0].time + index * step
          : index > last
            ? bars[last].time + (index - last) * step
            : bars[index].time;
      return { time, price, index };
    };

    const onCrosshair = (param: MouseEventParams) => {
      const bars = candlesRef.current;
      const logical = param.logical;
      const bar =
        logical !== undefined && logical >= 0 && logical < bars.length
          ? bars[Math.round(logical as number)]
          : null;
      handlersRef.current.onHover?.(param.point ? bar : null);

      let point: ChartPoint | null = null;
      if (param.point && param.paneIndex === 0 && logical !== undefined) {
        const price = candleSeries.coordinateToPrice(param.point.y);
        if (price !== null) point = fromLogical(logical as number, price);
      }
      handlersRef.current.onMove?.(point);
    };
    chart.subscribeCrosshairMove(onCrosshair);

    // Clicks come from the container, not `subscribeClick`: the library drops
    // any mouseup that lands inside its double-click window at a different
    // spot, which is exactly what placing two points quickly looks like.
    let down: { x: number; y: number; at: number } | null = null;
    const relative = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = { ...relative(e), at: Date.now() };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!down) return;
      const up = relative(e);
      const moved = Math.abs(up.x - down.x) + Math.abs(up.y - down.y);
      const held = Date.now() - down.at;
      down = null;
      // A drag scrolls the chart; a long press is not a placement.
      if (moved > 4 || held > 600) return;

      const pane = chart.paneSize(0);
      if (up.x < 0 || up.y < 0 || up.x >= pane.width || up.y >= pane.height) return;
      const logical = chart.timeScale().coordinateToLogical(up.x);
      const price = candleSeries.coordinateToPrice(up.y);
      if (logical === null || price === null) return;
      const point = fromLogical(logical as number, price);
      if (point) handlersRef.current.onPoint?.(point);
    };
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      layerRef.current?.detach();
      layerRef.current = null;
      draftRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      emaRef.current = null;
      vwapRef.current = null;
    };
  }, []);

  // Push data whenever the series changes.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const volumeSeries = volumeRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    candleSeries.applyOptions(candleSeriesOptions(precision));

    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData: HistogramData<Time>[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? VOLUME_UP : VOLUME_DOWN,
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);
    emaRef.current?.setData(ema(candles, 20).map(asLine));
    vwapRef.current?.setData(anchoredVwap(candles, "week").map(asLine));

    // 300 bars crushed into a phone width is unreadable. Open on the last
    // stretch; the rest is still there to scroll back into.
    const visible = Math.min(VISIBLE_BARS, candleData.length);
    chart.timeScale().setVisibleLogicalRange({
      from: candleData.length - visible,
      to: candleData.length + 4,
    });
  }, [candles, precision, seriesKey]);

  // Indicator overlays: created when switched on, removed when switched off.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (overlays.ema20 && !emaRef.current) {
      emaRef.current = chart.addSeries(LineSeries, {
        color: CHART_COLORS.muted,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      emaRef.current.setData(ema(candles, 20).map(asLine));
    } else if (!overlays.ema20 && emaRef.current) {
      chart.removeSeries(emaRef.current);
      emaRef.current = null;
    }

    if (overlays.vwap && !vwapRef.current) {
      vwapRef.current = chart.addSeries(LineSeries, {
        color: CHART_COLORS.ink,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      vwapRef.current.setData(anchoredVwap(candles, "week").map(asLine));
    } else if (!overlays.vwap && vwapRef.current) {
      chart.removeSeries(vwapRef.current);
      vwapRef.current = null;
    }
  }, [overlays, candles]);

  // Redraw the annotation layer whenever the drawings change.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || candles.length === 0) return;
    renderAnnotations(layer, annotations, {
      firstTime: candles[0].time,
      lastTime: candles[candles.length - 1].time,
      precision,
    });
  }, [annotations, candles, precision]);

  // The in-progress drawing lives outside the manager so it can be swapped on
  // every pointer move without rebuilding the saved ones.
  useEffect(() => {
    const series = candleRef.current;
    if (!series || candles.length === 0) return;

    if (draftRef.current) {
      series.detachPrimitive(draftRef.current);
      draftRef.current = null;
    }
    if (draft) {
      const drawing = buildDrawing(draft, "draft", {
        firstTime: candles[0].time,
        lastTime: candles[candles.length - 1].time,
        precision,
      });
      if (drawing) {
        series.attachPrimitive(drawing);
        draftRef.current = drawing;
      }
    }
  }, [draft, candles, precision]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

function asLine(p: { time: number; value: number }) {
  return { time: p.time as UTCTimestamp, value: p.value };
}

export default CandleChart;
