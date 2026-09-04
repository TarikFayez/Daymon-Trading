import { Card, CardTitle, Hero, Pill, Rows } from "@/components/ui";
import {
  money,
  price as fmtPrice,
  signedMoney,
  sinceShort,
  size as fmtSize,
  toneFor,
} from "@/lib/format";
import { providers } from "@/lib/providers";
import type { PlanView, PositionView } from "@/lib/providers/types";
import { SYMBOL_META } from "@/lib/symbols";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const [positions, accounts, plans] = await Promise.all([
    providers.positions.listPositions(),
    providers.positions.listAccounts(),
    providers.positions.listPlans(),
  ]);

  const riskToStop = positions.reduce((sum, p) => sum + p.riskToStop, 0);
  const equity = accounts.reduce((sum, a) => sum + a.equity, 0);
  const unrealised = positions.reduce((sum, p) => sum + p.unrealisedPnl, 0);
  const riskPct = equity > 0 ? (riskToStop / equity) * 100 : 0;

  // Only show plans for symbols actually on the book.
  const held = new Set(positions.map((p) => p.symbol));
  const relevantPlans = plans.filter((plan) => held.has(plan.symbol));

  return (
    <>
      <Hero
        label="Risk to stop · all accounts"
        value={money(riskToStop)}
        sub={
          <>
            {riskPct.toFixed(2)}% of {money(equity)} equity · {positions.length} positions
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardTitle>Open</CardTitle>
          <div className="mt-4">
            <Rows>
              {positions.map((position) => (
                <PositionRow key={position.id} position={position} />
              ))}
            </Rows>
          </div>
          <div className="mt-5 flex items-baseline justify-between">
            <span className="text-[13px] text-muted">Unrealised, all accounts</span>
            <span
              className={`text-[17px] font-medium ${
                unrealised > 0 ? "text-up" : unrealised < 0 ? "text-down" : "text-ink"
              }`}
            >
              {signedMoney(unrealised)}
            </span>
          </div>
        </Card>

        <Card>
          <CardTitle>This week&rsquo;s plan</CardTitle>
          <div className="mt-4 flex flex-col gap-5">
            {relevantPlans.map((plan) => (
              <PlanNote key={plan.id} plan={plan} />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function PositionRow({ position }: { position: PositionView }) {
  const meta = SYMBOL_META[position.symbol];
  const pnlTone = toneFor(position.unrealisedPnl);

  return (
    <div className="rounded-card bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold">{position.symbol}</span>
          <Pill>{position.side === "LONG" ? "Long" : "Short"}</Pill>
        </div>
        <span
          className={`text-[17px] font-semibold ${
            pnlTone === "up" ? "text-up" : pnlTone === "down" ? "text-down" : "text-ink"
          }`}
        >
          {signedMoney(position.unrealisedPnl)}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3 text-[14px]">
        <span className="text-muted">
          {fmtSize(position.size, meta.unit)} · {position.account}
        </span>
        <span className="text-muted">
          Risk <span className="text-ink">{money(position.riskToStop)}</span>
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-faint">
        <span>
          Entry {fmtPrice(position.entry, meta.precision)} · Stop{" "}
          {fmtPrice(position.stop, meta.precision)}
        </span>
        <span className="shrink-0">{sinceShort(position.openedAt)}</span>
      </div>
    </div>
  );
}

function PlanNote({ plan }: { plan: PlanView }) {
  const meta = SYMBOL_META[plan.symbol];
  const target = plan.levels.find((level) => level.kind === "target");

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[16px] font-semibold">{plan.symbol}</span>
        <Pill>{plan.bias === "LONG" ? "Long" : plan.bias === "SHORT" ? "Short" : "Neutral"}</Pill>
        <span className="text-[13px] text-faint">
          max {fmtSize(plan.maxSize, meta.unit)}
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-snug text-ink">{plan.note}</p>
      <p className="mt-2 text-[13px] text-muted">
        {target ? (
          <>
            {target.label} <span className="text-up">{fmtPrice(target.price, meta.precision)}</span>{" "}
            ·{" "}
          </>
        ) : null}
        Invalidation{" "}
        <span className="text-down">{fmtPrice(plan.invalidation, meta.precision)}</span>
      </p>
    </div>
  );
}
