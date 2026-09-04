import Link from "next/link";
import { notFound } from "next/navigation";

import { ProposalCard } from "@/components/strategy/ProposalCard";
import { Card, CardTitle, Hero, Pill, Rows, Stat } from "@/components/ui";
import { ago, price as fmtPrice, signedMoney, size as fmtSize } from "@/lib/format";
import { providers } from "@/lib/providers";
import type { SetupView } from "@/lib/providers/types";
import { SYMBOL_META } from "@/lib/symbols";

export const dynamic = "force-dynamic";

export default async function StrategyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const strategy = await providers.strategies.get(slug);
  if (!strategy) notFound();

  const [setups, proposals] = await Promise.all([
    providers.strategies.setups(strategy.id),
    providers.agent.proposals({ strategyId: strategy.id }),
  ]);

  const open = proposals.filter((p) => p.state === "PROPOSED");
  const history = proposals.filter((p) => p.state !== "PROPOSED");
  const live = setups.filter((s) => s.state !== "EXPIRED");
  const meta = SYMBOL_META[strategy.symbol];
  const { stats, rules } = strategy;

  return (
    <>
      <p className="px-1 pt-1 text-[13px] text-muted">
        <Link href="/strategy" className="hover:text-ink">
          Strategies
        </Link>{" "}
        › {strategy.name}
      </p>

      <Hero
        label={`${strategy.name} · ${strategy.symbol} ${strategy.tf}`}
        value={`${stats.expectancyR >= 0 ? "+" : ""}${stats.expectancyR.toFixed(2)}R`}
        sub={
          <>
            expectancy over {stats.trades} trades · {stats.winRate}% win ·{" "}
            <span className={stats.pnl30d >= 0 ? "text-up" : "text-down"}>
              {signedMoney(stats.pnl30d)}
            </span>{" "}
            30d
            {strategy.status !== "ACTIVE" ? ` · ${strategy.status.toLowerCase()}` : ""}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-baseline justify-between">
            <CardTitle>Agent</CardTitle>
            <span className="text-[12px] text-faint">
              {open.length === 0 ? "nothing to approve" : `${open.length} awaiting`}
            </span>
          </div>
          <div className="mt-4">
            {open.length > 0 ? (
              <Rows>
                {open.map((proposal) => (
                  <ProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </Rows>
            ) : (
              <p className="text-[15px] text-muted">
                No open proposals. The agent proposes when a setup reaches READY and every plan
                check passes.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between">
            <CardTitle>Setups</CardTitle>
            <span className="text-[12px] text-faint">{live.length} live</span>
          </div>
          <div className="mt-4">
            {live.length > 0 ? (
              <Rows>
                {live.map((setup) => (
                  <SetupRow key={setup.id} setup={setup} />
                ))}
              </Rows>
            ) : (
              <p className="text-[15px] text-muted">Nothing on the scanner right now.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Rules</CardTitle>
          <p className="mt-3 text-[15px] leading-snug text-ink">{strategy.thesis}</p>
          <ul className="mt-4 flex flex-col gap-2">
            {rules.entry.map((rule) => (
              <li key={rule} className="flex gap-2 text-[14px] text-muted">
                <span className="text-faint" aria-hidden>
                  —
                </span>
                {rule}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <Stat label="Invalidation" value={<span className="text-[15px]">{rules.invalidation}</span>} />
            <Stat
              label="Sizing"
              value={<span className="text-[15px]">{rules.sizing.riskPct}% risk</span>}
              sub={`max ${fmtSize(rules.sizing.maxSize, meta.unit)}`}
              align="right"
            />
            <Stat label="Sessions" value={<span className="text-[15px]">{rules.sessions.join(", ")}</span>} />
            <Stat
              label="Avg hold"
              value={<span className="text-[15px]">{stats.avgHoldHours}h</span>}
              align="right"
            />
          </div>
        </Card>

        {history.length > 0 ? (
          <Card>
            <CardTitle>Decided</CardTitle>
            <div className="mt-4">
              <Rows>
                {history.map((proposal) => (
                  <ProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </Rows>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}

const SETUP_LABEL: Record<SetupView["state"], string> = {
  WATCHING: "Watching",
  READY: "Ready",
  TRIGGERED: "Triggered",
  EXPIRED: "Expired",
};

function SetupRow({ setup }: { setup: SetupView }) {
  const meta = SYMBOL_META[setup.symbol];
  const met = setup.conditions.filter((c) => c.met).length;

  return (
    <div className="rounded-card bg-raised px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[17px] font-semibold">{setup.score}</span>
          <span className="text-[13px] text-faint">/ 100</span>
          <Pill solid={setup.state === "READY" || setup.state === "TRIGGERED"}>
            {SETUP_LABEL[setup.state]}
          </Pill>
        </div>
        <span className="text-[13px] text-faint">{ago(setup.detectedAt)}</span>
      </div>

      <p className="mt-2 text-[15px] text-ink">{setup.trigger}</p>

      <ul className="mt-3 flex flex-col gap-1">
        {setup.conditions.map((condition) => (
          <li key={condition.label} className="flex items-baseline gap-2 text-[13px]">
            <span className="shrink-0 text-faint" aria-hidden>
              {condition.met ? "✓" : "○"}
            </span>
            <span className={condition.met ? "text-muted" : "text-faint"}>
              {condition.label}
              <span className="text-faint"> · {condition.value}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[13px] text-faint">
        {met} of {setup.conditions.length} conditions · entry {fmtPrice(setup.entry, meta.precision)}{" "}
        · stop <span className="text-down">{fmtPrice(setup.stop, meta.precision)}</span> · target{" "}
        <span className="text-up">{fmtPrice(setup.target, meta.precision)}</span>
      </p>
    </div>
  );
}
