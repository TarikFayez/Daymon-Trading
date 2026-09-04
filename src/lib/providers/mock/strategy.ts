import type { Prisma, ProposalState, SetupState } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/providers/mock/decimal";
import type {
  SetupCondition,
  SetupView,
  StrategyProvider,
  StrategyRules,
  StrategyStats,
  StrategyView,
} from "@/lib/providers/types";
import type { Symbol_, Timeframe } from "@/lib/symbols";

// Counts are scoped: setups that are actionable, proposals still waiting on a click.
const ACTIONABLE: SetupState[] = ["READY", "TRIGGERED"];
const WAITING: ProposalState = "PROPOSED";

const COUNTS = {
  _count: {
    select: {
      setups: { where: { state: { in: ACTIONABLE } } },
      proposals: { where: { state: WAITING } },
    },
  },
} satisfies Prisma.StrategyInclude;

type StrategyRow = Prisma.StrategyGetPayload<{ include: typeof COUNTS }>;

function toView(row: StrategyRow): StrategyView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    symbol: row.symbol as Symbol_,
    tf: row.tf as Timeframe,
    bias: row.bias,
    status: row.status,
    thesis: row.thesis,
    rules: row.rules as StrategyRules,
    stats: row.stats as StrategyStats,
    readySetups: row._count.setups,
    openProposals: row._count.proposals,
  };
}

export class MockStrategyProvider implements StrategyProvider {
  async list(): Promise<StrategyView[]> {
    const rows = await prisma.strategy.findMany({
      include: COUNTS,
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return rows.map(toView);
  }

  async get(slug: string): Promise<StrategyView | null> {
    const row = await prisma.strategy.findUnique({ where: { slug }, include: COUNTS });
    return row ? toView(row) : null;
  }

  async setups(strategyId: string): Promise<SetupView[]> {
    const rows = await prisma.setup.findMany({
      where: { strategyId },
      orderBy: [{ score: "desc" }, { detectedAt: "desc" }],
    });
    const now = Date.now();
    return rows.map((s) => ({
      id: s.id,
      strategyId: s.strategyId,
      symbol: s.symbol as Symbol_,
      tf: s.tf as Timeframe,
      // A setup past its expiry is expired whatever the row says.
      state: s.expiresAt.getTime() < now && s.state !== "TRIGGERED" ? "EXPIRED" : s.state,
      score: s.score,
      trigger: s.trigger,
      conditions: (s.conditions as SetupCondition[]) ?? [],
      entry: toNumber(s.entry),
      stop: toNumber(s.stop),
      target: toNumber(s.target),
      detectedAt: s.detectedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));
  }
}
