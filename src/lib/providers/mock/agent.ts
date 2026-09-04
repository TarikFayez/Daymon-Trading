import type { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { toNumber, toNumberOrNull } from "@/lib/providers/mock/decimal";
import type {
  AgentProvider,
  Decision,
  ExecutionProvider,
  ProposalCheck,
  ProposalState,
  ProposalView,
} from "@/lib/providers/types";
import { SYMBOL_META, type Symbol_ } from "@/lib/symbols";

export class ProposalError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

type ProposalRow = Prisma.ProposalGetPayload<{
  include: { strategy: { select: { slug: true; name: true } }; account: { select: { name: true } } };
}>;

const INCLUDE = {
  strategy: { select: { slug: true, name: true } },
  account: { select: { name: true } },
} as const;

function toView(row: ProposalRow): ProposalView {
  const checks = (row.checks as ProposalCheck[]) ?? [];
  const expired = row.state === "PROPOSED" && row.expiresAt.getTime() < Date.now();
  return {
    id: row.id,
    strategyId: row.strategyId,
    strategySlug: row.strategy.slug,
    strategyName: row.strategy.name,
    setupId: row.setupId,
    account: row.account.name,
    accountId: row.accountId,
    symbol: row.symbol as Symbol_,
    side: row.side,
    size: toNumber(row.size),
    entry: toNumber(row.entry),
    stop: toNumber(row.stop),
    target: toNumber(row.target),
    riskUsd: toNumber(row.riskUsd),
    rr: toNumber(row.rr),
    rationale: row.rationale,
    checks,
    blocked: checks.some((c) => !c.pass),
    state: expired ? "EXPIRED" : row.state,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    executedAt: row.executedAt?.toISOString() ?? null,
    fillPrice: toNumberOrNull(row.fillPrice),
    venueOrderId: row.venueOrderId,
    rejectReason: row.rejectReason,
  };
}

/**
 * The mock agent: proposals come from the seed rather than from a model, but
 * the decision path is the real one. Approve is a state machine, not a flag —
 * PROPOSED → APPROVED → SENT → FILLED, with the position and the terminal line
 * written in the same transaction as the fill.
 */
export class MockAgentProvider implements AgentProvider {
  constructor(private readonly execution: ExecutionProvider) {}

  async proposals(opts: { strategyId?: string; states?: ProposalState[] } = {}): Promise<ProposalView[]> {
    const rows = await prisma.proposal.findMany({
      where: {
        strategyId: opts.strategyId,
        state: opts.states ? { in: opts.states } : undefined,
      },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toView);
  }

  async get(id: string): Promise<ProposalView | null> {
    const row = await prisma.proposal.findUnique({ where: { id }, include: INCLUDE });
    return row ? toView(row) : null;
  }

  async decide(id: string, decision: Decision, reason?: string): Promise<ProposalView> {
    const row = await prisma.proposal.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new ProposalError("proposal not found", 404);
    const view = toView(row);

    if (view.state === "EXPIRED") {
      await prisma.proposal.update({ where: { id }, data: { state: "EXPIRED" } });
      throw new ProposalError("proposal has expired — ask the agent to re-propose", 409);
    }
    if (view.state !== "PROPOSED") {
      throw new ProposalError(`proposal is already ${view.state.toLowerCase()}`, 409);
    }

    if (decision === "REJECT") {
      const updated = await prisma.proposal.update({
        where: { id },
        data: { state: "REJECTED", decidedAt: new Date(), rejectReason: reason ?? "Rejected" },
        include: INCLUDE,
      });
      await prisma.terminalEvent.create({
        data: {
          time: new Date(),
          source: "Agent",
          kind: "AGENT",
          headline: `Rejected ${sideWord(view.side)} ${view.symbol} ${sizeWord(view)} — ${reason ?? "no reason given"}`,
          symbols: [view.symbol],
          impact: "LOW",
          direction: "NEUTRAL",
          positionIds: [],
        },
      });
      logger.info({ proposalId: id, reason }, "proposal rejected");
      return toView(updated);
    }

    if (view.blocked) {
      const failing = view.checks.filter((c) => !c.pass).map((c) => c.label);
      throw new ProposalError(`blocked by plan check: ${failing.join(", ")}`, 409);
    }

    // APPROVED, then SENT, before the venue is touched — so a crash mid-way
    // leaves an honest record rather than a phantom fill.
    const now = new Date();
    await prisma.proposal.update({
      where: { id },
      data: { state: "APPROVED", decidedAt: now },
    });
    await prisma.proposal.update({ where: { id }, data: { state: "SENT" } });

    const fill = await this.execution.execute(view);
    const meta = SYMBOL_META[view.symbol];

    const [updated] = await prisma.$transaction([
      prisma.proposal.update({
        where: { id },
        data: {
          state: "FILLED",
          executedAt: new Date(fill.filledAt),
          fillPrice: fill.fillPrice,
          venueOrderId: fill.venueOrderId,
          position: {
            create: {
              accountId: view.accountId,
              symbol: view.symbol,
              side: view.side,
              size: view.size,
              entry: fill.fillPrice,
              markPrice: fill.fillPrice,
              stop: view.stop,
              target: view.target,
              contractValue: meta.contractValue,
              openedAt: new Date(fill.filledAt),
            },
          },
        },
        include: INCLUDE,
      }),
      prisma.terminalEvent.create({
        data: {
          time: new Date(fill.filledAt),
          source: "Agent",
          kind: "AGENT",
          headline: `Filled ${sideWord(view.side)} ${view.symbol} ${sizeWord(view)} at ${fill.fillPrice.toFixed(meta.precision)} · ${view.account}`,
          body: `${view.strategyName}. Stop ${view.stop.toFixed(meta.precision)}, target ${view.target.toFixed(meta.precision)}, risk $${Math.round(view.riskUsd).toLocaleString("en-US")}.`,
          symbols: [view.symbol],
          impact: "MEDIUM",
          direction: view.side === "LONG" ? "BULLISH" : "BEARISH",
          positionIds: [],
        },
      }),
      ...(view.setupId
        ? [prisma.setup.update({ where: { id: view.setupId }, data: { state: "TRIGGERED" } })]
        : []),
    ]);

    logger.info({ proposalId: id, venueOrderId: fill.venueOrderId }, "proposal approved and filled");
    return toView(updated);
  }
}

function sideWord(side: "LONG" | "SHORT"): string {
  return side === "LONG" ? "long" : "short";
}

function sizeWord(p: ProposalView): string {
  const meta = SYMBOL_META[p.symbol];
  return meta.unit === "lots" ? `${p.size.toFixed(2)} lots` : `${p.size.toLocaleString("en-US")} ${meta.unit}`;
}
