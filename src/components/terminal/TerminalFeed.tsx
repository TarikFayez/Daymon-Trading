"use client";

import { useMemo, useState } from "react";

import { Pill, Rows } from "@/components/ui";
import type { TerminalEventView } from "@/lib/providers/types";
import { SYMBOLS } from "@/lib/symbols";

type Filter = "all" | "positions" | (typeof SYMBOLS)[number];

const KIND_LABEL: Record<TerminalEventView["kind"], string> = {
  NEWS: "News",
  DATA: "Data",
  FLOW: "Flow",
  SYSTEM: "Venue",
  AGENT: "Agent",
};

/**
 * The feed, newest first, filterable by what it touches. Direction is a word,
 * not a colour — green and red stay reserved for money.
 */
export function TerminalFeed({ events }: { events: TerminalEventView[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "positions") return events.filter((e) => e.touches.length > 0);
    return events.filter((e) => e.symbols.includes(filter));
  }, [events, filter]);

  const options: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "positions", label: "My positions" },
    ...SYMBOLS.map((s) => ({ value: s, label: s })),
  ];

  return (
    <>
      <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5" role="group" aria-label="Filter">
        {options.map((option) => {
          const active = option.value === filter;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={active}
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                active ? "bg-ink text-canvas" : "bg-surface text-muted hover:text-ink",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-muted">Nothing on the tape for that.</p>
        ) : (
          <Rows>
            {visible.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </Rows>
        )}
      </div>
    </>
  );
}

function EventRow({ event }: { event: TerminalEventView }) {
  const time = new Date(event.time);
  const high = event.impact === "HIGH";

  return (
    <article className="rounded-card bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-3 text-[12px] text-faint">
        <span className="flex items-center gap-2">
          <span className="text-muted">
            {time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
          </span>
          <span>{event.source}</span>
          <span>·</span>
          <span>{KIND_LABEL[event.kind]}</span>
        </span>
        {high ? <Pill solid>High impact</Pill> : event.impact === "MEDIUM" ? <Pill>Medium</Pill> : null}
      </div>

      <p className={`mt-2 text-[15px] leading-snug ${high ? "font-semibold text-ink" : "text-ink"}`}>
        {event.headline}
      </p>
      {event.body ? <p className="mt-1 text-[13px] leading-snug text-muted">{event.body}</p> : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {event.symbols.map((symbol) => (
          <Pill key={symbol}>{symbol}</Pill>
        ))}
        {event.direction !== "NEUTRAL" ? (
          <span className="text-[12px] text-faint">
            {event.direction === "BULLISH" ? "bullish" : "bearish"} for {event.symbols.join(", ")}
          </span>
        ) : null}
      </div>

      {event.touches.length > 0 ? (
        <p className="mt-2 text-[13px] text-muted">
          Touches <span className="text-ink">{event.touches.join(" · ")}</span>
        </p>
      ) : null}
    </article>
  );
}
