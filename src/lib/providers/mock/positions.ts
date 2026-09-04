import { prisma } from "@/lib/prisma";
import { toNumber, toNumberOrNull } from "@/lib/providers/mock/decimal";
import type {
  AccountView,
  PlanLevel,
  PlanView,
  PositionView,
  PositionsProvider,
} from "@/lib/providers/types";
import type { Symbol_ } from "@/lib/symbols";

export class MockPositionsProvider implements PositionsProvider {
  async listAccounts(): Promise<AccountView[]> {
    const rows = await prisma.account.findMany({ orderBy: { name: "asc" } });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      broker: a.broker,
      kind: a.kind,
      currency: a.currency,
      equity: toNumber(a.equity),
    }));
  }

  async listPositions(): Promise<PositionView[]> {
    const rows = await prisma.position.findMany({
      include: { account: true },
      orderBy: { openedAt: "asc" },
    });

    return rows.map((p) => {
      const size = toNumber(p.size);
      const entry = toNumber(p.entry);
      const mark = toNumber(p.markPrice);
      const stop = toNumber(p.stop);
      const cv = toNumber(p.contractValue);
      const direction = p.side === "LONG" ? 1 : -1;

      return {
        id: p.id,
        symbol: p.symbol as Symbol_,
        side: p.side,
        size,
        account: p.account.name,
        accountId: p.accountId,
        entry,
        mark,
        stop,
        target: toNumberOrNull(p.target),
        contractValue: cv,
        unrealisedPnl: (mark - entry) * direction * size * cv,
        // Distance from the current mark to the stop, in dollars.
        riskToStop: Math.abs(mark - stop) * size * cv,
        openedAt: p.openedAt.toISOString(),
      };
    });
  }

  async listPlans(): Promise<PlanView[]> {
    const rows = await prisma.plan.findMany({ orderBy: { weekOf: "desc" } });
    // One plan per symbol: the most recent week.
    const seen = new Set<string>();
    const latest = rows.filter((p) => {
      if (seen.has(p.symbol)) return false;
      seen.add(p.symbol);
      return true;
    });

    return latest.map((p) => ({
      id: p.id,
      symbol: p.symbol as Symbol_,
      weekOf: p.weekOf.toISOString(),
      bias: p.bias,
      levels: (p.levels as unknown as PlanLevel[]) ?? [],
      invalidation: toNumber(p.invalidation),
      maxSize: toNumber(p.maxSize),
      note: p.note,
    }));
  }
}
