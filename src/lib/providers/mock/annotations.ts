import type { AnnotationItem, AnnotationSet } from "@/lib/annotations";
import { prisma } from "@/lib/prisma";
import type { AnnotationProvider } from "@/lib/providers/types";
import type { Symbol_, Timeframe } from "@/lib/symbols";

export class MockAnnotationProvider implements AnnotationProvider {
  async list(symbol: Symbol_, tf: Timeframe): Promise<AnnotationSet[]> {
    const rows = await prisma.annotation.findMany({
      where: { symbol, tf },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toView);
  }

  async create(input: {
    symbol: Symbol_;
    tf: Timeframe;
    items: AnnotationItem[];
    note?: string | null;
  }): Promise<AnnotationSet> {
    const row = await prisma.annotation.create({
      data: {
        symbol: input.symbol,
        tf: input.tf,
        items: input.items as unknown as object,
        note: input.note ?? null,
      },
    });
    return toView(row);
  }
}

function toView(row: {
  id: string;
  symbol: string;
  tf: string;
  items: unknown;
  note: string | null;
  createdAt: Date;
}): AnnotationSet {
  return {
    id: row.id,
    symbol: row.symbol,
    tf: row.tf,
    items: (row.items as AnnotationItem[]) ?? [],
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
