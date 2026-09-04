import type { ReactNode } from "react";

type Tone = "up" | "down" | "flat" | "muted";

const TONE_TEXT: Record<Tone, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-ink",
  muted: "text-muted",
};

/**
 * One dark surface, 16px radius, no border, no shadow. Every block on every
 * panel is one of these.
 */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card bg-surface p-5 ${className}`}>{children}</section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
      {children}
    </h2>
  );
}

/** The one big number on a screen. Nothing else competes with it. */
export function Hero({
  label,
  value,
  tone = "flat",
  sub,
  children,
}: {
  label: string;
  value: string;
  tone?: Tone;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="px-1 pt-3 pb-6">
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
      <p className={`mt-2 text-hero font-semibold ${TONE_TEXT[tone]}`}>{value}</p>
      {sub ? <div className="mt-2 text-[15px] text-muted">{sub}</div> : null}
      {children}
    </section>
  );
}

/** Side, bias, in-plan — anything that is one word and a state. */
export function Pill({
  children,
  tone = "muted",
  solid = false,
}: {
  children: ReactNode;
  tone?: Tone;
  solid?: boolean;
}) {
  if (solid) {
    const bg =
      tone === "up" ? "bg-up text-canvas" : tone === "down" ? "bg-down text-canvas" : "bg-ink text-canvas";
    return (
      <span
        className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold ${bg}`}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full bg-raised px-2.5 py-1 text-[12px] font-medium ${TONE_TEXT[tone]}`}
    >
      {children}
    </span>
  );
}

/** A label/value pair. Used everywhere instead of a table. */
export function Stat({
  label,
  value,
  tone = "flat",
  sub,
  align = "left",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  sub?: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{label}</p>
      <p className={`mt-1 text-[17px] font-medium ${TONE_TEXT[tone]}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[13px] text-muted">{sub}</p> : null}
    </div>
  );
}

/** Rows are separated by space, never by a rule. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[15px] text-muted">{children}</p>;
}
