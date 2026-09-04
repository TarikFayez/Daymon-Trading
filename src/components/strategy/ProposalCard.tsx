"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pill } from "@/components/ui";
import { ago, money, price as fmtPrice, size as fmtSize } from "@/lib/format";
import type { ProposalView } from "@/lib/providers/types";
import { SYMBOL_META } from "@/lib/symbols";

const STATE_LABEL: Record<ProposalView["state"], string> = {
  PROPOSED: "Awaiting approval",
  APPROVED: "Approved",
  SENT: "Sent to venue",
  FILLED: "Filled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

/**
 * The agent's ticket and the one click that sends it.
 *
 * Approve is disabled, not hidden, when a plan check fails — the reason is on
 * the card, because "why can't I" is the question the desk will ask.
 */
export function ProposalCard({ proposal: initial }: { proposal: ProposalView }) {
  const router = useRouter();
  const [proposal, setProposal] = useState(initial);
  const [pending, setPending] = useState<"APPROVE" | "REJECT" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = SYMBOL_META[proposal.symbol];
  const open = proposal.state === "PROPOSED";
  const done = proposal.state === "FILLED";

  async function decide(decision: "APPROVE" | "REJECT") {
    setPending(decision);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: decision === "REJECT" ? "Passed on the desk" : undefined,
        }),
      });
      const body = (await res.json()) as { proposal?: ProposalView; error?: string };
      if (!res.ok || !body.proposal) {
        setError(body.error ?? `request failed (${res.status})`);
        return;
      }
      setProposal(body.proposal);
      // Positions, terminal and the strategy counts all moved.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-card bg-raised px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[17px] font-semibold">{proposal.symbol}</span>
          <Pill>{proposal.side === "LONG" ? "Long" : "Short"}</Pill>
        </div>
        <Pill solid={open}>{STATE_LABEL[proposal.state]}</Pill>
      </div>

      <p className="mt-3 text-[15px] leading-snug text-ink">{proposal.rationale}</p>

      <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
        <Ticket label="Size" value={fmtSize(proposal.size, meta.unit)} />
        <Ticket label="Entry" value={fmtPrice(proposal.entry, meta.precision)} />
        <Ticket label="Account" value={proposal.account} />
        <Ticket label="Stop" value={fmtPrice(proposal.stop, meta.precision)} tone="down" />
        <Ticket label="Target" value={fmtPrice(proposal.target, meta.precision)} tone="up" />
        <Ticket label="Risk" value={money(proposal.riskUsd)} sub={`${proposal.rr.toFixed(1)}R`} />
      </div>

      <ul className="mt-4 flex flex-col gap-1.5">
        {proposal.checks.map((check) => (
          <li key={check.label} className="flex items-baseline gap-2 text-[13px]">
            <span className={`shrink-0 ${check.pass ? "text-muted" : "text-ink"}`} aria-hidden>
              {check.pass ? "✓" : "✕"}
            </span>
            <span className={check.pass ? "text-muted" : "text-ink"}>
              {check.label}
              <span className="text-faint"> · {check.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => decide("APPROVE")}
            disabled={pending !== null || proposal.blocked}
            className="flex-1 rounded-full bg-ink px-4 py-3 text-[15px] font-semibold text-canvas transition-opacity disabled:opacity-40"
          >
            {pending === "APPROVE" ? "Sending…" : "Approve & execute"}
          </button>
          <button
            type="button"
            onClick={() => decide("REJECT")}
            disabled={pending !== null}
            className="rounded-full bg-surface px-4 py-3 text-[15px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            {pending === "REJECT" ? "…" : "Reject"}
          </button>
        </div>
      ) : null}

      {open && proposal.blocked ? (
        <p className="mt-3 text-[13px] text-muted">
          Blocked: {proposal.checks.filter((c) => !c.pass).map((c) => c.label).join(", ")}. The
          agent will re-propose when the plan allows it.
        </p>
      ) : null}

      {done ? (
        <p className="mt-3 text-[13px] text-muted">
          Filled at{" "}
          <span className="text-ink">
            {proposal.fillPrice !== null ? fmtPrice(proposal.fillPrice, meta.precision) : "—"}
          </span>{" "}
          · {proposal.venueOrderId} · position opened
          {proposal.executedAt ? ` ${ago(proposal.executedAt)}` : ""}
        </p>
      ) : null}

      {proposal.state === "REJECTED" ? (
        <p className="mt-3 text-[13px] text-muted">{proposal.rejectReason}</p>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-down">{error}</p> : null}

      <p className="mt-3 text-[12px] text-faint">
        Proposed {ago(proposal.createdAt)}
        {open ? ` · expires in ${untilShort(proposal.expiresAt)}` : ""}
      </p>
    </div>
  );
}

function Ticket({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.06em] text-faint">{label}</p>
      <p
        className={`mt-0.5 truncate text-[15px] font-medium ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="text-[12px] text-muted">{sub}</p> : null}
    </div>
  );
}

function untilShort(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "0m";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
