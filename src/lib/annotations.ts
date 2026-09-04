/**
 * The annotation JSON contract.
 *
 * This is the only shape the chart's renderer understands, and the only shape
 * POST /api/annotations accepts. Times are unix seconds, UTC — the same units
 * lightweight-charts uses for `UTCTimestamp`, so nothing has to be converted on
 * the way to the canvas.
 */

export type AnnotationPoint = {
  time: number;
  price: number;
};

export type HLineItem = {
  type: "hline";
  price: number;
  label?: string;
  color?: string;
};

export type TrendlineItem = {
  type: "trendline";
  from: AnnotationPoint;
  to: AnnotationPoint;
  label?: string;
  color?: string;
};

export type FibItem = {
  type: "fib";
  /** Swing low. */
  from: AnnotationPoint;
  /** Swing high. */
  to: AnnotationPoint;
  label?: string;
  color?: string;
};

export type ZoneItem = {
  type: "zone";
  /** Price range. Order does not matter. */
  priceTop: number;
  priceBottom: number;
  /** Optional time bounds; omitted means "across the whole chart". */
  fromTime?: number;
  toTime?: number;
  label?: string;
  color?: string;
};

export type NoteItem = {
  type: "note";
  time: number;
  price: number;
  text: string;
  color?: string;
};

export type AnnotationItem =
  | HLineItem
  | TrendlineItem
  | FibItem
  | ZoneItem
  | NoteItem;

export type AnnotationSet = {
  id: string;
  symbol: string;
  tf: string;
  items: AnnotationItem[];
  note: string | null;
  createdAt: string;
};

/** The three retracements the desk actually trades off. */
export const FIB_LEVELS = [0.382, 0.5, 0.618] as const;

export const ANNOTATION_TYPES = [
  "hline",
  "trendline",
  "fib",
  "zone",
  "note",
] as const;

/* -------------------------------------------------------------------------- */
/* Validation                                                                   */
/* -------------------------------------------------------------------------- */

export class AnnotationError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new AnnotationError(`${path} must be a finite number`);
  }
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new AnnotationError(`${path} must be a non-empty string`);
  }
  return v;
}

function optStr(v: unknown, path: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  return str(v, path);
}

function optNum(v: unknown, path: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  return num(v, path);
}

/** Reject anything that is not a plain CSS hex colour; these end up in a canvas. */
function optColor(v: unknown, path: string): string | undefined {
  const s = optStr(v, path);
  if (s === undefined) return undefined;
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) {
    throw new AnnotationError(`${path} must be a hex colour, got ${s}`);
  }
  return s;
}

function point(v: unknown, path: string): AnnotationPoint {
  if (!isRecord(v)) throw new AnnotationError(`${path} must be an object`);
  return { time: num(v.time, `${path}.time`), price: num(v.price, `${path}.price`) };
}

export function parseAnnotationItem(raw: unknown, path = "item"): AnnotationItem {
  if (!isRecord(raw)) throw new AnnotationError(`${path} must be an object`);
  const type = str(raw.type, `${path}.type`);

  switch (type) {
    case "hline":
      return {
        type,
        price: num(raw.price, `${path}.price`),
        label: optStr(raw.label, `${path}.label`),
        color: optColor(raw.color, `${path}.color`),
      };
    case "trendline":
    case "fib":
      return {
        type,
        from: point(raw.from, `${path}.from`),
        to: point(raw.to, `${path}.to`),
        label: optStr(raw.label, `${path}.label`),
        color: optColor(raw.color, `${path}.color`),
      };
    case "zone":
      return {
        type,
        priceTop: num(raw.priceTop, `${path}.priceTop`),
        priceBottom: num(raw.priceBottom, `${path}.priceBottom`),
        fromTime: optNum(raw.fromTime, `${path}.fromTime`),
        toTime: optNum(raw.toTime, `${path}.toTime`),
        label: optStr(raw.label, `${path}.label`),
        color: optColor(raw.color, `${path}.color`),
      };
    case "note":
      return {
        type,
        time: num(raw.time, `${path}.time`),
        price: num(raw.price, `${path}.price`),
        text: str(raw.text, `${path}.text`),
        color: optColor(raw.color, `${path}.color`),
      };
    default:
      throw new AnnotationError(
        `${path}.type must be one of ${ANNOTATION_TYPES.join(", ")}, got ${type}`,
      );
  }
}

export function parseAnnotationItems(raw: unknown): AnnotationItem[] {
  if (!Array.isArray(raw)) throw new AnnotationError("items must be an array");
  if (raw.length > 100) throw new AnnotationError("items may not exceed 100 entries");
  return raw.map((item, i) => parseAnnotationItem(item, `items[${i}]`));
}

/** One line of prose describing a set, for the text under the chart. */
export function describeAnnotationSet(set: AnnotationSet): string {
  if (set.note) return set.note;
  const counts = new Map<string, number>();
  for (const item of set.items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, n]) => `${n} ${type}`).join(", ");
}
