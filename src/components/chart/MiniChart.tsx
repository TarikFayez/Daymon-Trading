"use client";

import {
  AreaSeries,
  ColorType,
  LineStyle,
  createChart,
  type AreaData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import { CHART_COLORS } from "@/components/chart/theme";
import type { MetricPoint } from "@/lib/providers/types";

export type MiniChartProps = {
  points: MetricPoint[];
  height?: number;
  /** Draw a dashed line at zero — funding is only meaningful either side of it. */
  zeroLine?: boolean;
  label?: string;
};

/**
 * A white line on a flat wash, no axes, no crosshair, no grid. Used for the card
 * sparklines and for the funding / open-interest series.
 */
export function MiniChart({ points, height = 44, zeroLine = false, label }: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: CHART_COLORS.muted,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScroll: false,
      handleScale: false,
      kineticScroll: { mouse: false, touch: false },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: CHART_COLORS.ink,
      lineWidth: 2,
      // Flat wash, not a gradient — the design has no gradients anywhere.
      topColor: "#ffffff14",
      bottomColor: "#ffffff14",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width: Math.floor(width) });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const data: AreaData<Time>[] = points.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    series.setData(data);

    if (zeroLine) {
      series.createPriceLine({
        price: 0,
        color: CHART_COLORS.faint,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    }

    chart.timeScale().fitContent();
  }, [points, zeroLine]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={label}
    />
  );
}

export default MiniChart;
