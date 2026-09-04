"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChartPoint, Overlays } from "@/components/chart/CandleChart";
import { CHART_COLORS } from "@/components/chart/theme";
import type { AnnotationItem, AnnotationSet } from "@/lib/annotations";
import { describeAnnotationSet } from "@/lib/annotations";
import { compactCount, price as fmtPrice, shortDateTime, signedPct } from "@/lib/format";
import type { OHLCV } from "@/lib/mock/candles";
import {
  SYMBOLS,
  SYMBOL_META,
  TIMEFRAMES,
  type Symbol_,
  type Timeframe,
} from "@/lib/symbols";

const CandleChart = dynamic(
  () => import("@/components/chart/CandleChart").then((m) => m.CandleChart),
  { ssr: false, loading: () => <div className="absolute inset-0" aria-hidden /> },
);

export type ChartWorkspaceProps = {
  symbol: Symbol_;
  tf: Timeframe;
  candles: OHLCV[];
  sets: AnnotationSet[];
};

type Loaded = { candles: OHLCV[]; sets: AnnotationSet[] };

type Tool = "hline" | "trend" | "fib" | "zone" | "note";

const TOOLS: { id: Tool; label: string; glyph: string; points: 1 | 2; hint: string }[] = [
  { id: "hline", label: "Level", glyph: "—", points: 1, hint: "Click a price" },
  { id: "trend", label: "Trend", glyph: "╱", points: 2, hint: "Click two points" },
  { id: "fib", label: "Fib", glyph: "ƒ", points: 2, hint: "Click the swing start, then the end" },
  { id: "zone", label: "Zone", glyph: "▭", points: 2, hint: "Click two corners" },
  { id: "note", label: "Note", glyph: "✎", points: 1, hint: "Click where the note points" },
];

/** The four colours a drawing may take. Green and red mean what they always mean. */
const SWATCHES: { id: string; color: string; label: string }[] = [
  { id: "ink", color: CHART_COLORS.ink, label: "White" },
  { id: "muted", color: CHART_COLORS.muted, label: "Grey" },
  { id: "up", color: CHART_COLORS.up, label: "Target" },
  { id: "down", color: CHART_COLORS.down, label: "Invalidation" },
];

/**
 * The full-size chart: toolbar, live legend, the chart itself, drawing tools
 * that emit the same annotation JSON the API stores, and a save that posts it.
 */
