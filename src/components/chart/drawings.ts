/**
 * DAYEMON drawing primitives.
 *
 * `lightweight-charts-drawing` supplies the framework — the `Drawing` base with
 * its anchor/pixel maths, hit testing and primitive lifecycle, plus the
 * `DrawingManager` that attaches the layer to a series. The renderers below are
 * ours, because the shipped ones paint TradingView's palette (blue, orange,
 * purple fib levels) and hardcode two decimal places, and this dashboard has
 * exactly one rule about colour: green and red mean PnL, targets, invalidation
 * and candles. Nothing else gets to be coloured.
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Time,
} from "lightweight-charts";
import {
  Drawing,
  distanceToLineSegment,
  type Anchor,
  type DrawingOptions,
  type DrawingStyle,
  type Geometry,
  type IDrawing,
  type Point,
  type Viewport,
} from "lightweight-charts-drawing";

import { FIB_LEVELS } from "@/lib/annotations";
import { CHART_COLORS } from "@/components/chart/theme";

/** The renderer target, without reaching into lightweight-charts' internals. */
type RenderTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];
type BitmapScope = {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
};

const HIT_THRESHOLD = 6;
const LABEL_FONT = (size: number) =>
  `${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;

/* -------------------------------------------------------------------------- */
/* Canvas helpers                                                               */
/* -------------------------------------------------------------------------- */

function strokeLine(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  ratio: number,
  dash: number[] = [],
) {
  ctx.save();
  ctx.setLineDash(dash.map((d) => d * ratio));
  ctx.beginPath();
  ctx.moveTo(a.x * ratio, a.y * ratio);
  ctx.lineTo(b.x * ratio, b.y * ratio);
  ctx.stroke();
  ctx.restore();
}

/**
 * A label chip: raised background, coloured text, 11px. `align` decides which
 * side of `x` it grows from, so nothing is ever clipped by the price scale.
 */
function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { color: string; ratio: number; align: "left" | "right"; size?: number },
) {
  const { color, ratio, align } = opts;
  const size = opts.size ?? 11;
  const padX = 5 * ratio;
  const padY = 3 * ratio;

  ctx.save();
  ctx.font = LABEL_FONT(size * ratio);
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width;
  const boxW = width + padX * 2;
  const boxH = size * ratio + padY * 2;
  const left = align === "left" ? x * ratio : x * ratio - boxW;
  const top = y * ratio - boxH / 2;

  ctx.fillStyle = CHART_COLORS.raised;
  ctx.globalAlpha = 0.94;
  roundRect(ctx, left, top, boxW, boxH, 4 * ratio);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.fillText(text, left + padX, top + boxH / 2);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fmt(value: number, precision: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/** Wrap `paint` into the pane-view/renderer pair lightweight-charts expects. */
function paneView(
  paint: (scope: BitmapScope, viewport: Viewport) => void,
  drawing: Drawing,
  zOrder: "bottom" | "normal" | "top" = "normal",
): IPrimitivePaneView {
  const renderer: IPrimitivePaneRenderer = {
    draw(target: RenderTarget) {
      const viewport = drawing.getViewport();
      if (!viewport || !drawing.options.visible) return;
      target.useBitmapCoordinateSpace((scope) => {
        paint(scope as BitmapScope, viewport);
      });
    },
  };
  return {
    zOrder: () => zOrder,
    renderer: () => renderer,
  };
}

/* -------------------------------------------------------------------------- */
/* Price line                                                                   */
/* -------------------------------------------------------------------------- */

export type PriceLineOptions = DrawingOptions & {
  label?: string;
  precision?: number;
};

/**
 * A horizontal level with its label on the left, where there is room on a phone,
 * instead of under the price scale.
 */
export class PriceLine extends Drawing {
  readonly type = "dayemon-price-line";
  private readonly _lineOptions: PriceLineOptions;

  constructor(
    id: string,
    anchors: Anchor[],
    style: Partial<DrawingStyle>,
    options: PriceLineOptions,
  ) {
    const { label, precision, ...rest } = options;
    super(id, anchors, style, rest);
    this._lineOptions = { label, precision, ...rest };
  }

  static of(
    id: string,
    price: number,
    time: number,
    style: Partial<DrawingStyle>,
    options: PriceLineOptions,
  ): PriceLine {
    return new PriceLine(id, [{ time: time as Time, price }], style, options);
  }

  isValid(): boolean {
    return this._anchors.length >= 1;
  }

  private y(viewport: Viewport): number | null {
    return viewport.priceScale.priceToCoordinate(this._anchors[0].price);
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      paneView((scope, viewport) => {
        const y = this.y(viewport);
        if (y === null) return;
        const { context: ctx, horizontalPixelRatio: ratio } = scope;
        const color = this.style.lineColor;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = this.style.lineWidth * ratio;
        strokeLine(ctx, { x: 0, y }, { x: viewport.width, y }, ratio, [6, 4]);
        ctx.restore();

        const price = fmt(this._anchors[0].price, this._lineOptions.precision ?? 2);
        const text = this._lineOptions.label
          ? `${this._lineOptions.label} · ${price}`
          : price;
        chip(ctx, text, 6, y, { color, ratio, align: "left" });
      }, this),
    ];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    const y = this.y(viewport);
    if (y === null) return [];
    return [
      { type: "line", start: { x: 0, y }, end: { x: viewport.width, y } },
    ];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const y = this.y(viewport);
    return y !== null && Math.abs(point.y - y) <= HIT_THRESHOLD;
  }

  clone(newId: string): IDrawing {
    return new PriceLine(newId, [...this._anchors], this._style, this._lineOptions);
  }
}

/* -------------------------------------------------------------------------- */
/* Trend line                                                                   */
/* -------------------------------------------------------------------------- */

export type TrendOptions = DrawingOptions & { label?: string };

export class Trend extends Drawing {
  readonly type = "dayemon-trend";
  private readonly _trendOptions: TrendOptions;

  constructor(
    id: string,
    anchors: Anchor[],
    style: Partial<DrawingStyle>,
    options: TrendOptions,
  ) {
    const { label, ...rest } = options;
    super(id, anchors, style, rest);
    this._trendOptions = { label, ...rest };
  }

  isValid(): boolean {
    return this._anchors.length >= 2;
  }

  private points(viewport: Viewport): [Point, Point] | null {
    const a = this.anchorToPixel(this._anchors[0], viewport);
    const b = this.anchorToPixel(this._anchors[1], viewport);
    if (!a || !b) return null;
    if (!this._options.extendRight) return [a, b];

    // Extend to the right edge along the same slope, so a line drawn on old bars
    // still says something about where price is now.
    const dx = b.x - a.x;
    if (dx <= 0) return [a, b];
    const slope = (b.y - a.y) / dx;
    return [a, { x: viewport.width, y: b.y + slope * (viewport.width - b.x) }];
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      paneView((scope, viewport) => {
        const pts = this.points(viewport);
        if (!pts) return;
        const { context: ctx, horizontalPixelRatio: ratio } = scope;
        const [a, b] = pts;

        ctx.save();
        ctx.strokeStyle = this.style.lineColor;
        ctx.lineWidth = this.style.lineWidth * ratio;
        ctx.lineCap = "round";
        strokeLine(ctx, a, b, ratio);
        ctx.restore();

        if (this._trendOptions.label) {
          chip(ctx, this._trendOptions.label, b.x - 6, b.y - 12, {
            color: this.style.lineColor,
            ratio,
            align: "right",
          });
        }
      }, this),
    ];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    const pts = this.points(viewport);
    return pts ? [{ type: "line", start: pts[0], end: pts[1] }] : [];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const pts = this.points(viewport);
    return pts !== null && distanceToLineSegment(point, pts[0], pts[1]) <= HIT_THRESHOLD;
  }

  clone(newId: string): IDrawing {
    return new Trend(newId, [...this._anchors], this._style, this._trendOptions);
  }
}

/* -------------------------------------------------------------------------- */
/* Fibonacci retracement                                                        */
/* -------------------------------------------------------------------------- */

export type FibOptions = DrawingOptions & { precision?: number };

/**
 * 0.382 / 0.5 / 0.618 of the swing, all in one colour, labelled with the level
 * and the price it sits at.
 */
export class Fib extends Drawing {
  readonly type = "dayemon-fib";
  private readonly _fibOptions: FibOptions;

  constructor(
    id: string,
    anchors: Anchor[],
    style: Partial<DrawingStyle>,
    options: FibOptions,
  ) {
    const { precision, ...rest } = options;
    super(id, anchors, style, rest);
    this._fibOptions = { precision, ...rest };
  }

  isValid(): boolean {
    return this._anchors.length >= 2;
  }

  private levels(): { ratio: number; price: number }[] {
    const [low, high] = this._anchors;
    const span = high.price - low.price;
    return FIB_LEVELS.map((ratio) => ({
      ratio,
      price: high.price - span * ratio,
    }));
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      paneView((scope, viewport) => {
        const from = this.anchorToPixel(this._anchors[0], viewport);
        const to = this.anchorToPixel(this._anchors[1], viewport);
        if (!from || !to) return;

        const { context: ctx, horizontalPixelRatio: ratio } = scope;
        const color = this.style.lineColor;
        const left = Math.min(from.x, to.x);
        const precision = this._fibOptions.precision ?? 2;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 * ratio;

        // The swing itself, faint, so the retracement has something to hang off.
        ctx.globalAlpha = 0.35;
        strokeLine(ctx, from, to, ratio, [3, 3]);
        ctx.globalAlpha = 1;

        for (const level of this.levels()) {
          const y = viewport.priceScale.priceToCoordinate(level.price);
          if (y === null) continue;
          strokeLine(ctx, { x: left, y }, { x: viewport.width, y }, ratio, [2, 3]);
        }
        ctx.restore();

        for (const level of this.levels()) {
          const y = viewport.priceScale.priceToCoordinate(level.price);
          if (y === null) continue;
          chip(
            ctx,
            `${(level.ratio * 100).toFixed(1)}% · ${fmt(level.price, precision)}`,
            viewport.width - 6,
            y,
            { color, ratio, align: "right", size: 10 },
          );
        }
      }, this),
    ];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    const out: Geometry[] = [];
    for (const level of this.levels()) {
      const y = viewport.priceScale.priceToCoordinate(level.price);
      if (y === null) continue;
      out.push({ type: "line", start: { x: 0, y }, end: { x: viewport.width, y } });
    }
    return out;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    return this.levels().some((level) => {
      const y = viewport.priceScale.priceToCoordinate(level.price);
      return y !== null && Math.abs(point.y - y) <= HIT_THRESHOLD;
    });
  }

  clone(newId: string): IDrawing {
    return new Fib(newId, [...this._anchors], this._style, this._fibOptions);
  }
}

/* -------------------------------------------------------------------------- */
/* Zone                                                                         */
/* -------------------------------------------------------------------------- */

export type ZoneOptions = DrawingOptions & { label?: string };

/** A filled price band. Drawn under the candles so it never hides a wick. */
export class Zone extends Drawing {
  readonly type = "dayemon-zone";
  private readonly _zoneOptions: ZoneOptions;

  constructor(
    id: string,
    anchors: Anchor[],
    style: Partial<DrawingStyle>,
    options: ZoneOptions,
  ) {
    const { label, ...rest } = options;
    super(id, anchors, style, rest);
    this._zoneOptions = { label, ...rest };
  }

  isValid(): boolean {
    return this._anchors.length >= 2;
  }

  private box(viewport: Viewport): { x: number; y: number; w: number; h: number } | null {
    const a = this.anchorToPixel(this._anchors[0], viewport);
    const b = this.anchorToPixel(this._anchors[1], viewport);
    if (!a || !b) return null;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      paneView((scope, viewport) => {
        const box = this.box(viewport);
        if (!box) return;
        const { context: ctx, horizontalPixelRatio: ratio } = scope;
        const color = this.style.lineColor;

        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = this.style.fillOpacity ?? 0.12;
        ctx.fillRect(box.x * ratio, box.y * ratio, box.w * ratio, box.h * ratio);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 * ratio;
        strokeLine(ctx, { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, ratio, [4, 4]);
        strokeLine(
          ctx,
          { x: box.x, y: box.y + box.h },
          { x: box.x + box.w, y: box.y + box.h },
          ratio,
          [4, 4],
        );
        ctx.restore();

        if (this._zoneOptions.label) {
          chip(ctx, this._zoneOptions.label, box.x + 6, box.y + 10, {
            color,
            ratio,
            align: "left",
            size: 10,
          });
        }
      }, this, "bottom"),
    ];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    const box = this.box(viewport);
    return box
      ? [{ type: "rectangle", topLeft: { x: box.x, y: box.y }, width: box.w, height: box.h }]
      : [];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport);
    if (!box) return false;
    return (
      point.x >= box.x &&
      point.x <= box.x + box.w &&
      point.y >= box.y &&
      point.y <= box.y + box.h
    );
  }

  clone(newId: string): IDrawing {
    return new Zone(newId, [...this._anchors], this._style, this._zoneOptions);
  }
}

/* -------------------------------------------------------------------------- */
/* Note                                                                         */
/* -------------------------------------------------------------------------- */

export type NoteDrawingOptions = DrawingOptions & { text: string; width?: number };

/** A wrapped text card with a leader line down to the bar it is about. */
export class NoteCard extends Drawing {
  readonly type = "dayemon-note";
  private readonly _noteOptions: NoteDrawingOptions;

  constructor(
    id: string,
    anchors: Anchor[],
    style: Partial<DrawingStyle>,
    options: NoteDrawingOptions,
  ) {
    const { text, width, ...rest } = options;
    super(id, anchors, style, rest);
    this._noteOptions = { text, width, ...rest };
  }

  isValid(): boolean {
    return this._anchors.length >= 1 && this._noteOptions.text.length > 0;
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      paneView((scope, viewport) => {
        const anchor = this.anchorToPixel(this._anchors[0], viewport);
        if (!anchor) return;

        const { context: ctx, horizontalPixelRatio: ratio } = scope;
        const color = this.style.lineColor;
        const boxW = Math.min(this._noteOptions.width ?? 168, viewport.width - 24);
        const padding = 8;
        const lineHeight = 13;

        ctx.save();
        ctx.font = LABEL_FONT(10.5 * ratio);
        const lines = wrap(ctx, this._noteOptions.text, (boxW - padding * 2) * ratio);
        const boxH = lines.length * lineHeight + padding * 2;

        // Keep the card inside the pane, and above the point it refers to.
        const x = Math.min(Math.max(anchor.x - boxW / 2, 8), viewport.width - boxW - 8);
        const y = Math.max(anchor.y - boxH - 16, 6);

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1 * ratio;
        strokeLine(ctx, { x: anchor.x, y: anchor.y }, { x: anchor.x, y: y + boxH }, ratio, [2, 3]);
        ctx.globalAlpha = 1;

        ctx.fillStyle = CHART_COLORS.raised;
        ctx.globalAlpha = 0.95;
        roundRect(ctx, x * ratio, y * ratio, boxW * ratio, boxH * ratio, 6 * ratio);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
          ctx.fillText(
            line,
            (x + padding) * ratio,
            (y + padding + i * lineHeight) * ratio,
          );
        });
        ctx.restore();
      }, this, "top"),
    ];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    const anchor = this.anchorToPixel(this._anchors[0], viewport);
    return anchor
      ? [{ type: "text", position: anchor, text: this._noteOptions.text }]
      : [];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchorToPixel(this._anchors[0], viewport);
    if (!anchor) return false;
    return (
      Math.abs(point.x - anchor.x) <= HIT_THRESHOLD * 2 &&
      Math.abs(point.y - anchor.y) <= HIT_THRESHOLD * 2
    );
  }

  clone(newId: string): IDrawing {
    return new NoteCard(newId, [...this._anchors], this._style, this._noteOptions);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [text];
}
