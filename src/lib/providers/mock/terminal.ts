import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/providers/mock/decimal";
import type { TerminalEventView, TerminalProvider } from "@/lib/providers/types";
import { SYMBOL_META, type Symbol_ } from "@/lib/symbols";

/**
 * The terminal reads a table the integrations will write into. Each line is
 * matched against open positions at read time, so a headline tagged XAGUSD
 * says which silver positions it touches today, not when it was stored.
 */
export class MockTerminalProvider implements TerminalProvider {
  async feed(opts: { sinceHours?: number } = {}): Promise<TerminalEventView[]> {
    const since = new Date(Date.now() - (opts.sinceHours ?? 36) * 3_600_000);

    const [events, positions] = await Promise.all([
      prisma.terminalEvent.findMany({
        where: { time: { gte: since } },
        orderBy: { time: "desc" },
      }),
      prisma.position.findMany({ include: { account: { select: { name: true } } } }),
    ]);

    const labelFor = (p: (typeof positions)[number]) => {
      const meta = SYMBOL_META[p.symbol as Symbol_];
      const size = toNumber(p.size);
      const sized = meta.unit === "lots" ? `${size.toFixed(2)} lots` : `${size.toLocaleString("en-US")} ${meta.unit}`;
      return `${p.symbol} ${p.side.toLowerCase()} ${sized} · ${p.account.name}`;
    };

    return events.map((e) => {
      const touched = positions.filter(
        (p) => e.positionIds.includes(p.id) || e.symbols.includes(p.symbol),
      );
      return {
        id: e.id,
        time: e.time.toISOString(),
        source: e.source,
        kind: e.kind,
        headline: e.headline,
        body: e.body,
        symbols: e.symbols as Symbol_[],
        impact: e.impact,
        direction: e.direction,
        touches: touched.map(labelFor),
      };
    });
  }
}
