import Link from "next/link";

import { Card, CardTitle, Hero, Pill, Rows } from "@/components/ui";
import { signedMoney } from "@/lib/format";
import { providers } from "@/lib/providers";
import type { StrategyView } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

export default async function StrategyIndexPage() {
  const strategies = await providers.strategies.list();
  const awaiting = strategies.reduce((sum, s) => sum + s.openProposals, 0);
  const ready = strategies.reduce((sum, s) => sum + s.readySetups, 0);
  const active = strategies.filter((s) => s.status === "ACTIVE");

  return (
    <>
      <Hero
        label="Awaiting your approval"
        value={String(awaiting)}
        sub={
          <>
            {awaiting === 1 ? "proposal" : "proposals"} from the agent · {ready} setups ready across{" "}
            {active.length} active strategies
          </>
        }
      />

      <Card>
        <CardTitle>Strategies</CardTitle>
        <div className="mt-4">
          <Rows>
            {strategies.map((strategy) => (
              <StrategyRow key={strategy.id} strategy={strategy} />
            ))}
          </Rows>
        </div>
      </Card>
    </>
  );
}

function StrategyRow({ strategy }: { strategy: StrategyView }) {
  const paused = strategy.status !== "ACTIVE";
  const { stats } = strategy;

  return (
    <Link
      href={`/strategy/${strategy.slug}`}
      className={`block rounded-card bg-raised px-4 py-3.5 transition-opacity hover:opacity-90 ${
        paused ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[17px] font-semibold leading-tight">{strategy.name}</span>
          {paused ? <Pill>{strategy.status === "PAUSED" ? "Paused" : "Retired"}</Pill> : null}
        </div>
        {strategy.openProposals > 0 ? (
          <Pill solid>{strategy.openProposals} waiting</Pill>
        ) : (
          <span className="text-[13px] text-faint">›</span>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3 text-[14px]">
        <span className="text-muted">
          {strategy.symbol} · {strategy.tf} ·{" "}
          {strategy.bias === "LONG" ? "Long" : strategy.bias === "SHORT" ? "Short" : "Neutral"}
        </span>
        <span className={stats.pnl30d >= 0 ? "text-up" : "text-down"}>
          {signedMoney(stats.pnl30d)} <span className="text-faint">30d</span>
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-faint">
        <span>
          {stats.expectancyR >= 0 ? "+" : ""}
          {stats.expectancyR.toFixed(2)}R · {stats.winRate}% win · {stats.trades} trades
        </span>
        <span>
          {strategy.readySetups === 0
            ? "no setups"
            : `${strategy.readySetups} ${strategy.readySetups === 1 ? "setup" : "setups"} ready`}
        </span>
      </div>
    </Link>
  );
}
