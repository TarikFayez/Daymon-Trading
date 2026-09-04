/**
 * Display formatting. Everything on this dashboard is read in a column, so the
 * rules are: tabular figures, a real minus sign, and no more precision than the
 * decision needs.
 */

const MINUS = "−";

function grouped(n: number, dp = 0): string {
  return Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** $12,480 — magnitude only, sign shown separately where it matters. */
export function money(value: number, dp = 0): string {
  return `${value < 0 ? MINUS : ""}$${grouped(value, dp)}`;
}

/** +$12,480 / −$3,180 — for PnL, where the sign is the point. */
export function signedMoney(value: number, dp = 0): string {
  const sign = value < 0 ? MINUS : "+";
  return `${sign}$${grouped(value, dp)}`;
}

/** $412M, $38.4M, $9,800 — for notionals too big to read digit by digit. */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${grouped(abs)}`;
}

/** +$46.2M / −$80.6M — for a change in a notional. */
export function signedCompactMoney(value: number): string {
  return `${value < 0 ? "" : "+"}${compactMoney(value)}`;
}

export function price(value: number, precision: number): string {
  return `${value < 0 ? MINUS : ""}${grouped(value, precision)}`;
}

export function signedPct(value: number, dp = 2): string {
  const sign = value < 0 ? MINUS : "+";
  return `${sign}${grouped(value, dp)}%`;
}

export function pct(value: number, dp = 2): string {
  return `${value < 0 ? MINUS : ""}${grouped(value, dp)}%`;
}

/** 62,400 — contracts, units, XRP. */
export function count(value: number, dp = 0): string {
  return `${value < 0 ? MINUS : ""}${grouped(value, dp)}`;
}

export function signedCount(value: number, dp = 0): string {
  const sign = value < 0 ? MINUS : "+";
  return `${sign}${grouped(value, dp)}`;
}

/** 26,000 → 26K, for position size chips. */
export function compactCount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e3)}K`;
  if (Number.isInteger(abs)) return `${sign}${grouped(abs)}`;
  return `${sign}${grouped(abs, 2)}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} ${d
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}

/** "6d", "19h" — position age, short enough to sit at the end of a row. */
export function sinceShort(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Position size in the symbol's own units: lots to 2dp, coins compacted. */
export function size(value: number, unit: string): string {
  if (unit === "lots") return `${grouped(value, 2)} ${unit}`;
  return `${compactCount(value)} ${unit}`;
}

/** "3 days ago" — for the age of a position or a snapshot. */
export function since(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** The colour rule, in one place: green up, red down, white flat. */
export function toneFor(value: number): "up" | "down" | "flat" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}
