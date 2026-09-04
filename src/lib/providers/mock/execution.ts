import { logger } from "@/lib/logger";
import type { ExecutionProvider, Fill, ProposalView } from "@/lib/providers/types";
import { SYMBOL_META } from "@/lib/symbols";

/**
 * Pretend venue. Fills at the proposal's entry plus one tick of slippage
 * against the trade, immediately. BloFin (perps) and FundedNext (metals)
 * replace this with real order placement and fill polling.
 */
export class MockExecutionProvider implements ExecutionProvider {
  async execute(proposal: ProposalView): Promise<Fill> {
    const meta = SYMBOL_META[proposal.symbol];
    const tick = 1 / 10 ** meta.precision;
    const slip = proposal.side === "LONG" ? tick : -tick;
    const fillPrice = Number((proposal.entry + slip).toFixed(meta.precision));

    const fill: Fill = {
      venueOrderId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
      fillPrice,
      filledAt: new Date().toISOString(),
    };

    logger.info(
      { proposalId: proposal.id, symbol: proposal.symbol, side: proposal.side, size: proposal.size, ...fill },
      "mock execution filled",
    );
    return fill;
  }
}
