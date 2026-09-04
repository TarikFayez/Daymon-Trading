import { Card, CardTitle, Hero, Pill, Rows } from "@/components/ui";
import {
  pct,
  price as fmtPrice,
  shortDate,
  signedMoney,
  size as fmtSize,
} from "@/lib/format";
import { providers } from "@/lib/providers";
import type { ComplianceView, TradeView } from "@/lib/providers/types";
import { SYMBOL_META } from "@/lib/symbols";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const month = new Date();
  const [compliance, trades] = await Promise.all([
    providers.journal.getCompliance(month),
    providers.journal.listTrades({ month }),
  ]);

  return (
    <>
      <Hero
        label={`Plan compliance · ${compliance.monthLabel}`}
        value={`${compliance.pct}%`}
        sub={
          <>
            {compliance.inPlan} of {compliance.total} trades inside the written plan
          </>
        }
      >
        <ComplianceBar pct={compliance.pct} />
        <div className="mt-4 flex gap-6">
          <SplitStat label="In plan" value={compliance.pnlInPlan} />
          <SplitStat label="Off plan" value={compliance.pnlOffPlan} />
        </div>
      </Hero>

      <div className="flex flex-col gap-4">
        <Card>
          <CardTitle>Pattern</CardTitle>
          <p className="mt-3 text-[16px] leading-snug text-ink">{compliance.pattern}</p>
          <PatternDetail compliance={compliance} />
        </Card>

        <Card>
          <CardTitle>Trades</CardTitle>
          <div className="mt-4">
            <Rows>
              {trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </Rows>
          </div>
        </Card>
      </div>
    </>
  );
}

/** The hero's progress bar. White fill, no colour — compliance is not PnL. */
function ComplianceBar({ pct: value }: { pct: number }) {
  return (
    <div
      className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Plan compliance"
    >
      <div className="h-full rounded-full bg-ink" style={{ width: `${value}%` }} />
    </div>
  );
}

function SplitStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{label}</p>
      <p
        className={`mt-1 text-[17px] font-medium ${
          value > 0 ? "text-up" : value < 0 ? "text-down" : "text-ink"
        }`}
      >
        {signedMoney(value)}
      </p>
    </div>
  );
}

function PatternDetail({ compliance }: { compliance: ComplianceView }) {
  const offPlan = compliance.total - compliance.inPlan;
  if (offPlan === 0) return null;

  const total = compliance.pnlInPlan + compliance.pnlOffPlan;
  return (
    <p className="mt-2 text-[14px] leading-snug text-muted">
      Without them the month reads {signedMoney(compliance.pnlInPlan)} instead of{" "}
      {signedMoney(total)}.
    </p>
  );
}

function TradeRow({ trade }: { trade: TradeView }) {
  const meta = SYMBOL_META[trade.symbol];
  const won = trade.pnl >= 0;

  return (
    <div className="rounded-card bg-raised px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[17px] font-semibold">{trade.symbol}</span>
          {/* The exception is what needs finding, so off plan gets the white pill. */}
          <Pill solid={!trade.inPlan}>{trade.inPlan ? "In plan" : "Off plan"}</Pill>
        </div>
        <span
          className={`shrink-0 whitespace-nowrap text-[17px] font-semibold ${
            won ? "text-up" : "text-down"
          }`}
        >
          {signedMoney(trade.pnl)}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3 text-[14px]">
        <span className="text-muted">
          {trade.side === "LONG" ? "Long" : "Short"} · {fmtSize(trade.size, meta.unit)} ·{" "}
          {trade.account}
        </span>
        <span className={`text-[14px] ${won ? "text-up" : "text-down"}`}>
          {trade.rMultiple > 0 ? "+" : ""}
          {trade.rMultiple.toFixed(1)}R
        </span>
      </div>

      <div className="mt-1 text-[13px] text-faint">
        {shortDate(trade.closedAt)} · {fmtPrice(trade.entry, meta.precision)} →{" "}
        {fmtPrice(trade.exit, meta.precision)} · {trade.context.session}
        {trade.context.funding !== null ? (
          <> · funding {pct(trade.context.funding, 4)}</>
        ) : null}
        {trade.context.openInterest !== null ? (
          <> · OI ${(trade.context.openInterest / 1e6).toFixed(0)}M</>
        ) : null}
      </div>

      {!trade.inPlan && trade.deviation ? (
        <p className="mt-2 text-[13px] text-muted">Off plan: {trade.deviation}</p>
      ) : null}
    </div>
  );
}
