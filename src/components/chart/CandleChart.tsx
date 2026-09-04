"use client";

import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DrawingManager } from "lightweight-charts-drawing";
import { useEffect, useRef } from "react";

import type { AnnotationItem } from "@/lib/annotations";
import type { OHLCV } from "@/lib/mock/candles";
import {
  createAnnotationLayer,
  renderAnnotations,
} from "@/components/chart/annotationRenderer";
import {
  VOLUME_DOWN,
  VOLUME_UP,
  candleSeriesOptions,
  chartOptions,
  volumeSeriesOptions,
} from "@/components/chart/theme";

const PRICE_PANE_HEIGHT = 340;
const VISIBLE_BARS = 110;
const VOLUME_PANE_HEIGHT = 96;

export type CandleChartProps = {
  candles: OHLCV[];
  annotations: AnnotationItem[];
  precision: number;
  /** Changing this refits the visible range — a new symbol should not inherit the old zoom. */
  seriesKey: string;
};

/**
 * Candles on top, volume in its own pane below, annotations drawn over both.
 *
 * The chart instance is created once and kept: symbol and timeframe changes push
 * new data into the existing series rather than tearing the canvas down.
 */
export function CandleChart({
  candles,
  annotations,
  precision,
  seriesKey,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const layerRef = useRef<DrawingManager | null>(null);

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      ...chartOptions(),
      width: container.clientWidth,
      height: PRICE_PANE_HEIGHT + VOLUME_PANE_HEIGHT,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, candleSeriesOptions(2));
    const volumeSeries = chart.addSeries(HistogramSeries, volumeSeriesOptions, 1);

    const panes = chart.panes();
    panes[0]?.setHeight(PRICE_PANE_HEIGHT);
    panes[1]?.setHeight(VOLUME_PANE_HEIGHT);

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    layerRef.current = createAnnotationLayer(chart, candleSeries, container);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width: Math.floor(width) });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      layerRef.current?.detach();
      layerRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
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

    // 300 bars crushed into a phone width is unreadable. Open on the last
    // stretch; the rest is still there to scroll back into.
    const visible = Math.min(VISIBLE_BARS, candleData.length);
    chart.timeScale().setVisibleLogicalRange({
      from: candleData.length - visible,
      to: candleData.length + 3,
    });
  }, [candles, precision, seriesKey]);

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

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: PRICE_PANE_HEIGHT + VOLUME_PANE_HEIGHT }}
    />
  );
}

export default CandleChart;
