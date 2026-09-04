import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/providers/mock/decimal";
import type {
  ComplianceView,
  JournalProvider,
  TradeContext,
  TradeView,
} from "@/lib/providers/types";
import type { Symbol_ } from "@/lib/symbols";

function monthBounds(month: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export class MockJournalProvider implements JournalProvider {
  async listTrades(opts: { month?: Date; limit?: number } = {}): Promise<TradeView[]> {
    const where = opts.month
      ? (() => {
          const { start, end } = monthBounds(opts.month);
          return { closedAt: { gte: start, lt: end } };
        })()
      : {};

    const rows = await prisma.trade.findMany({
      where,
      include: { account: true },
      orderBy: { closedAt: "desc" },
      take: opts.limit,
    });

    return rows.map((t) => ({
      id: t.id,
      symbol: t.symbol as Symbol_,
      side: t.side,
      size: toNumber(t.size),
      account: t.account.name,
      entry: toNumber(t.entry),
      exit: toNumber(t.exit),
      pnl: toNumber(t.pnl),
      rMultiple: toNumber(t.rMultiple),
      inPlan: t.inPlan,
      deviation: t.deviation,
      context: (t.contextSnapshot as unknown as TradeContext) ?? {
        funding: null,
        openInterest: null,
        session: "—",
        note: "",
      },
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt.toISOString(),
    }));
  }

  async getCompliance(month: Date = new Date()): Promise<ComplianceView> {
    const trades = await this.listTrades({ month });
    const inPlan = trades.filter((t) => t.inPlan);
    const offPlan = trades.filter((t) => !t.inPlan);

    return {
      monthLabel: month.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      total: trades.length,
      inPlan: inPlan.length,
      pct: trades.length === 0 ? 0 : Math.round((inPlan.length / trades.length) * 100),
      pnlInPlan: sum(inPlan.map((t) => t.pnl)),
      pnlOffPlan: sum(offPlan.map((t) => t.pnl)),
      pattern: describePattern(offPlan),
    };
  }
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function mode(xs: string[]): { value: string; count: number } | null {
  if (xs.length === 0) return null;
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  const [value, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { value, count };
}

/**
 * The one line that makes the journal worth keeping: what the off-plan trades
 * have in common, stated plainly. Derived, never hand-written, so it stays true
 * as trades come in.
 */
function describePattern(offPlan: TradeView[]): string {
  if (offPlan.length === 0) {
    return "No off-plan trades this month.";
  }

  const reason = mode(offPlan.map((t) => t.deviation ?? "unclassified"));
  const session = mode(offPlan.map((t) => t.context.session));
  const symbol = mode(offPlan.map((t) => t.symbol));
  const cost = sum(offPlan.map((t) => t.pnl));
  const money = `${cost < 0 ? "−" : "+"}$${Math.abs(Math.round(cost)).toLocaleString("en-US")}`;

  const clauses: string[] = [];
  if (reason) {
    clauses.push(reason.count > 1 ? `${reason.count} ${reason.value}` : reason.value);
  }
  if (symbol && symbol.count > 1) clauses.push(`${symbol.count} in ${symbol.value}`);
  if (session && session.count > 1) {
    clauses.push(`${session.count} in the ${session.value} session`);
  }

  const headline = `${offPlan.length} off-plan ${offPlan.length === 1 ? "trade" : "trades"}`;
  return `${headline}: ${clauses.join(", ")}. Net ${money}.`;
}
