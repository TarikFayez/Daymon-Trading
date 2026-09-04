import { NextResponse } from "next/server";

import { AnnotationError, parseAnnotationItems } from "@/lib/annotations";
import { logger } from "@/lib/logger";
import { providers } from "@/lib/providers";
import { isSymbol, isTimeframe } from "@/lib/symbols";

export const dynamic = "force-dynamic";

/** GET /api/annotations?symbol=XAGUSD&tf=1h */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "";
  const tf = url.searchParams.get("tf") ?? "";

  if (!isSymbol(symbol)) {
    return NextResponse.json({ error: `unknown symbol: ${symbol}` }, { status: 400 });
  }
  if (!isTimeframe(tf)) {
    return NextResponse.json({ error: `unknown timeframe: ${tf}` }, { status: 400 });
  }

  const sets = await providers.annotations.list(symbol, tf);
  return NextResponse.json({ symbol, tf, sets });
}

/** POST /api/annotations — body: { symbol, tf, items: [...], note? } */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body must be an object" }, { status: 400 });
  }

  const { symbol, tf, items, note } = body as Record<string, unknown>;

  if (typeof symbol !== "string" || !isSymbol(symbol)) {
    return NextResponse.json({ error: `unknown symbol: ${String(symbol)}` }, { status: 400 });
  }
  if (typeof tf !== "string" || !isTimeframe(tf)) {
    return NextResponse.json({ error: `unknown timeframe: ${String(tf)}` }, { status: 400 });
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return NextResponse.json({ error: "note must be a string" }, { status: 400 });
  }

  try {
    const parsed = parseAnnotationItems(items);
    const set = await providers.annotations.create({
      symbol,
      tf,
      items: parsed,
      note: (note as string | null | undefined) ?? null,
    });
    logger.info({ symbol, tf, items: parsed.length, id: set.id }, "annotation set created");
    return NextResponse.json({ set }, { status: 201 });
  } catch (err) {
    if (err instanceof AnnotationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error({ err }, "annotation create failed");
    return NextResponse.json({ error: "could not save annotations" }, { status: 500 });
  }
}
