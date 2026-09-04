import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type ChartOptions,
  type DeepPartial,
} from "lightweight-charts";

/** The palette, duplicated here because canvas cannot read CSS custom properties. */
export const CHART_COLORS = {
  canvas: "#0d0d0d",
  surface: "#1c1c1e",
  raised: "#2c2c2e",
  ink: "#ffffff",
  muted: "#8e8e93",
  faint: "#636366",
  up: "#19c37d",
  down: "#ff5c5c",
} as const;

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif';

/**
 * Chart chrome matched to the panel: no grid, no scale borders, muted labels.
 * Green and red appear on the candles and nowhere else.
 */
export function chartOptions(): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: CHART_COLORS.surface },
      textColor: CHART_COLORS.muted,
      fontFamily: FONT,
      fontSize: 11,
      attributionLogo: false,
      panes: {
        separatorColor: CHART_COLORS.raised,
        separatorHoverColor: CHART_COLORS.faint,
        enableResize: false,
      },
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: false },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.12, bottom: 0.08 },
      entireTextOnly: true,
    },
    timeScale: {
      borderVisible: false,
      rightOffset: 4,
      barSpacing: 7,
      minBarSpacing: 1,
      fixLeftEdge: true,
      lockVisibleTimeRangeOnResize: true,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: CHART_COLORS.faint,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: CHART_COLORS.raised,
      },
      horzLine: {
        color: CHART_COLORS.faint,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: CHART_COLORS.raised,
      },
    },
    handleScale: { axisPressedMouseMove: { time: true, price: false } },
    autoSize: false,
  };
}

export const candleSeriesOptions = (precision: number) => ({
  upColor: CHART_COLORS.up,
  downColor: CHART_COLORS.down,
  wickUpColor: CHART_COLORS.up,
  wickDownColor: CHART_COLORS.down,
  borderVisible: false,
  priceLineVisible: false,
  lastValueVisible: true,
  priceFormat: {
    type: "price" as const,
    precision,
    minMove: 1 / 10 ** precision,
  },
});

export const volumeSeriesOptions = {
  priceFormat: { type: "volume" as const },
  priceLineVisible: false,
  lastValueVisible: false,
};

/** Volume bars take the candle colour at 45% so they never compete with price. */
export const VOLUME_UP = "#19c37d73";
export const VOLUME_DOWN = "#ff5c5c73";
