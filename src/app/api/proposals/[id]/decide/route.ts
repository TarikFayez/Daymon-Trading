import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { providers } from "@/lib/providers";
import { ProposalError } from "@/lib/providers/mock/agent";

export const dynamic = "force-dynamic";

/**
 * POST /api/proposals/:id/decide — body: { decision: "APPROVE" | "REJECT", reason? }
 *
 * The one-click path. APPROVE walks the proposal through APPROVED → SENT →
 * FILLED and opens the position; REJECT records why. Anything not in PROPOSED
 * comes back 409 so a double-tap cannot send twice.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const { decision, reason } = (body ?? {}) as Record<string, unknown>;

  if (decision !== "APPROVE" && decision !== "REJECT") {
    return NextResponse.json({ error: "decision must be APPROVE or REJECT" }, { status: 400 });
  }
  if (reason !== undefined && typeof reason !== "string") {
    return NextResponse.json({ error: "reason must be a string" }, { status: 400 });
  }

  try {
    const proposal = await providers.agent.decide(id, decision, reason);
    return NextResponse.json({ proposal });
  } catch (err) {
    if (err instanceof ProposalError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err, id, decision }, "proposal decision failed");
    return NextResponse.json({ error: "could not process the decision" }, { status: 500 });
  }
}