export function ChartWorkspace(props: ChartWorkspaceProps) {
  const [symbol, setSymbol] = useState<Symbol_>(props.symbol);
  const [tf, setTf] = useState<Timeframe>(props.tf);
  const [data, setData] = useState<Loaded>({ candles: props.candles, sets: props.sets });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlays>({ ema20: false, vwap: true });
  const [hover, setHover] = useState<OHLCV | null>(null);

  // Drawing state.
  const [tool, setTool] = useState<Tool | null>(null);
  const [swatch, setSwatch] = useState(SWATCHES[0]);
  const [anchors, setAnchors] = useState<ChartPoint[]>([]);
  const [draft, setDraft] = useState<AnnotationItem | null>(null);
  const [drawn, setDrawn] = useState<Record<string, AnnotationItem[]>>({});
  const [notePoint, setNotePoint] = useState<ChartPoint | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const initialKey = useRef(`${props.symbol}:${props.tf}`);

  const key = `${symbol}:${tf}`;
  const meta = SYMBOL_META[symbol];
  const { candles, sets } = data;
  const unsaved = useMemo(() => drawn[key] ?? [], [drawn, key]);
  const latest = sets[0] ?? null;

  /* ------------------------------ data loading ----------------------------- */

  const load = useCallback(async (s: Symbol_, t: Timeframe, signal?: AbortSignal) => {
    const query = `symbol=${s}&tf=${t}`;
    const [candleRes, setRes] = await Promise.all([
      fetch(`/api/candles?${query}`, { signal }),
      fetch(`/api/annotations?${query}`, { signal }),
    ]);
    if (!candleRes.ok) throw new Error(`candles: ${candleRes.status}`);
    if (!setRes.ok) throw new Error(`annotations: ${setRes.status}`);
    const c = (await candleRes.json()) as { candles: OHLCV[] };
    const a = (await setRes.json()) as { sets: AnnotationSet[] };
    return { candles: c.candles, sets: a.sets };
  }, []);

  useEffect(() => {
    if (key === initialKey.current) return;
    const controller = new AbortController();
    setPending(true);
    setError(null);
    load(symbol, tf, controller.signal)
      .then((next) => {
        setData(next);
        setPending(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "could not load series");
        setPending(false);
      });
    return () => controller.abort();
  }, [symbol, tf, key, load]);

  /* --------------------------------- drawing -------------------------------- */

  const cancelTool = useCallback(() => {
    setAnchors([]);
    setDraft(null);
    setNotePoint(null);
    setNoteText("");
  }, []);

  const pickTool = (next: Tool) => {
    cancelTool();
    setTool((current) => (current === next ? null : next));
  };

  const build = useCallback(
    (kind: Tool, a: ChartPoint, b: ChartPoint | null): AnnotationItem | null => {
      const color = swatch.color;
      switch (kind) {
        case "hline":
          return {
            type: "hline",
            price: Number(a.price.toFixed(meta.precision)),
            color,
            label: swatch.id === "up" ? "Target" : swatch.id === "down" ? "Invalidation" : undefined,
          };
        case "trend":
          return b ? { type: "trendline", from: a, to: b, color } : null;
        case "fib":
          return b ? { type: "fib", from: a, to: b, color } : null;
        case "zone":
          return b
            ? {
                type: "zone",
                priceTop: Math.max(a.price, b.price),
                priceBottom: Math.min(a.price, b.price),
                fromTime: Math.min(a.time, b.time),
                toTime: Math.max(a.time, b.time),
                color,
              }
            : null;
        case "note":
          return null;
      }
    },
    [swatch, meta.precision],
  );

  const commit = useCallback(
    (item: AnnotationItem) => {
      setDrawn((all) => ({ ...all, [key]: [...(all[key] ?? []), item] }));
      setAnchors([]);
      setDraft(null);
      setSaved(null);
    },
    [key],
  );

  const onPoint = useCallback(
    (point: ChartPoint) => {
      if (!tool) return;
      const spec = TOOLS.find((t) => t.id === tool)!;

      if (tool === "note") {
        setNotePoint(point);
        return;
      }
      if (spec.points === 1) {
        const item = build(tool, point, null);
        if (item) commit(item);
        return;
      }
      if (anchors.length === 0) {
        setAnchors([point]);
        return;
      }
      const item = build(tool, anchors[0], point);
      if (item) commit(item);
    },
    [tool, anchors, build, commit],
  );

  const onMove = useCallback(
    (point: ChartPoint | null) => {
      if (!tool || anchors.length !== 1 || !point) return;
      setDraft(build(tool, anchors[0], point));
    },
    [tool, anchors, build],
  );

  const addNote = () => {
    if (!notePoint || noteText.trim().length === 0) return;
    commit({
      type: "note",
      time: notePoint.time,
      price: Number(notePoint.price.toFixed(meta.precision)),
      text: noteText.trim(),
      color: swatch.color,
    });
    setNotePoint(null);
    setNoteText("");
  };

  const undo = () =>
    setDrawn((all) => ({ ...all, [key]: (all[key] ?? []).slice(0, -1) }));
  const clear = () => {
    setDrawn((all) => ({ ...all, [key]: [] }));
    cancelTool();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelTool();
        setTool(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelTool]);

  /* ---------------------------------- save ---------------------------------- */

  const save = async () => {
    if (unsaved.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, tf, items: unsaved, note: null }),
      });
      const body = (await res.json()) as { set?: AnnotationSet; error?: string };
      if (!res.ok || !body.set) throw new Error(body.error ?? `save failed (${res.status})`);
      setData((current) => ({ ...current, sets: [body.set!, ...current.sets] }));
      setDrawn((all) => ({ ...all, [key]: [] }));
      setSaved(`Saved ${unsaved.length} ${unsaved.length === 1 ? "drawing" : "drawings"}`);
      setTool(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------- fullscreen ------------------------------- */

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = workspaceRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  /* --------------------------------- legend --------------------------------- */

  const last = candles.at(-1) ?? null;
  const shown = hover ?? last;
  const shownIndex = shown ? candles.indexOf(shown) : -1;
  const prevClose = shownIndex > 0 ? candles[shownIndex - 1].close : shown?.open ?? 0;
  const barChange = shown && prevClose ? ((shown.close - prevClose) / prevClose) * 100 : 0;
  const first = candles[0];
  const seriesChange =
    last && first && first.open !== 0 ? ((last.close - first.open) / first.open) * 100 : 0;

  const items: AnnotationItem[] = useMemo(
    () => [...sets.flatMap((s) => s.items), ...unsaved],
    [sets, unsaved],
  );

  const activeTool = TOOLS.find((t) => t.id === tool) ?? null;

  return (
    <div ref={workspaceRef} className="flex h-full flex-col bg-canvas">
      {/* Toolbar: symbol · timeframe · indicators · fullscreen */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Switcher options={SYMBOLS} value={symbol} onChange={setSymbol} label="Symbol" />
        <Switcher options={TIMEFRAMES} value={tf} onChange={setTf} label="Timeframe" />
        <div className="flex gap-1.5" role="group" aria-label="Indicators">
          <Toggle
            on={overlays.vwap}
            onClick={() => setOverlays((o) => ({ ...o, vwap: !o.vwap }))}
          >
            VWAP · W
          </Toggle>
          <Toggle
            on={overlays.ema20}
            onClick={() => setOverlays((o) => ({ ...o, ema20: !o.ema20 }))}
          >
            EMA 20
          </Toggle>
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="ml-auto rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-muted hover:text-ink"
          aria-pressed={fullscreen}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          title={fullscreen ? "Exit full screen" : "Full screen"}
        >
          <span aria-hidden>{fullscreen ? "⤡" : "⤢"}</span>
          <span className="ml-1.5 hidden sm:inline">{fullscreen ? "Exit" : "Full screen"}</span>
        </button>
      </div>

      {/* Legend: what the crosshair is on, or the last bar */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pb-2">
        <span className="text-[15px] font-semibold">{symbol}</span>
        <span className="text-[13px] text-muted">
          {meta.label} · {tf} · {meta.venue}
        </span>
        {shown ? (
          <>
            <span className="text-[22px] font-semibold leading-none">
              {fmtPrice(shown.close, meta.precision)}
            </span>
            <span className={`text-[13px] ${barChange >= 0 ? "text-up" : "text-down"}`}>
              {signedPct(barChange)}
            </span>
            <span className="hidden text-[12px] text-faint sm:inline">
              O {fmtPrice(shown.open, meta.precision)} · H {fmtPrice(shown.high, meta.precision)} · L{" "}
              {fmtPrice(shown.low, meta.precision)} · C {fmtPrice(shown.close, meta.precision)} · V{" "}
              {compactCount(shown.volume)}
            </span>
            {!hover ? (
              <span className="hidden text-[12px] text-faint sm:inline">
                {signedPct(seriesChange)} over {candles.length} bars
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Drawing tools */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-2">
        <div className="flex gap-1" role="group" aria-label="Drawing tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTool(t.id)}
              aria-pressed={tool === t.id}
              title={t.hint}
              className={[
                "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                tool === t.id ? "bg-ink text-canvas" : "bg-surface text-muted hover:text-ink",
              ].join(" ")}
            >
              <span className="mr-1.5 font-normal" aria-hidden>
                {t.glyph}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Colour">
          {SWATCHES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSwatch(s)}
              aria-pressed={swatch.id === s.id}
              aria-label={s.label}
              title={s.label}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface"
            >
              <span
                className="block rounded-full"
                style={{
                  width: swatch.id === s.id ? 16 : 10,
                  height: swatch.id === s.id ? 16 : 10,
                  background: s.color,
                  transition: "width .12s, height .12s",
                }}
              />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Toggle on={false} onClick={undo} disabled={unsaved.length === 0}>
            Undo
          </Toggle>
          <Toggle on={false} onClick={clear} disabled={unsaved.length === 0}>
            Clear
          </Toggle>
          <button
            type="button"
            onClick={save}
            disabled={unsaved.length === 0 || saving}
            className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-semibold text-canvas transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving…" : unsaved.length > 0 ? `Save ${unsaved.length}` : "Save"}
          </button>
        </div>

        <span className="text-[12px] text-faint">
          {notePoint
            ? "Type the note"
            : activeTool
              ? anchors.length === 1
                ? "Click the second point · Esc to cancel"
                : `${activeTool.hint} · Esc to cancel`
              : saved ?? (error ? "" : "Pick a tool to draw")}
        </span>
      </div>

      {notePoint ? (
        <form
          className="flex items-center gap-2 px-4 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            addNote();
          }}
        >
          <span className="text-[13px] text-muted">
            Note at {fmtPrice(notePoint.price, meta.precision)}
          </span>
          <input
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="What did you see?"
            className="min-w-0 flex-1 rounded-full bg-surface px-3 py-1.5 text-[14px] text-ink placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={noteText.trim().length === 0}
            className="rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-canvas disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={cancelTool}
            className="rounded-full bg-surface px-3 py-1.5 text-[13px] text-muted hover:text-ink"
          >
            Cancel
          </button>
        </form>
      ) : null}

      {/* The chart fills whatever is left */}
      <div
        className="relative min-h-0 flex-1 transition-opacity duration-150"
        style={{ opacity: pending ? 0.45 : 1, cursor: tool ? "crosshair" : undefined }}
      >
        <CandleChart
          candles={candles}
          annotations={items}
          draft={draft}
          precision={meta.precision}
          seriesKey={key}
          overlays={overlays}
          onHover={setHover}
          onPoint={onPoint}
          onMove={onMove}
        />
      </div>

      {/* Footer: latest saved annotation */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2">
        {error ? (
          <span className="text-[13px] text-down">Could not load: {error}</span>
        ) : latest ? (
          <>
            <span className="min-w-0 truncate text-[13px] text-ink">
              {describeAnnotationSet(latest)}
            </span>
            <span className="shrink-0 text-[12px] text-faint">
              {latest.items.length} drawings · {shortDateTime(latest.createdAt)}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-muted">Nothing drawn on {symbol} {tf} yet.</span>
        )}
      </div>
    </div>
  );
}

function Switcher<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={[
              "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              active ? "bg-ink text-canvas" : "bg-surface text-muted hover:text-ink",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={[
        "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
        on ? "bg-raised text-ink" : "bg-surface text-muted hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
