import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import {
  DrawingManager,
  type Anchor,
  type DrawingStyle,
  type IDrawing,
} from "lightweight-charts-drawing";

import type { AnnotationItem } from "@/lib/annotations";
import { CHART_COLORS } from "@/components/chart/theme";
import { Fib, NoteCard, PriceLine, Trend, Zone } from "@/components/chart/drawings";

/**
 * The annotation renderer.
 *
 * Takes the annotation JSON (see `src/lib/annotations.ts`) and draws it. This is
 * the only place that knows how an annotation type becomes pixels — the API, the
 * database and the seed all speak the JSON and nothing else.
 */

export type RenderContext = {
  /** First and last bar times, used to span zones with no explicit bounds. */
  firstTime: number;
  lastTime: number;
  /** Price decimals for the symbol on screen. */
  precision: number;
};

function style(color: string, width = 1): Partial<DrawingStyle> {
  return { lineColor: color, lineWidth: width, showLabels: true, labelColor: color };
}

function anchor(point: { time: number; price: number }): Anchor {
  return { time: point.time as Time, price: point.price };
}

/** One annotation item → one drawing. Returns null for anything unrenderable. */
export function buildDrawing(
  item: AnnotationItem,
  id: string,
  ctx: RenderContext,
): IDrawing | null {
  switch (item.type) {
    case "hline":
      return PriceLine.of(
        id,
        item.price,
        ctx.lastTime,
        style(item.color ?? CHART_COLORS.ink),
        { label: item.label, precision: ctx.precision, visible: true },
      );

    case "trendline":
      return new Trend(
        id,
        [anchor(item.from), anchor(item.to)],
        style(item.color ?? CHART_COLORS.ink, 1.5),
        { label: item.label, visible: true, extendRight: true },
      );

    case "fib":
      return new Fib(
        id,
        [anchor(item.from), anchor(item.to)],
        style(item.color ?? CHART_COLORS.muted),
        { precision: ctx.precision, visible: true },
      );

    case "zone": {
      const top = Math.max(item.priceTop, item.priceBottom);
      const bottom = Math.min(item.priceTop, item.priceBottom);
      return new Zone(
        id,
        [
          anchor({ time: item.fromTime ?? ctx.firstTime, price: top }),
          anchor({ time: item.toTime ?? ctx.lastTime, price: bottom }),
        ],
        { ...style(item.color ?? CHART_COLORS.muted), fillOpacity: 0.12 },
        { label: item.label, visible: true },
      );
    }

    case "note":
      return new NoteCard(
        id,
        [anchor(item)],
        style(item.color ?? CHART_COLORS.ink),
        { text: item.text, visible: true },
      );

    default:
      return null;
  }
}

/**
 * Replace everything on the drawing layer with `items`. Called on mount and on
 * every symbol or timeframe change.
 */
export function renderAnnotations(
  manager: DrawingManager,
  items: AnnotationItem[],
  ctx: RenderContext,
): number {
  manager.clearAll();

  let drawn = 0;
  items.forEach((item, i) => {
    const drawing = buildDrawing(item, `ann-${i}-${item.type}`, ctx);
    if (!drawing) return;
    manager.addDrawing(drawing);
    drawn += 1;
  });
  return drawn;
}

/** Attach a fresh manager to a chart/series pair. */
export function createAnnotationLayer(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  container: HTMLElement,
): DrawingManager {
  const manager = new DrawingManager();
  manager.attach(chart, series, container);
  // Read-only in this phase: drawings come from the API, not from the mouse.
  manager.setActiveTool(null);
  return manager;
}
